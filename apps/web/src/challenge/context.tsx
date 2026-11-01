import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, isApiError } from '../api/client';
import { useSetAttemptView } from '../api/queries';
import type { AnswerResponse, AttemptMode, AttemptView } from '../api/types';
import { dequeue, enqueue, forAttempt, loadQueue, pendingKey, saveQueue, type PendingAnswer } from '../lib/answerQueue';

type Flush = () => Promise<void>;

interface AttemptCtx {
  attemptId: string;
  mode: AttemptMode;
  /** AI explanations allowed (quest mode, championships with help). */
  helpAllowed: boolean;
  /** Nothing can be changed (submitted, section closed…). */
  readOnly: boolean;
  setView: (v: AttemptView) => void;
  /** Called when the server says time is up (exam): the page refetches the attempt. */
  onTimeUp: () => void;
  /** Writing editors register a flush so submit / finish section can save first. */
  registerFlush: (key: string, fn: Flush) => () => void;
  flushAll: () => Promise<void>;
  /** Sends an answer; when offline the answer is queued and sent again automatically. */
  sendAnswer: (itemId: string, questionId: string, value: number | string) => Promise<AnswerResponse | 'queued'>;
  pending: Set<string>;
}

const Ctx = createContext<AttemptCtx | null>(null);

export function AttemptProvider({ attemptId, mode, helpAllowed, readOnly, onTimeUp, children }: { attemptId: string; mode: AttemptMode; helpAllowed: boolean; readOnly: boolean; onTimeUp: () => void; children: ReactNode }) {
  const setView = useSetAttemptView();
  const flushes = useRef(new Map<string, Flush>());
  const [pendingList, setPendingList] = useState<PendingAnswer[]>(() => forAttempt(loadQueue(), attemptId));
  const timeUp = useRef(onTimeUp);
  timeUp.current = onTimeUp;

  const registerFlush = useCallback((key: string, fn: Flush) => {
    flushes.current.set(key, fn);
    return () => {
      if (flushes.current.get(key) === fn) flushes.current.delete(key);
    };
  }, []);
  const flushAll = useCallback(async () => {
    await Promise.all([...flushes.current.values()].map((f) => f().catch(() => undefined)));
  }, []);

  const updateQueue = useCallback(
    (fn: (q: PendingAnswer[]) => PendingAnswer[]) => {
      const next = fn(loadQueue());
      saveQueue(next);
      setPendingList(forAttempt(next, attemptId));
    },
    [attemptId],
  );

  const sendAnswer = useCallback(
    async (itemId: string, questionId: string, value: number | string) => {
      const entry: PendingAnswer = { attemptId, itemId, questionId, value, at: new Date().toISOString() };
      try {
        const r = await api.post<AnswerResponse>(`/api/attempts/${attemptId}/answers`, { itemId, questionId, value });
        setView(r);
        updateQueue((q) => dequeue(q, pendingKey(entry)));
        return r;
      } catch (e) {
        if (isApiError(e, 'NETWORK')) {
          updateQueue((q) => enqueue(q, entry));
          return 'queued' as const;
        }
        if (isApiError(e, 'TIME_UP') || isApiError(e, 'SESSION_NOT_ACTIVE')) timeUp.current();
        throw e;
      }
    },
    [attemptId, setView, updateQueue],
  );

  // Re-send queued answers when the connection comes back (and every 15 s while some are waiting).
  const retrying = useRef(false);
  const retry = useCallback(async () => {
    if (retrying.current || readOnly) return;
    const list = forAttempt(loadQueue(), attemptId);
    if (!list.length) return;
    retrying.current = true;
    try {
      for (const p of list) {
        try {
          const r = await api.post<AnswerResponse>(`/api/attempts/${attemptId}/answers`, { itemId: p.itemId, questionId: p.questionId, value: p.value });
          setView(r);
          updateQueue((q) => dequeue(q, pendingKey(p)));
        } catch (e) {
          if (isApiError(e, 'NETWORK')) break;
          // Already answered (quest mode), section closed, invalid…: the server state wins.
          updateQueue((q) => dequeue(q, pendingKey(p)));
          if (isApiError(e, 'TIME_UP') || isApiError(e, 'SESSION_NOT_ACTIVE')) timeUp.current();
        }
      }
    } finally {
      retrying.current = false;
    }
  }, [attemptId, readOnly, setView, updateQueue]);

  useEffect(() => {
    const on = () => void retry();
    window.addEventListener('online', on);
    const timer = setInterval(on, 15_000);
    void retry();
    return () => {
      window.removeEventListener('online', on);
      clearInterval(timer);
    };
  }, [retry]);

  const pending = useMemo(() => new Set(pendingList.map((p) => `${p.itemId}:${p.questionId}`)), [pendingList]);
  const value = useMemo<AttemptCtx>(
    () => ({ attemptId, mode, helpAllowed, readOnly, setView, onTimeUp: () => timeUp.current(), registerFlush, flushAll, sendAnswer, pending }),
    [attemptId, mode, helpAllowed, readOnly, setView, registerFlush, flushAll, sendAnswer, pending],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAttemptCtx(): AttemptCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAttemptCtx outside AttemptProvider');
  return c;
}
