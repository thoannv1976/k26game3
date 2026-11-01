/**
 * Offline answer queue: when an answer cannot be sent (no connection) it is kept in the browser and sent again
 * when the connection returns. Only the latest value per question is kept; the queue never throws.
 */
import { getStored, setStored } from './storage';

export interface PendingAnswer {
  attemptId: string;
  itemId: string;
  questionId: string;
  value: number | string;
  at: string;
}

export const QUEUE_KEY = 'vq.pendingAnswers';
export const pendingKey = (a: Pick<PendingAnswer, 'attemptId' | 'itemId' | 'questionId'>) => `${a.attemptId}:${a.itemId}:${a.questionId}`;

/** Adds or replaces the pending answer for the same question. */
export function enqueue(queue: PendingAnswer[], a: PendingAnswer): PendingAnswer[] {
  return [...queue.filter((x) => pendingKey(x) !== pendingKey(a)), a];
}

export function dequeue(queue: PendingAnswer[], key: string): PendingAnswer[] {
  return queue.filter((x) => pendingKey(x) !== key);
}

export function forAttempt(queue: PendingAnswer[], attemptId: string): PendingAnswer[] {
  return queue.filter((x) => x.attemptId === attemptId);
}

export function parseQueue(raw: string | null): PendingAnswer[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter(
      (x): x is PendingAnswer =>
        Boolean(x) && typeof x.attemptId === 'string' && typeof x.itemId === 'string' && typeof x.questionId === 'string' && (typeof x.value === 'string' || typeof x.value === 'number'),
    );
  } catch {
    return [];
  }
}

export function loadQueue(): PendingAnswer[] {
  return parseQueue(getStored(QUEUE_KEY));
}

export function saveQueue(q: PendingAnswer[]) {
  setStored(QUEUE_KEY, JSON.stringify(q.slice(-200)));
}
