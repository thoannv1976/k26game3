import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, isApiError } from '../../api/client';
import { useWorld } from '../../api/queries';
import type { CoachMessage } from '../../api/types';
import { Alert, Badge, Button, Card, ErrorBox, PageHeader, PageSkeleton, Textarea } from '../../components/ui';
import { useLocalized } from '../../i18n';
import { errorMessage } from '../../i18n/errors';
import { uuid } from '../../lib/uuid';

const SUGGESTIONS = ['listening', 'tfng', 'writing', 'speaking'] as const;

export default function CoachPage() {
  const { t } = useTranslation();
  const { L } = useLocalized();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['coach'], queryFn: () => api.get<{ messages: CoachMessage[] }>('/api/coach') });
  const world = useWorld();
  const [text, setText] = useState('');
  const [pending, setPending] = useState<{ id: string; question: string } | null>(null);
  const end = useRef<HTMLLIElement>(null);
  const ask = useMutation({
    mutationFn: (m: { id: string; question: string }) => api.post<{ message: CoachMessage }>('/api/coach', { clientMessageId: m.id, question: m.question }),
    onSuccess: (r) => {
      qc.setQueryData<{ messages: CoachMessage[] }>(['coach'], (old) => ({ messages: [...(old?.messages ?? []).filter((x) => x.id !== r.message.id), r.message] }));
      setPending(null);
    },
  });
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [q.data, pending]);

  const send = (question: string) => {
    const qn = question.trim();
    if (qn.length < 2 || ask.isPending) return;
    const m = { id: uuid(), question: qn };
    setPending(m);
    setText('');
    ask.mutate(m);
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    send(text);
  };
  const questTitle = (id: string) => L(world.data?.zones.flatMap((z) => z.quests).find((x) => x.id === id)?.title) || id;
  const disabled = isApiError(ask.error, 'HELP_DISABLED');

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title={<>🤖 {t('coach.title')}</>} subtitle={t('coach.subtitle')} />
      <Alert tone="neutral" className="text-sm">
        {t('coach.rules')}
      </Alert>
      {q.isPending ? (
        <PageSkeleton />
      ) : q.isError ? (
        <ErrorBox error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <Card className="space-y-4">
          <ol className="max-h-[60dvh] space-y-4 overflow-y-auto pr-1" aria-live="polite" aria-label={t('coach.conversation')}>
            {q.data.messages.length === 0 && !pending && <li className="text-center text-sm text-muted">{t('coach.empty')}</li>}
            {q.data.messages.map((m) => (
              <li key={m.id} className="space-y-2">
                <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2 text-primary-fg">{m.question}</div>
                <div className="max-w-[90%] space-y-2 rounded-2xl rounded-bl-sm bg-surface-2 px-4 py-3" data-testid="coach-answer">
                  {m.kind === 'refused' && <Badge tone="warn">{t('coach.refused')}</Badge>}
                  <p className="whitespace-pre-line">{m.answer}</p>
                  {m.suggestedQuestIds.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {m.suggestedQuestIds.map((id) => (
                        <Link key={id} to={`/quests/${id}`} className="rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary hover:underline">
                          🎯 {id} {questTitle(id)}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            ))}
            {pending && (
              <li className="space-y-2">
                <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2 text-primary-fg">{pending.question}</div>
                {ask.isPending && (
                  <div className="inline-flex gap-1 rounded-2xl bg-surface-2 px-4 py-3" aria-label={t('coach.thinking')}>
                    <span className="typing-dot h-2 w-2 rounded-full bg-muted" />
                    <span className="typing-dot h-2 w-2 rounded-full bg-muted" />
                    <span className="typing-dot h-2 w-2 rounded-full bg-muted" />
                  </div>
                )}
              </li>
            )}
            <li ref={end} aria-hidden="true" />
          </ol>
          {ask.isError && (
            <Alert tone={disabled ? 'warn' : 'danger'}>
              {errorMessage(t, ask.error)}{' '}
              {!disabled && pending && (
                <button type="button" className="font-semibold underline" onClick={() => ask.mutate(pending)}>
                  {t('common.retry')}
                </button>
              )}
            </Alert>
          )}
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => send(t(`coach.suggest.${s}`))} className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold hover:border-primary" disabled={ask.isPending}>
                {t(`coach.suggest.${s}`)}
              </button>
            ))}
          </div>
          <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label htmlFor="coach-input" className="sr-only">
              {t('coach.placeholder')}
            </label>
            <Textarea
              id="coach-input"
              value={text}
              maxLength={600}
              placeholder={t('coach.placeholder')}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send(text);
                }
              }}
              className="min-h-14 flex-1"
            />
            <Button type="submit" loading={ask.isPending} disabled={text.trim().length < 2} data-testid="coach-send">
              {t('coach.send')}
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
