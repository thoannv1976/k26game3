import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { CRITERION_KEYS, type CriterionKey, type GradedResults, type ResultsResponse, type SessionPayload } from '../../api/types';
import { useLocalized } from '../../i18n';
import { errorMessage } from '../../i18n/errors';
import { formatDate } from '../../lib/format';
import { Alert, Badge, Button, Card, ConfirmModal, ErrorBox, Field, Input, LevelBadge, PageHeader, PageSkeleton, SectionTitle, Skeleton, Textarea } from '../../components/ui';
import { CriteriaBars, FeedbackCard, SolutionCard, SourceBadge, WritingParts } from '../../components/results';
import { useToast } from '../../components/Toast';

function ReviewForm({ r, id }: { r: GradedResults; id: string }) {
  const { t } = useTranslation();
  const { lang } = useLocalized();
  const qc = useQueryClient();
  const toast = useToast();
  const a = r.assessment;
  const [scores, setScores] = useState<Partial<Record<CriterionKey, string>>>({});
  const [comment, setComment] = useState('');
  const [confirmRegrade, setConfirmRegrade] = useState(false);

  useEffect(() => {
    const init: Partial<Record<CriterionKey, string>> = {};
    for (const k of CRITERION_KEYS) {
      const v = a.teacherReview?.scores[k];
      init[k] = v === null || v === undefined ? '' : String(v);
    }
    setScores(init);
    setComment(a.teacherReview?.comment ?? '');
  }, [a]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['teacher-session', id] });
    void qc.invalidateQueries({ queryKey: ['teacher-class'] });
    void qc.invalidateQueries({ queryKey: ['teacher-student'] });
  };
  const save = useMutation({
    mutationFn: (body: { scores: Partial<Record<CriterionKey, number>>; comment: string }) => api.put(`/api/teacher/assessments/${id}/review`, body),
    onSuccess: () => {
      toast.success(t('review.saved'));
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(t, e)),
  });
  const regrade = useMutation({
    mutationFn: () => api.post<{ status: string }>(`/api/teacher/assessments/${id}/regrade`),
    onSuccess: (res) => {
      setConfirmRegrade(false);
      toast.success(t('review.regraded', { status: res.status }));
      invalidate();
    },
    onError: (e) => {
      setConfirmRegrade(false);
      toast.error(errorMessage(t, e));
    },
  });

  const parsed: Partial<Record<CriterionKey, number>> = {};
  const invalid: CriterionKey[] = [];
  for (const k of CRITERION_KEYS) {
    const raw = scores[k];
    if (raw === undefined || raw === '') continue;
    const n = Number(raw);
    const max = a.aiCriteria[k].max;
    if (!Number.isFinite(n) || n < 0 || n > max) invalid.push(k);
    else parsed[k] = n;
  }
  const confirmAi = () => {
    const s: Partial<Record<CriterionKey, number>> = {};
    for (const k of CRITERION_KEYS) {
      const v = a.aiCriteria[k].score;
      if (v !== null) s[k] = v;
    }
    save.mutate({ scores: s, comment });
  };

  return (
    <Card>
      <SectionTitle>{t('review.title')}</SectionTitle>
      <div className="mb-3 flex items-baseline justify-between text-sm">
        <span className="text-muted">{t('review.aiTotal')}</span>
        <span className="font-bold">{a.percent}%</span>
      </div>
      <div className="mb-4 flex items-baseline justify-between text-sm">
        <span className="text-muted">{t('review.finalTotal')}</span>
        <span className="text-xl font-bold">{a.finalPercent}%</span>
      </div>
      <ul className="space-y-3">
        {CRITERION_KEYS.map((k) => {
          const ai = a.aiCriteria[k];
          return (
            <li key={k} className="rounded-xl border border-line p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{t(`criteria.${k}`)}</span>
                <SourceBadge source={ai.source} />
              </div>
              <div className="mt-2 grid grid-cols-2 items-end gap-3">
                <div className="text-sm">
                  <div className="text-xs text-muted">{t('review.aiScore')}</div>
                  <div className="font-semibold">{ai.score !== null ? `${ai.score}/${ai.max}` : t('results.notAssessed')}</div>
                </div>
                <Field label={t('review.teacherScore', { max: ai.max })} error={invalid.includes(k) ? t('review.outOfRange', { max: ai.max }) : undefined}>
                  {(fid) => (
                    <Input
                      id={fid}
                      data-testid={`review-score-${k}`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={ai.max}
                      step={1}
                      value={scores[k] ?? ''}
                      placeholder={ai.score === null ? '—' : String(ai.score)}
                      onChange={(e) => setScores((s) => ({ ...s, [k]: e.target.value }))}
                    />
                  )}
                </Field>
              </div>
              {ai.comment && (
                <p className="mt-2 text-xs text-muted" lang="en">
                  {ai.comment}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <Field label={t('review.comment')} className="mt-4">
        {(fid) => <Textarea id={fid} data-testid="review-comment" value={comment} maxLength={3000} onChange={(e) => setComment(e.target.value)} />}
      </Field>
      {a.teacherReview && <p className="mt-2 text-xs text-muted">{t('review.lastReview', { name: a.teacherReview.reviewerName, date: formatDate(a.teacherReview.reviewedAt, lang, true) })}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button data-testid="review-save" onClick={() => save.mutate({ scores: parsed, comment })} loading={save.isPending} disabled={invalid.length > 0}>
          {t('review.save')}
        </Button>
        <Button variant="secondary" onClick={confirmAi} disabled={save.isPending}>
          ✓ {t('review.confirmAi')}
        </Button>
        <Button variant="ghost" data-testid="regrade" onClick={() => setConfirmRegrade(true)}>
          ↻ {t('review.regrade')}
        </Button>
      </div>
      <p className="mt-3 text-xs text-muted">{t('review.note')}</p>
      <ConfirmModal open={confirmRegrade} onClose={() => setConfirmRegrade(false)} onConfirm={() => regrade.mutate()} title={t('review.regradeTitle')} confirmLabel={t('review.regrade')} loading={regrade.isPending} confirmTestId="regrade-confirm">
        <p>{t('review.regradeBody')}</p>
      </ConfirmModal>
    </Card>
  );
}

function Trail({ p }: { p: SessionPayload }) {
  const { t } = useTranslation();
  const inv = p.investigation;
  const name = (cid: string) => inv.characters.find((c) => c.id === cid)?.name ?? cid;
  const hintsUsed = Object.entries(inv.hints).filter(([, h]) => h.used > 0);
  return (
    <Card className="space-y-5">
      <SectionTitle>🧭 {t('review.trail')}</SectionTitle>
      <details open>
        <summary className="cursor-pointer font-semibold">{t('review.interviewsTitle', { count: p.interviews.length })}</summary>
        {p.interviews.length === 0 ? (
          <p className="mt-2 text-sm text-muted">{t('review.noInterviews')}</p>
        ) : (
          <ul className="mt-2 space-y-2 text-sm" lang="en">
            {p.interviews.map((m) => (
              <li key={m.id} className="rounded-xl border border-line p-3">
                <div className="font-medium">
                  <span className="text-muted">→ {name(m.characterId)}:</span> {m.question}
                </div>
                <div className="mt-1">{m.reply}</div>
                {m.unlockedDocumentIds.length > 0 && <Badge tone="success">🔓 {m.unlockedDocumentIds.join(', ')}</Badge>}
              </li>
            ))}
          </ul>
        )}
      </details>
      <details open>
        <summary className="cursor-pointer font-semibold">{t('review.evidenceTitle', { count: inv.evidence.length })}</summary>
        <ul className="mt-2 space-y-2 text-sm">
          {inv.evidence.map((e) => (
            <li key={e.id} className="rounded-xl border border-line p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold" lang="en">
                  {e.label}
                </span>
                <Badge>{e.category ? t(`board.columns.${e.category}`) : t('review.uncategorized')}</Badge>
              </div>
              <p className="mt-1 text-muted italic" lang="en">
                “{e.text}”
              </p>
              {e.note && (
                <p className="mt-1" lang="en">
                  📝 {e.note}
                </p>
              )}
            </li>
          ))}
        </ul>
        {inv.links.length > 0 && (
          <ul className="mt-2 text-sm" lang="en">
            {inv.links.map((l) => (
              <li key={`${l.a}-${l.b}`}>
                🧵 {inv.evidence.find((e) => e.id === l.a)?.label} ⟷ {inv.evidence.find((e) => e.id === l.b)?.label}
                {l.note && <span className="text-muted"> – {l.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </details>
      {inv.clues.length > 0 && (
        <details>
          <summary className="cursor-pointer font-semibold">{t('review.cluesTitle', { count: inv.clues.length })}</summary>
          <ul className="mt-2 list-disc pl-5 text-sm" lang="en">
            {inv.clues.map((c) => (
              <li key={c.id}>“{c.text}”</li>
            ))}
          </ul>
        </details>
      )}
      {inv.conclusion.selected && (
        <div>
          <h3 className="font-semibold">{t('review.conclusionTitle')}</h3>
          <p className="text-sm" lang="en">
            {inv.conclusion.options.find((o) => o.id === inv.conclusion.selected!.optionId)?.text}
          </p>
          <p className="mt-1 text-sm text-muted" lang="en">
            {inv.conclusion.selected.justification}
          </p>
        </div>
      )}
      <details>
        <summary className="cursor-pointer font-semibold">{t('review.answersTitle')}</summary>
        <ul className="mt-2 space-y-1 text-sm" lang="en">
          {inv.questions.map((q) => (
            <li key={q.id}>
              <span className="text-muted">{q.prompt}</span> → <span className="font-medium">{q.answer ? (q.options && typeof q.answer.value === 'number' ? q.options[q.answer.value] : String(q.answer.value)) : '—'}</span>{' '}
              {q.answer?.correct === true ? '✓' : q.answer?.correct === false ? '✗' : ''}
            </li>
          ))}
        </ul>
      </details>
      {hintsUsed.length > 0 && (
        <div>
          <h3 className="font-semibold">{t('review.hintsTitle')}</h3>
          <p className="text-sm">{hintsUsed.map(([k, h]) => `${t(`hints.stages.${k as 'documents'}`)}: ${h.used}`).join(' · ')}</p>
        </div>
      )}
      <details>
        <summary className="cursor-pointer font-semibold">{t('review.notebookTitle')}</summary>
        <p className="mt-2 font-serif text-sm whitespace-pre-wrap" lang="en">
          {p.notebook.text || '—'}
        </p>
      </details>
      {p.session.status === 'active' && (
        <details open>
          <summary className="cursor-pointer font-semibold">{t('review.draftTitle', { version: p.draft.version })}</summary>
          <p className="mt-2 font-serif text-sm whitespace-pre-wrap" lang="en">
            {p.draft.text || '—'}
          </p>
        </details>
      )}
    </Card>
  );
}

export default function SessionReviewPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const { L, lang } = useLocalized();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['teacher-session', id], queryFn: () => api.get<ResultsResponse>(`/api/teacher/sessions/${id}`) });
  const proc = useQuery({ queryKey: ['teacher-session-process', id], queryFn: () => api.get<SessionPayload>(`/api/teacher/sessions/${id}/process`) });

  if (q.isPending) return <PageSkeleton />;
  if (q.isError) return <ErrorBox error={q.error} onRetry={() => void q.refetch()} />;
  const r = q.data;
  const graded = r.status === 'graded' ? r : null;
  const options = Object.fromEntries((proc.data?.investigation.questions ?? []).map((x) => [x.id, x.options]));
  const title = graded ? `${graded.case.id} · ${L(graded.case.title)}` : proc.data ? `${proc.data.investigation.caseId} · ${L(proc.data.investigation.title)}` : id;

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" className="-ml-3" onClick={() => navigate(-1)}>
        ← {t('common.back')}
      </Button>
      <PageHeader
        title={title}
        subtitle={graded ? formatDate(graded.report.submittedAt, lang, true) : t(`sessionStatus.${r.status}`)}
        actions={
          graded && (
            <div className="flex flex-wrap items-center gap-2">
              <LevelBadge level={graded.case.level} />
              {graded.assessment.solved ? <Badge tone="success">✓ {t('results.closed')}</Badge> : <Badge tone="warn">{t('results.unsolved')}</Badge>}
              {graded.assessment.teacherReview ? <Badge tone="success">✓ {t(`teacher.reviewStatus.${graded.assessment.teacherReview.status}`)}</Badge> : <Badge tone="warn">{t('teacher.toReview')}</Badge>}
            </div>
          )
        }
      />
      {!graded && <Alert>{t('review.notGraded')}</Alert>}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-6">
          {graded && (
            <>
              <Card className="space-y-5">
                <SectionTitle>{t('results.criteria')}</SectionTitle>
                <CriteriaBars a={graded.assessment} />
                <WritingParts a={graded.assessment} />
              </Card>
              <Card>
                <SectionTitle>📄 {t('review.report')}</SectionTitle>
                <div className="paper-plain rounded-xl border border-line p-4 font-serif leading-relaxed whitespace-pre-wrap" lang="en">
                  {graded.report.text}
                </div>
                <p className="mt-2 text-xs text-muted">{t('results.yourReport', { count: graded.report.wordCount })}</p>
              </Card>
            </>
          )}
          {proc.isPending ? <Skeleton className="h-64" /> : proc.isError ? <ErrorBox error={proc.error} onRetry={() => void proc.refetch()} /> : <Trail p={proc.data} />}
          {graded && <SolutionCard r={graded} options={options} />}
        </div>
        <div className="space-y-6">
          {graded && <ReviewForm r={graded} id={id} />}
          {graded && <FeedbackCard a={graded.assessment} />}
          {graded && graded.assessment.aiStatus !== 'ok' && <Alert>{t('results.noFeedback')}</Alert>}
        </div>
      </div>
    </div>
  );
}
