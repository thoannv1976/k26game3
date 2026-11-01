import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import type { Assessment, CriterionScore, ResultsResponse, RubricResult } from '../../api/types';
import { RecordingPlayer, ResultsView } from '../../results/ResultsView';
import { SkillChip } from '../../components/game';
import { Alert, Button, Card, ConfirmModal, ErrorBox, Field, Input, PageSkeleton, SectionTitle, Spinner, Textarea } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { errorMessage, validationIssues } from '../../i18n/errors';
import { CRITERIA_MAX } from '../../lib/game';

type Scores = Record<string, Record<string, string>>;

function initialScores(a: Assessment): Scores {
  const out: Scores = {};
  for (const r of a.items) {
    if (r.skill !== 'writing' && r.skill !== 'speaking') continue;
    out[r.itemId] = Object.fromEntries(Object.entries(r.criteria).map(([k, c]) => [k, c.score === null ? '' : String(c.score)]));
  }
  return out;
}

function ReviewForm({ id, data }: { id: string; data: ResultsResponse & { assessment: Assessment } }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const a = data.assessment;
  const [scores, setScores] = useState<Scores>(() => initialScores(a));
  const [comment, setComment] = useState(a.teacherReview?.comment ?? '');
  useEffect(() => {
    setScores(initialScores(a));
    setComment(a.teacherReview?.comment ?? '');
  }, [a]);
  const rubric = a.items.filter((r): r is RubricResult => r.skill === 'writing' || r.skill === 'speaking');
  const aiOf = (itemId: string, k: string) => (a.aiItems.find((x) => x.itemId === itemId) as RubricResult | undefined)?.criteria[k];
  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, Record<string, number>> = {};
      for (const [itemId, cs] of Object.entries(scores)) {
        for (const [k, v] of Object.entries(cs)) {
          if (v.trim() === '') continue;
          (body[itemId] ??= {})[k] = Number(v);
        }
      }
      return api.put<{ assessment: Assessment }>(`/api/teacher/assessments/${id}/review`, { scores: body, comment });
    },
    onSuccess: (r) => {
      qc.setQueryData<ResultsResponse>(['teacher-attempt', id], (old) => (old ? { ...old, assessment: r.assessment } : old));
      void qc.invalidateQueries({ queryKey: ['review-queue'] });
      toast.success(t('review.saved'));
    },
  });
  if (!rubric.length) return null;
  const item = (itemId: string) => data.items.find((i) => i.id === itemId);
  return (
    <Card className="space-y-4" data-testid="review-form">
      <SectionTitle>👩‍🏫 {t('review.title')}</SectionTitle>
      <p className="text-sm text-muted">{t('review.hint')}</p>
      {rubric.map((r) => {
        const it = item(r.itemId);
        return (
          <fieldset key={r.itemId} className="space-y-3 rounded-2xl border border-line p-3">
            <legend className="flex items-center gap-2 px-1 font-semibold">
              <SkillChip skill={r.skill} /> <span lang="en">{it?.title ?? r.itemId}</span>
            </legend>
            {it?.skill === 'speaking' && (
              <ul className="space-y-2">
                {it.recordings.map((rec, i) =>
                  rec.audioUrl ? (
                    <li key={rec.partId} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-semibold">{t('speaking.part', { n: i + 1 })}</span>
                      <RecordingPlayer url={rec.audioUrl} label={t('results.playRecording')} />
                    </li>
                  ) : null,
                )}
              </ul>
            )}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Object.keys(CRITERIA_MAX[r.skill]).map((k) => {
                const c = r.criteria[k] as CriterionScore | undefined;
                if (!c) return null;
                const ai = aiOf(r.itemId, k);
                return (
                  <Field
                    key={k}
                    label={`${t(`criteria.${k}`)} (/${c.max})`}
                    hint={ai?.score !== null && ai?.score !== undefined ? t('review.aiScore', { score: ai.score, source: t(`results.source.${ai.source}`) }) : c.status === 'pending_review' ? t('results.pendingTeacher') : t('results.notAssessed')}
                  >
                    {(fid) => (
                      <Input
                        id={fid}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={c.max}
                        step={0.5}
                        data-testid={`score-${r.itemId}-${k}`}
                        value={scores[r.itemId]?.[k] ?? ''}
                        onChange={(e) => setScores((s) => ({ ...s, [r.itemId]: { ...s[r.itemId], [k]: e.target.value } }))}
                      />
                    )}
                  </Field>
                );
              })}
            </div>
          </fieldset>
        );
      })}
      <Field label={t('review.comment')}>{(fid) => <Textarea id={fid} value={comment} maxLength={3000} onChange={(e) => setComment(e.target.value)} />}</Field>
      {save.isError && (
        <Alert tone="danger">
          {errorMessage(t, save.error)}
          {validationIssues(save.error).map((i, n) => (
            <div key={n} className="text-xs">
              {i.message}
            </div>
          ))}
        </Alert>
      )}
      <Button onClick={() => save.mutate()} loading={save.isPending} data-testid="save-review">
        {a.teacherReview ? t('review.update') : t('review.confirm')}
      </Button>
    </Card>
  );
}

