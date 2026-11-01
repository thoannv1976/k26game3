import { useCallback, useEffect, useId, useReducer, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, isApiError } from '../api/client';
import { qk } from '../api/queries';
import type { WritingDraft, WritingView } from '../api/types';
import { Alert, Button, cx } from '../components/ui';
import { useLocalized } from '../i18n';
import { clearBackup, draftReducer, initDraft, readBackup, shouldAutosave, writeBackup, type DraftState, type ServerDraft } from '../lib/draft';
import { wordCount, wordTarget } from '../lib/text';
import { useAttemptCtx } from './context';

const AUTOSAVE_MS = 2000;

/** Writing task with live word count and versioned autosave (debounce, on blur, before submit; local backup). */
export function WritingTask({ item }: { item: WritingView }) {
  const { t } = useTranslation();
  const { L } = useLocalized();
  const ctx = useAttemptCtx();
  const qc = useQueryClient();
  const id = useId();
  const key = `${ctx.attemptId}:${item.id}`;
  const server: ServerDraft = item.draft ?? { text: '', version: 0, updatedAt: null };
  const [s, dispatch] = useReducer(draftReducer, undefined, () => initDraft(server, readBackup(key)));
  const sRef = useRef<DraftState>(s);
  sRef.current = s;
  const inflight = useRef<Promise<void> | null>(null);

  const save = useCallback(async (): Promise<void> => {
    if (inflight.current) await inflight.current;
    const cur = sRef.current;
    if (!shouldAutosave(cur) || ctx.readOnly) return;
    const text = cur.text;
    dispatch({ type: 'saveStart' });
    const run = (async () => {
      try {
        const r = await api.put<{ draft: WritingDraft }>(`/api/attempts/${ctx.attemptId}/writing/${item.id}`, { text, baseVersion: cur.version });
        dispatch({ type: 'saveSuccess', draft: r.draft, sentText: text });
        if (sRef.current.text === text) clearBackup(key);
        void qc.invalidateQueries({ queryKey: qk.attempt(ctx.attemptId) });
      } catch (e) {
        if (isApiError(e, 'DRAFT_CONFLICT')) {
          const c = (e.details as { current?: WritingDraft } | undefined)?.current;
          dispatch({ type: 'conflict', server: { text: c?.text ?? '', version: c?.version ?? cur.version + 1, updatedAt: c?.updatedAt ?? null } });
        } else if (isApiError(e, 'NETWORK')) dispatch({ type: 'saveFailed', offline: true });
        else {
          dispatch({ type: 'saveFailed', offline: false });
          if (isApiError(e, 'TIME_UP') || isApiError(e, 'SESSION_NOT_ACTIVE')) ctx.onTimeUp();
        }
      }
    })();
    inflight.current = run;
    await run;
    inflight.current = null;
  }, [ctx, item.id, key, qc]);

  // Debounced autosave + local backup on every edit.
  useEffect(() => {
    if (s.text !== s.savedText) writeBackup(key, s);
    if (!shouldAutosave(s)) return;
    const timer = setTimeout(() => void save(), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [s, key, save]);

  useEffect(() => ctx.registerFlush(key, save), [ctx, key, save]);
  useEffect(() => {
    const on = () => {
      dispatch({ type: 'online' });
      void save();
    };
    window.addEventListener('online', on);
    return () => window.removeEventListener('online', on);
  }, [save]);

  const words = wordCount(s.text);
  const target = wordTarget(words, item.task.minWords, item.task.maxWords);
  const statusText = {
    idle: '',
    dirty: t('writing.unsaved'),
    saving: t('common.saving'),
    saved: t('writing.saved'),
    offline: t('writing.offline'),
    error: t('writing.error'),
    conflict: t('writing.conflictShort'),
  }[s.status];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{L(item.instructions)}</p>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="space-y-3">
          {item.task.input && (
            <article className="rounded-2xl border border-line bg-surface p-4 font-serif text-sm whitespace-pre-line shadow-sm" lang="en" aria-label={t('writing.inputLabel')}>
              {item.task.input}
            </article>
          )}
          <div className="rounded-2xl border border-writing/40 bg-writing-soft p-4" lang="en">
            <p className="text-xs font-bold tracking-wide text-writing uppercase">{t('writing.task')}</p>
            <p className="mt-1 whitespace-pre-line">{item.task.prompt}</p>
          </div>
          <ul className="flex flex-wrap gap-2 text-xs text-muted">
            <li className="rounded-full bg-surface-2 px-2.5 py-1">{t('writing.wordsTarget', { min: item.task.minWords, max: item.task.maxWords })}</li>
            <li className="rounded-full bg-surface-2 px-2.5 py-1">{t('writing.suggestedTime', { count: item.task.timeMinutes })}</li>
          </ul>
        </div>
        <div className="space-y-2">
          {s.conflict && (
            <Alert tone="warn">
              <p className="font-semibold">{t('writing.conflictTitle')}</p>
              <p className="mt-1">{t('writing.conflictBody')}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => dispatch({ type: 'useServer' })} data-testid="draft-use-server">
                  {t('writing.loadNewer')}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => dispatch({ type: 'keepMine' })}>
                  {t('writing.keepMine')}
                </Button>
              </div>
            </Alert>
          )}
          <label htmlFor={id} className="text-sm font-semibold">
            {t('writing.yourAnswer')}
          </label>
          <textarea
            id={id}
            data-testid={`writing-${item.id}`}
            lang="en"
            spellCheck={false}
            className="min-h-72 w-full rounded-2xl border border-line bg-surface p-4 leading-relaxed text-fg focus:border-primary focus:ring-2 focus:ring-primary/30 focus:outline-none disabled:opacity-70"
            value={s.text}
            disabled={ctx.readOnly}
            onChange={(e) => dispatch({ type: 'edit', text: e.target.value })}
            onBlur={() => void save()}
            aria-describedby={`${id}-count ${id}-status`}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span
              id={`${id}-count`}
              data-testid="word-count"
              className={cx('rounded-full px-2.5 py-0.5 font-semibold tabular-nums', target === 'ok' ? 'bg-success-soft text-success' : target === 'long' ? 'bg-danger-soft text-danger' : 'bg-surface-2 text-muted')}
            >
              {t('writing.wordCount', { count: words, min: item.task.minWords, max: item.task.maxWords })}
            </span>
            <span id={`${id}-status`} aria-live="polite" data-testid="draft-status" data-status={s.status} className={cx('text-xs', s.status === 'error' || s.status === 'conflict' ? 'text-danger' : s.status === 'offline' ? 'text-warn' : 'text-muted')}>
              {statusText}
            </span>
          </div>
          {target === 'short' && words > 0 && <p className="text-xs text-muted">{t('writing.tooShort', { count: item.task.minWords - words })}</p>}
          {target === 'long' && <p className="text-xs text-danger">{t('writing.tooLong')}</p>}
        </div>
      </div>
    </div>
  );
}
