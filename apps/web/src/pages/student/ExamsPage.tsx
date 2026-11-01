import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { qk, useSetAttemptView, useWorld } from '../../api/queries';
import type { StartResponse } from '../../api/types';
import { Disclaimer, SkillChip } from '../../components/game';
import { Alert, Button, ButtonLink, Card, EmptyState, ErrorBox, PageHeader, PageSkeleton } from '../../components/ui';
import { useLocalized } from '../../i18n';
import { errorMessage } from '../../i18n/errors';

export default function ExamsPage() {
  const { t } = useTranslation();
  const { L } = useLocalized();
  const q = useWorld();
  if (q.isPending) return <PageSkeleton />;
  if (q.isError) return <ErrorBox error={q.error} onRetry={() => void q.refetch()} />;
  const exams = q.data.exams;
  return (
    <div className="space-y-5">
      <PageHeader title={<>🎓 {t('exam.title')}</>} subtitle={t('exam.subtitle')} />
      {exams.length === 0 ? (
        <EmptyState icon="🎓" title={t('exam.none')}>
          {t('exam.noneBody')}
        </EmptyState>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {exams.map((e) => (
            <li key={e.id}>
              <Card className="flex h-full flex-col gap-3">
                <div>
                  <p className="font-mono text-xs font-bold text-muted">
                    {e.id} · {e.level}
                  </p>
                  <h2 className="font-display text-xl font-extrabold">{L(e.title)}</h2>
                </div>
                <ol className="grid grid-cols-2 gap-2 text-sm">
                  {e.sections.map((s, i) => (
                    <li key={s.skill} className="flex items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2">
                      <span>
                        {i + 1}. <SkillChip skill={s.skill} />
                      </span>
                      <span className="text-muted tabular-nums">{t('common.minutes', { count: s.timeMinutes })}</span>
                    </li>
                  ))}
                </ol>
                <p className="text-sm text-muted">{t('exam.total', { count: e.totalMinutes })}</p>
                <div className="mt-auto">
                  {e.activeAttemptId ? (
                    <ButtonLink to={`/exam/${e.activeAttemptId}`} data-testid={`exam-resume-${e.id}`}>
                      ⏯️ {t('exam.resume')}
                    </ButtonLink>
                  ) : (
                    <ButtonLink to={`/exams/${e.id}`} data-testid={`exam-open-${e.id}`}>
                      {t('exam.open')}
                    </ButtonLink>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <Disclaimer />
    </div>
  );
}

/** Exam lobby: rules, sections and the "practice exam" disclaimer before starting. */
export function ExamLobbyPage() {
  const { examId = '' } = useParams();
  const [sp] = useSearchParams();
  const assignmentId = sp.get('assignment') ?? undefined;
  const { t } = useTranslation();
  const { L } = useLocalized();
  const nav = useNavigate();
  const qc = useQueryClient();
  const setView = useSetAttemptView();
  const q = useWorld();
  const start = useMutation({
    mutationFn: () => api.post<StartResponse>(`/api/exams/${examId}/attempts`, assignmentId ? { assignmentId } : {}),
    onSuccess: (r) => {
      setView(r);
      void qc.invalidateQueries({ queryKey: qk.world });
      nav(`/exam/${r.attempt.id}`);
    },
  });
  if (q.isPending) return <PageSkeleton />;
  if (q.isError) return <ErrorBox error={q.error} onRetry={() => void q.refetch()} />;
  const e = q.data.exams.find((x) => x.id === examId);
  if (!e) return <EmptyState icon="🎓" title={t('common.notFoundTitle')} action={<Link to="/exams" className="font-semibold text-primary underline">{t('nav.exams')}</Link>} />;
  const rules = ['server', 'sections', 'listenOnce', 'noHelp', 'autosave', 'answers'] as const;
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link to="/exams" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline">
        ← {t('nav.exams')}
      </Link>
      <Card className="space-y-4">
        <div>
          <p className="font-mono text-xs font-bold text-muted">{e.id}</p>
          <h1 className="font-display text-2xl font-extrabold">{L(e.title)}</h1>
        </div>
        <Alert tone="warn" className="text-sm">
          <strong>{t('exam.disclaimerTitle')}</strong> {L(e.disclaimer)}
        </Alert>
        <div>
          <h2 className="mb-2 font-semibold">{t('exam.sections')}</h2>
          <ol className="space-y-2">
            {e.sections.map((s, i) => (
              <li key={s.skill} className="flex items-center justify-between rounded-xl border border-line px-3 py-2">
                <span className="flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-primary-soft text-sm font-bold text-primary">{i + 1}</span>
                  <SkillChip skill={s.skill} />
                </span>
                <span className="text-sm text-muted">{t('common.minutes', { count: s.timeMinutes })}</span>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <h2 className="mb-2 font-semibold">{t('exam.rulesTitle')}</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {rules.map((r) => (
              <li key={r}>{t(`exam.rules.${r}`)}</li>
            ))}
          </ul>
        </div>
        {start.isError && <Alert tone="danger">{errorMessage(t, start.error)}</Alert>}
        <Button size="lg" onClick={() => start.mutate()} loading={start.isPending} data-testid="exam-begin">
          🚀 {e.activeAttemptId ? t('exam.resume') : t('exam.begin')}
        </Button>
      </Card>
    </div>
  );
}