export default function AttemptReviewPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [confirmRelease, setConfirmRelease] = useState(false);
  const q = useQuery({
    queryKey: ['teacher-attempt', id],
    queryFn: () => api.get<ResultsResponse>(`/api/teacher/attempts/${id}`),
    refetchInterval: (query) => (query.state.data && query.state.data.status !== 'graded' ? 2500 : false),
  });
  const regrade = useMutation({
    mutationFn: () => api.post<{ status: string }>(`/api/teacher/assessments/${id}/regrade`),
    onSuccess: () => {
      toast.success(t('review.regraded'));
      void q.refetch();
    },
    onError: (e) => toast.error(errorMessage(t, e)),
  });
  const release = useMutation({
    mutationFn: () => api.post<{ released: number }>('/api/teacher/exams/release', { attemptIds: [id] }),
    onSuccess: (r) => {
      setConfirmRelease(false);
      toast.success(t('teacher.released', { count: r.released }));
      void q.refetch();
      void qc.invalidateQueries({ queryKey: ['teacher-class'] });
    },
    onError: (e) => toast.error(errorMessage(t, e)),
  });
  if (q.isPending) return <PageSkeleton />;
  if (q.isError) return <ErrorBox error={q.error} onRetry={() => void q.refetch()} />;
  const d = q.data;
  if (d.status !== 'graded' || !d.assessment)
    return (
      <Card className="mx-auto flex max-w-lg items-center gap-3">
        <Spinner /> {t('results.grading')}
      </Card>
    );
  const data = { ...d, assessment: d.assessment };
  const a = d.assessment;
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={() => nav(-1)} className="inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline">
          ← {t('common.back')}
        </button>
        <div className="flex flex-wrap gap-2">
          {a.mode === 'exam' && d.answersReleased === false && (
            <Button variant="secondary" onClick={() => setConfirmRelease(true)} data-testid="release-attempt">
              🔓 {t('teacher.release')}
            </Button>
          )}
          {a.items.some((r) => r.skill === 'writing' || r.skill === 'speaking') && (
            <Button variant="secondary" onClick={() => regrade.mutate()} loading={regrade.isPending}>
              🔁 {t('review.regrade')}
            </Button>
          )}
        </div>
      </div>
      <ReviewForm id={id} data={data} />
      <ResultsView data={data} staff />
      <ConfirmModal open={confirmRelease} onClose={() => setConfirmRelease(false)} onConfirm={() => release.mutate()} loading={release.isPending} title={t('teacher.releaseTitle')} confirmLabel={t('teacher.release')}>
        <p>{t('teacher.releaseConfirm')}</p>
      </ConfirmModal>
    </div>
  );
}
