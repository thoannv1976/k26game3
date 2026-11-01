import { useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, isApiError } from '../../api/client';
import { qk } from '../../api/queries';
import type { Assessment, ResultsResponse } from '../../api/types';
import { useAuth } from '../../auth/AuthProvider';
import { Disclaimer } from '../../components/game';
import { ButtonLink, Card, ErrorBox, PageSkeleton, Spinner } from '../../components/ui';
import { ResultsView } from '../../results/ResultsView';

export default function ResultsPage() {
  const { attemptId = '' } = useParams();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { refetchMe } = useAuth();
  const q = useQuery({
    queryKey: qk.results(attemptId),
    queryFn: () => api.get<ResultsResponse>(`/api/attempts/${attemptId}/results`),
    // Grading runs asynchronously: poll while the attempt is submitted / being graded.
    refetchInterval: (query) => (query.state.data && (query.state.data.status === 'submitted' || query.state.data.status === 'grading') ? 2000 : false),
    staleTime: 0,
  });
  const firstStatus = useRef<string | null>(null);
  if (q.data && firstStatus.current === null) firstStatus.current = q.data.status;
  const graded = q.data?.status === 'graded';

  useEffect(() => {
    if (!graded) return;
    void qc.invalidateQueries({ queryKey: qk.world });
    refetchMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graded]);

  if (q.isPending) return <PageSkeleton />;
  if (q.isError) {
    if (isApiError(q.error, 'SESSION_NOT_ACTIVE'))
      return (
        <Card className="mx-auto max-w-xl space-y-3 text-center">
          <p>{t('results.notSubmitted')}</p>
          <ButtonLink to={`/play/${attemptId}`}>{t('quest.continue')}</ButtonLink>
        </Card>
      );
    return <ErrorBox error={q.error} onRetry={() => void q.refetch()} />;
  }
  const d = q.data;
  if (d.status !== 'graded' || !d.assessment) {
    return (
      <Card className="mx-auto max-w-xl space-y-4 text-center" data-testid="grading">
        <div className="flex justify-center">
          <Spinner className="h-10 w-10 text-primary" />
        </div>
        <h1 className="font-display text-xl font-extrabold" aria-live="polite">
          {t('results.grading')}
        </h1>
        <p className="text-sm text-muted">{t('results.gradingHint')}</p>
        <Disclaimer />
      </Card>
    );
  }
  const a = d.assessment as Assessment;
  // Celebrate only when the student watched the grading finish (not when re-opening old results).
  const celebrate = firstStatus.current !== 'graded' || (Date.now() - Date.parse(a.createdAt) < 60_000);
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <ResultsView data={{ ...d, assessment: a }} celebrate={celebrate} />
      <div className="flex flex-wrap justify-center gap-2">
        <ButtonLink to="/world" data-testid="back-to-world">
          🗺️ {t('results.backToWorld')}
        </ButtonLink>
        {a.mode !== 'exam' && (
          <ButtonLink variant="secondary" to={`/quests/${a.refId}`}>
            🔁 {t('results.tryAgain')}
          </ButtonLink>
        )}
        <ButtonLink variant="secondary" to="/profile">
          📊 {t('nav.profile')}
        </ButtonLink>
        <Link to="/coach" className="inline-flex min-h-11 items-center px-3 text-sm font-semibold text-primary hover:underline">
          🤖 {t('results.askCoach')}
        </Link>
      </div>
    </div>
  );
}
