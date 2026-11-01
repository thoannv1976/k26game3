import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, isApiError } from '../../api/client';
import { qk, useAttempt, useSetAttemptView } from '../../api/queries';
import type { AttemptView, ItemView, SectionClock } from '../../api/types';
import { ChallengeView, itemProgress } from '../../challenge/ChallengeView';
import { AttemptProvider, useAttemptCtx } from '../../challenge/context';
import { Disclaimer, SkillChip } from '../../components/game';
import { Alert, Button, Card, ConfirmModal, ErrorBox, PageSkeleton, cx } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { useLocalized } from '../../i18n';
import { errorMessage } from '../../i18n/errors';
import { clockOffset, crossedMilestone, formatClock, secondsLeftAt, timerTone } from '../../lib/clock';

/** Server-corrected countdown for the current section. */
function useSectionClock(view: AttemptView | undefined, receivedAt: number, onZero: () => void) {
  const sec = view?.attempt.sections[view.attempt.currentSection];
  const offset = view ? clockOffset(view.attempt.serverNow, receivedAt) : 0;
  const deadline = sec?.startedAt && !sec.closedAt ? sec.deadline : null;
  const [left, setLeft] = useState<number | null>(() => secondsLeftAt(deadline, offset, Date.now()));
  const zero = useRef(onZero);
  zero.current = onZero;
  useEffect(() => {
    setLeft(secondsLeftAt(deadline, offset, Date.now()));
    if (!deadline) return;
    const timer = setInterval(() => setLeft(secondsLeftAt(deadline, offset, Date.now())), 1000);
    return () => clearInterval(timer);
  }, [deadline, offset]);
  // When the time is up, ask the server (it closes the section, with a 2 s grace) until the section changes.
  useEffect(() => {
    if (left !== 0) return;
    zero.current();
    const timer = setInterval(() => zero.current(), 3000);
    return () => clearInterval(timer);
  }, [left]);
  return left;
}

function SectionTrack({ sections, current }: { sections: SectionClock[]; current: number }) {
  const { t } = useTranslation();
  return (
    <ol className="grid grid-cols-4 gap-1.5" aria-label={t('exam.sections')}>
      {sections.map((s, i) => {
        const state = s.closedAt ? 'done' : i === current ? 'current' : 'upcoming';
        return (
          <li
            key={s.skill}
            aria-current={state === 'current' ? 'step' : undefined}
            className={cx(
              'rounded-xl border px-2 py-1.5 text-center text-xs font-semibold',
              state === 'done' && 'border-success/40 bg-success-soft text-success',
              state === 'current' && 'border-primary bg-primary-soft text-primary',
              state === 'upcoming' && 'border-line text-muted',
            )}
          >
            <span className="block">{state === 'done' ? '✓' : i + 1}</span>
            <span className="block truncate">{t(`skills.${s.skill}`)}</span>
          </li>
        );
      })}
    </ol>
  );
}

function unansweredCount(items: ItemView[]): number {
  return items.reduce((n, i) => {
    const p = itemProgress(i);
    return n + (p.total - p.done);
  }, 0);
}

