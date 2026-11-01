import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { qk, useAttempt } from '../../api/queries';
import type { AttemptView } from '../../api/types';
import { ChallengeView, itemComplete, itemProgress } from '../../challenge/ChallengeView';
import { AttemptProvider, useAttemptCtx } from '../../challenge/context';
import { SkillChip } from '../../components/game';
import { Alert, Badge, Button, ErrorBox, PageSkeleton, cx } from '../../components/ui';
import { useLocalized } from '../../i18n';
import { errorMessage, submitBlockers } from '../../i18n/errors';
import { SKILL_META } from '../../lib/game';

function Stepper({ view, step, onStep }: { view: AttemptView; step: number; onStep: (i: number) => void }) {
  const { t } = useTranslation();
  const steps = view.challenges.length ? view.challenges : view.items.map((i) => ({ id: i.id, title: i.title, itemId: i.id }));
  return (
    <nav aria-label={t('play.challenges')} className="-mx-4 overflow-x-auto px-4">
      <ol className="flex min-w-max gap-2">
        {steps.map((c, i) => {
          const item = view.items.find((x) => x.id === c.itemId);
          const done = item ? itemComplete(item) : false;
          const p = item ? itemProgress(item) : { done: 0, total: 0 };
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onStep(i)}
                aria-current={i === step ? 'step' : undefined}
                data-testid={`step-${i}`}
                className={cx(
                  'flex min-h-11 items-center gap-2 rounded-2xl border-2 px-3 py-1.5 text-left text-sm transition',
                  i === step ? 'border-primary bg-primary-soft' : 'border-line bg-surface hover:border-primary/50',
                )}
              >
                <span className={cx('grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold', done ? 'bg-success text-white' : i === step ? 'bg-primary text-primary-fg' : 'bg-surface-2 text-muted')}>
                  {done ? '✓' : i + 1}
                </span>
                <span className="max-w-44 truncate font-semibold" lang="en">
                  {c.title}
                </span>
                {p.total > 1 && <span className="text-xs text-muted tabular-nums">{p.done}/{p.total}</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function SubmitBar({ view, onSubmitted }: { view: AttemptView; onSubmitted: () => void }) {
  const { t } = useTranslation();
  const ctx = useAttemptCtx();
  const qc = useQueryClient();
  const [blockers, setBlockers] = useState<string[] | null>(null);
  const submit = useMutation({
    mutationFn: async () => {
      await ctx.flushAll();
      return api.post<{ status: string }>(`/api/attempts/${ctx.attemptId}/submit`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.world });
      onSubmitted();
    },
    onError: (e) => {
      const b = submitBlockers(e);
      if (b.length) setBlockers(b);
      void qc.invalidateQueries({ queryKey: qk.attempt(ctx.attemptId) });
    },
  });
  const all = view.items.every(itemComplete);
  const list = blockers ?? view.attempt.blockers;
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold">{all ? t('play.readyToSubmit') : t('play.notReady')}</p>
          <p className="text-sm text-muted">{t('play.submitHint')}</p>
        </div>
        <Button size="lg" onClick={() => submit.mutate()} loading={submit.isPending} data-testid="submit-quest" disabled={ctx.readOnly}>
          🏁 {t('play.submit')}
        </Button>
      </div>
      {!all && list.length > 0 && (
        <ul className="mt-3 list-disc space-y-0.5 pl-5 text-sm text-muted" lang="en" data-testid="blockers">
          {list.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}
      {submit.isError && !submitBlockers(submit.error).length && <Alert tone="danger" className="mt-3">{errorMessage(t, submit.error)}</Alert>}
    </div>
  );
}

export default function PlayPage() {
  const { attemptId = '' } = useParams();
  const { t } = useTranslation();
  const { L } = useLocalized();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const q = useAttempt(attemptId);
  const top = useRef<HTMLDivElement>(null);
  const step = Math.max(0, Number(sp.get('step') ?? 0) || 0);

  useEffect(() => {
    top.current?.focus();
  }, [step]);

  if (q.isPending) return <PageSkeleton />;
  if (q.isError) return <ErrorBox error={q.error} onRetry={() => void q.refetch()} />;
  const view = q.data;
  const a = view.attempt;
  if (a.mode === 'exam') return <Navigate to={`/exam/${a.id}`} replace />;
  if (a.status !== 'active') return <Navigate to={`/results/${a.id}`} replace />;

  const steps = view.challenges.length ? view.challenges : view.items.map((i) => ({ id: i.id, title: i.title, itemId: i.id }));
  const cur = Math.min(step, steps.length - 1);
  const item = view.items.find((i) => i.id === steps[cur]?.itemId);
  const goto = (i: number) => setSp((p) => {
    const n = new URLSearchParams(p);
    n.set('step', String(i));
    return n;
  });
  const skill = view.quest?.skill ?? item?.skill ?? 'listening';
  const last = cur === steps.length - 1;

  return (
    <AttemptProvider attemptId={a.id} mode={a.mode} helpAllowed={a.helpAllowed} readOnly={false} onTimeUp={() => void q.refetch()}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Link to={view.quest ? `/quests/${view.quest.id}` : '/world'} className="inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline">
            ← {t('play.leave')}
          </Link>
          <span className="text-muted" aria-hidden="true">
            ·
          </span>
          <SkillChip skill={skill} />
          {a.mode === 'championship' && <Badge tone="warn">🏆 {t('play.championship')}</Badge>}
          {!a.helpAllowed && <Badge>{t('play.helpOff')}</Badge>}
        </div>
        <header className={cx('rounded-3xl bg-gradient-to-r p-4 text-white shadow-sm sm:p-5', SKILL_META[skill].gradient)}>
          <p className="font-mono text-xs font-bold opacity-90">{a.refId}</p>
          <h1 className="font-display text-2xl font-extrabold drop-shadow-sm">{view.quest ? L(view.quest.title) : a.title}</h1>
        </header>
        <Stepper view={view} step={cur} onStep={goto} />
        <div ref={top} tabIndex={-1} className="outline-none" aria-live="polite">
          <h2 className="font-display text-xl font-extrabold" lang="en">
            {t('play.challengeN', { n: cur + 1, total: steps.length })}: {steps[cur]?.title}
          </h2>
        </div>
        {item ? <ChallengeView key={item.id} item={item} /> : <Alert tone="danger">{t('common.notFoundTitle')}</Alert>}
        <div className="flex flex-wrap justify-between gap-2">
          <Button variant="secondary" disabled={cur === 0} onClick={() => goto(cur - 1)}>
            ← {t('play.previous')}
          </Button>
          {!last && (
            <Button onClick={() => goto(cur + 1)} data-testid="next-challenge">
              {t('play.next')} →
            </Button>
          )}
        </div>
        {last && <SubmitBar view={view} onSubmitted={() => nav(`/results/${a.id}`)} />}
        {!last && view.items.every(itemComplete) && (
          <Alert tone="success">
            {t('play.allDone')}{' '}
            <button type="button" className="font-semibold underline" onClick={() => goto(steps.length - 1)}>
              {t('play.goSubmit')}
            </button>
          </Alert>
        )}
      </div>
    </AttemptProvider>
  );
}