function RunningSection({ view, left, onDone }: { view: AttemptView; left: number | null; onDone: (v: AttemptView) => void }) {
  const { t } = useTranslation();
  const ctx = useAttemptCtx();
  const [tab, setTab] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const sec = view.attempt.sections[view.attempt.currentSection]!;
  const items = view.items;
  const cur = items[Math.min(tab, items.length - 1)];
  const next = useMutation({
    mutationFn: async () => {
      await ctx.flushAll();
      return api.post<AttemptView>(`/api/attempts/${ctx.attemptId}/sections/next`);
    },
    onSuccess: (v) => {
      setConfirm(false);
      onDone(v);
    },
    onError: (e) => {
      if (isApiError(e, 'TIME_UP') || isApiError(e, 'SESSION_NOT_ACTIVE')) ctx.onTimeUp();
    },
  });
  const missing = unansweredCount(items);
  const lastSection = view.attempt.currentSection === view.attempt.sections.length - 1;
  return (
    <div className="space-y-4">
      {items.length > 1 && (
        <div className="-mx-4 overflow-x-auto px-4">
          <div className="flex min-w-max gap-2" role="tablist" aria-label={t('exam.parts')}>
            {items.map((i, n) => {
              const p = itemProgress(i);
              return (
                <button
                  key={i.id}
                  type="button"
                  role="tab"
                  aria-selected={n === tab}
                  onClick={() => setTab(n)}
                  data-testid={`exam-part-${n}`}
                  className={cx('min-h-11 rounded-2xl border-2 px-3 text-sm font-semibold', n === tab ? 'border-primary bg-primary-soft' : 'border-line bg-surface')}
                >
                  {t('exam.partN', { n: n + 1 })} <span className="text-xs text-muted tabular-nums">{p.done}/{p.total}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {cur && (
        <section role="tabpanel" aria-label={cur.title}>
          <h2 className="mb-3 font-display text-xl font-extrabold" lang="en">
            {cur.title}
          </h2>
          <ChallengeView key={cur.id} item={cur} />
        </section>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4">
        <div className="flex gap-2">
          <Button variant="secondary" disabled={tab === 0} onClick={() => setTab(tab - 1)}>
            ← {t('play.previous')}
          </Button>
          <Button variant="secondary" disabled={tab >= items.length - 1} onClick={() => setTab(tab + 1)}>
            {t('play.next')} →
          </Button>
        </div>
        <Button onClick={() => setConfirm(true)} data-testid="finish-section" disabled={left === 0}>
          {lastSection ? `🏁 ${t('exam.finishExam')}` : `${t('exam.finishSection')} →`}
        </Button>
      </div>
      {next.isError && <Alert tone="danger">{errorMessage(t, next.error)}</Alert>}
      <ConfirmModal
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => next.mutate()}
        loading={next.isPending}
        title={lastSection ? t('exam.finishExamTitle') : t('exam.finishSectionTitle', { skill: t(`skills.${sec.skill}`) })}
        confirmLabel={lastSection ? t('exam.finishExam') : t('exam.finishSection')}
        confirmTestId="confirm-finish"
      >
        <p>{t('exam.noGoingBack')}</p>
        {missing > 0 && <p className="font-semibold text-warn">{t('exam.unanswered', { count: missing })}</p>}
      </ConfirmModal>
    </div>
  );
}

export default function ExamPage() {
  const { attemptId = '' } = useParams();
  const { t } = useTranslation();
  const { L } = useLocalized();
  const nav = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const setView = useSetAttemptView();
  const q = useAttempt(attemptId);
  const view = q.data;
  const left = useSectionClock(view, q.dataUpdatedAt, () => void q.refetch());
  const prev = useRef<number | null>(null);
  const [announce, setAnnounce] = useState('');

  useEffect(() => {
    const m = crossedMilestone(prev.current, left);
    prev.current = left;
    if (m === 300 || m === 60) {
      const msg = t('exam.timeWarning', { count: m / 60 });
      setAnnounce(msg);
      toast.show(msg, 'warn');
    } else if (m === 0) {
      setAnnounce(t('exam.timeUp'));
      toast.show(t('exam.timeUp'), 'warn');
    }
  }, [left, t, toast]);

  const startSection = useMutation({
    mutationFn: () => api.post<AttemptView>(`/api/attempts/${attemptId}/sections/start`),
    onSuccess: (v) => setView(v),
    onError: () => void q.refetch(),
  });

  if (q.isPending) return <PageSkeleton />;
  if (q.isError) return <ErrorBox error={q.error} onRetry={() => void q.refetch()} />;
  const a = view!.attempt;
  if (a.mode !== 'exam') return <Navigate to={`/play/${a.id}`} replace />;
  if (a.status !== 'active') return <Navigate to={`/results/${a.id}`} replace />;
  const sec = a.sections[a.currentSection];
  if (!sec) return <Navigate to={`/results/${a.id}`} replace />;
  const running = Boolean(sec.startedAt && !sec.closedAt);
  const tone = timerTone(left);
  const examInfo = view!.exam?.sections.find((s) => s.skill === sec.skill);

  const onDone = (v: AttemptView) => {
    setView(v);
    if (v.attempt.status !== 'active') {
      void qc.invalidateQueries({ queryKey: qk.world });
      nav(`/results/${v.attempt.id}`);
    }
  };

  return (
    <AttemptProvider attemptId={a.id} mode="exam" helpAllowed={false} readOnly={!running || left === 0} onTimeUp={() => void q.refetch()}>
      <div className="space-y-4">
        <div className="sticky top-[57px] z-30 -mx-4 border-b border-line bg-canvas/95 px-4 py-2 backdrop-blur">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-muted">{view!.exam ? L(view!.exam.title) : a.title}</p>
              <p className="font-display font-extrabold">
                {t('exam.sectionN', { n: a.currentSection + 1, total: a.sections.length })} · {t(`skills.${sec.skill}`)}
              </p>
            </div>
            {running && left !== null && (
              <div
                role="timer"
                aria-label={t('exam.timeLeft')}
                data-testid="exam-timer"
                className={cx(
                  'rounded-2xl px-4 py-1.5 font-display text-2xl font-extrabold tabular-nums',
                  tone === 'normal' && 'bg-primary-soft text-primary',
                  tone === 'warn' && 'bg-warn-soft text-warn',
                  tone === 'danger' && 'animate-pulse bg-danger-soft text-danger',
                )}
              >
                ⏱ {formatClock(left)}
              </div>
            )}
          </div>
          <div className="mt-2">
            <SectionTrack sections={a.sections} current={a.currentSection} />
          </div>
          <p className="sr-only" aria-live="assertive">
            {announce}
          </p>
        </div>

        {!running ? (
          <Card className="mx-auto max-w-2xl space-y-4 text-center" data-testid="section-lobby">
            <div className="text-5xl" aria-hidden="true">
              {['🎧', '📖', '✍️', '🎤'][['listening', 'reading', 'writing', 'speaking'].indexOf(sec.skill)]}
            </div>
            <h1 className="font-display text-2xl font-extrabold">
              {t('exam.sectionN', { n: a.currentSection + 1, total: a.sections.length })}: <SkillChip skill={sec.skill} className="align-middle text-sm" />
            </h1>
            <p className="text-muted">{t('exam.sectionInfo', { minutes: sec.timeMinutes, parts: examInfo?.items ?? 1 })}</p>
            <ul className="mx-auto max-w-md list-disc space-y-1 pl-5 text-left text-sm">
              <li>{t('exam.lobby.timer')}</li>
              <li>{t(`exam.lobby.${sec.skill}`)}</li>
              <li>{t('exam.lobby.noBack')}</li>
            </ul>
            {startSection.isError && <Alert tone="danger">{errorMessage(t, startSection.error)}</Alert>}
            <Button size="lg" onClick={() => startSection.mutate()} loading={startSection.isPending} data-testid="start-section">
              ▶ {t('exam.startSection')}
            </Button>
          </Card>
        ) : (
          <RunningSection key={a.currentSection} view={view!} left={left} onDone={onDone} />
        )}
        {left === 0 && running && <Alert tone="warn">{t('exam.closing')}</Alert>}
        <Disclaimer />
      </div>
    </AttemptProvider>
  );
}
