import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import type { Assessment, CriterionScore, ItemFeedback, ItemResult, ResultItem, ResultsResponse, RubricResult } from '../api/types';
import { RevealBox, answerText } from '../challenge/QuestionCard';
import { Passage } from '../challenge/Objective';
import { BadgeShelf, Confetti, Disclaimer, ScoreRing, SkillChip, badgeName } from '../components/game';
import { Alert, Badge, Button, Card, SectionTitle, cx } from '../components/ui';
import { useLocalized } from '../i18n';
import { CRITERIA_MAX } from '../lib/game';

export function CriteriaTable({ result, skill }: { result: RubricResult; skill: 'writing' | 'speaking' }) {
  const { t } = useTranslation();
  const keys = Object.keys(CRITERIA_MAX[skill]);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-sm" data-testid={`criteria-${result.itemId}`}>
        <thead>
          <tr className="text-left text-xs text-muted uppercase">
            <th className="py-1.5 pr-2">{t('results.criterion')}</th>
            <th className="py-1.5 pr-2">{t('results.score')}</th>
            <th className="py-1.5">{t('results.comment')}</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => {
            const c = (result.criteria as Record<string, CriterionScore | undefined>)[k];
            if (!c) return null;
            return (
              <tr key={k} className="border-t border-line align-top">
                <td className="py-2 pr-2 font-semibold">{t(`criteria.${k}`)}</td>
                <td className="py-2 pr-2 whitespace-nowrap">
                  {c.status === 'assessed' && c.score !== null ? (
                    <span className="font-bold tabular-nums">
                      {c.score}/{c.max}
                    </span>
                  ) : c.status === 'pending_review' ? (
                    <Badge tone="warn">{t('results.pendingTeacher')}</Badge>
                  ) : (
                    <Badge>{t('results.notAssessed')}</Badge>
                  )}
                  <div className="mt-0.5 text-[11px] text-muted">{t(`results.source.${c.source}`)}</div>
                </td>
                <td className="py-2 text-muted" lang="en">
                  {c.comment}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function FeedbackBlock({ f }: { f: ItemFeedback }) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-3 md:grid-cols-2" data-testid="ai-feedback">
      {f.strengths.length > 0 && (
        <div className="rounded-xl bg-success-soft p-3">
          <h4 className="font-semibold text-success">💪 {t('results.strengths')}</h4>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm" lang="en">
            {f.strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      {f.improvements.length > 0 && (
        <div className="rounded-xl bg-warn-soft p-3">
          <h4 className="font-semibold text-warn">🎯 {t('results.improvements')}</h4>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm" lang="en">
            {f.improvements.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      {f.examples.length > 0 && (
        <div className="rounded-xl bg-surface-2 p-3 md:col-span-2">
          <h4 className="font-semibold">🔎 {t('results.examples')}</h4>
          <ul className="mt-1 space-y-2 text-sm">
            {f.examples.map((e, i) => (
              <li key={i}>
                <blockquote className="border-l-4 border-primary/50 pl-2 italic" lang="en">
                  “{e.quote}”
                </blockquote>
                <p className="mt-0.5 text-muted">{e.comment}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
      {f.corrections.length > 0 && (
        <div className="rounded-xl bg-surface-2 p-3 md:col-span-2">
          <h4 className="font-semibold">✏️ {t('results.corrections')}</h4>
          <ul className="mt-1 space-y-2 text-sm">
            {f.corrections.map((c, i) => (
              <li key={i} className="rounded-lg bg-surface p-2">
                <span className="text-danger line-through" lang="en">
                  {c.original}
                </span>{' '}
                → <span className="font-semibold text-success" lang="en">{c.corrected}</span>
                <p className="mt-0.5 text-muted" lang="vi">
                  {c.explanation}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
      {f.nextPractice.length > 0 && (
        <div className="rounded-xl bg-primary-soft/60 p-3 md:col-span-2">
          <h4 className="font-semibold text-primary">🧭 {t('results.nextPractice')}</h4>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
            {f.nextPractice.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Plays a protected recording: authenticated fetch → blob URL (only on request). */
export function RecordingPlayer({ url, label }: { url: string; label: string }) {
  const { t } = useTranslation();
  const [src, setSrc] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  useEffect(() => () => void (src && URL.revokeObjectURL(src)), [src]);
  if (src) return <audio src={src} controls autoPlay className="h-10 max-w-full" aria-label={label} />;
  return (
    <Button
      size="sm"
      variant="secondary"
      loading={state === 'loading'}
      data-testid="play-recording"
      onClick={async () => {
        setState('loading');
        try {
          const b = await api.blob(url);
          setSrc(URL.createObjectURL(b));
          setState('idle');
        } catch {
          setState('error');
        }
      }}
    >
      ▶ {state === 'error' ? t('results.recordingMissing') : label}
    </Button>
  );
}

function ObjectiveResult({ item, staff }: { item: Extract<ResultItem, { skill: 'listening' | 'reading' }>; staff: boolean }) {
  const { t } = useTranslation();
  const sourceLabel = item.skill === 'listening' ? t('question.fromRecording') : t('question.fromPassage');
  return (
    <div className="space-y-3">
      {item.skill === 'reading' && staff && (
        <details className="rounded-xl border border-line p-3">
          <summary className="cursor-pointer text-sm font-semibold">{t('results.showPassage')}</summary>
          <div className="mt-2">
            <Passage passage={item.passage} />
          </div>
        </details>
      )}
      <ol className="space-y-2">
        {item.questions.map((q, i) => (
          <li key={q.id} className="rounded-xl border border-line p-3 text-sm" data-testid={`result-q-${item.id}-${q.id}`}>
            <div className="flex items-start gap-2">
              <span className="font-bold">{i + 1}.</span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold" lang="en">
                  {q.prompt}
                </p>
                {q.statement && (
                  <p className="text-muted italic" lang="en">
                    “{q.statement}”
                  </p>
                )}
                <p className="mt-1">
                  {t('results.yourAnswer')}{' '}
                  {q.answer ? <span lang="en">{answerText(q, q.answer.value, t)}</span> : <em className="text-muted">{t('results.noAnswer')}</em>}
                  {q.answer?.correct === true && <span className="ml-2 font-bold text-success">✓</span>}
                  {q.answer?.correct === false && <span className="ml-2 font-bold text-danger">✗</span>}
                </p>
                {q.reveal && <RevealBox q={q} sourceLabel={sourceLabel} />}
              </div>
            </div>
          </li>
        ))}
      </ol>
      {item.skill === 'listening' && item.transcript && (
        <details className="rounded-xl border border-line p-3">
          <summary className="cursor-pointer text-sm font-semibold">📝 {t('listening.transcript')}</summary>
          <div className="mt-2 space-y-1 text-sm" lang="en">
            {item.transcript.map((l, i) => (
              <p key={i}>
                <strong>{l.speaker}:</strong> {l.text}
              </p>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function ItemSection({ item, result, feedback, staff }: { item: ResultItem; result: ItemResult | undefined; feedback: ItemFeedback | undefined; staff: boolean }) {
  const { t } = useTranslation();
  return (
    <Card as="article" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SkillChip skill={item.skill} />
        <h3 className="font-display text-lg font-extrabold" lang="en">
          {item.title}
        </h3>
        {result && (result.skill === 'listening' || result.skill === 'reading') && (
          <Badge tone="primary" className="ml-auto tabular-nums">
            {t('results.correctCount', { earned: result.earned, total: result.total })}
          </Badge>
        )}
        {result && (result.skill === 'writing' || result.skill === 'speaking') && (
          <Badge tone={result.score === null ? 'warn' : 'primary'} className="ml-auto">
            {result.score === null ? t(`results.skillStatus.${result.status}`) : `${result.score}/100`}
          </Badge>
        )}
      </div>
      {(item.skill === 'listening' || item.skill === 'reading') && <ObjectiveResult item={item} staff={staff} />}
      {item.skill === 'writing' && (
        <>
          <details className="rounded-xl border border-line p-3" open={staff}>
            <summary className="cursor-pointer text-sm font-semibold">{t('results.taskPrompt')}</summary>
            <p className="mt-2 text-sm whitespace-pre-line" lang="en">
              {item.task.prompt}
            </p>
          </details>
          <div>
            <p className="mb-1 text-sm font-semibold">
              {t('results.yourText')} <span className="font-normal text-muted">({t('results.words', { count: item.wordCount })})</span>
            </p>
            <div className="max-h-80 overflow-y-auto rounded-xl bg-surface-2 p-3 text-sm whitespace-pre-wrap" lang="en" data-testid="writing-text">
              {item.text || <em className="text-muted">{t('results.noAnswer')}</em>}
            </div>
          </div>
        </>
      )}
      {item.skill === 'speaking' && (
        <ul className="space-y-2">
          {item.parts.map((p, i) => {
            const rec = item.recordings.find((r) => r.partId === p.id);
            return (
              <li key={p.id} className="rounded-xl border border-line p-3 text-sm">
                <p className="font-semibold">
                  {t('speaking.part', { n: i + 1 })}: <span lang="en">{p.prompt}</span>
                </p>
                <p className="mt-1 text-muted" lang="en">
                  {rec?.transcript || <em>{t('results.noRecording')}</em>}
                </p>
                {rec?.audioUrl && (
                  <div className="mt-2">
                    <RecordingPlayer url={rec.audioUrl} label={t('results.playRecording')} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {result && (result.skill === 'writing' || result.skill === 'speaking') && <CriteriaTable result={result} skill={result.skill} />}
      {feedback && <FeedbackBlock f={feedback} />}
      {staff && 'sampleAnswer' in item && item.sampleAnswer && (
        <details className="rounded-xl border border-dashed border-line p-3 text-sm">
          <summary className="cursor-pointer font-semibold">{t('results.staffKey')}</summary>
          {'keyPoints' in item && Array.isArray(item.keyPoints) && (
            <ul className="mt-2 list-disc pl-5" lang="en">
              {item.keyPoints.map((k, i) => (
                <li key={i}>{typeof k === 'string' ? k : `${k.partId}: ${k.keyPoints.join('; ')}`}</li>
              ))}
            </ul>
          )}
          <p className="mt-2 whitespace-pre-line text-muted" lang="en">
            {item.sampleAnswer}
          </p>
        </details>
      )}
    </Card>
  );
}

export function ResultsHero({ a, celebrate }: { a: Assessment; celebrate: boolean }) {
  const { t } = useTranslation();
  const { lang } = useLocalized();
  const exam = a.mode === 'exam';
  return (
    <section className="relative overflow-hidden rounded-3xl border border-line bg-surface p-5 shadow-sm" aria-labelledby="results-title" aria-live="polite">
      {celebrate && a.passed && <Confetti />}
      <div className="flex flex-col items-center gap-5 md:flex-row md:items-start">
        <ScoreRing
          score={exam ? a.overall : a.score}
          label={exam ? t('results.overall') : t('results.skillScore')}
          tone={a.passed ? 'success' : 'warn'}
          nullLabel={a.pendingReview ? t('results.pendingTeacher') : t('results.notAvailable')}
        />
        <div className="min-w-0 flex-1 space-y-3 text-center md:text-left">
          <div>
            <p className="font-mono text-xs font-bold text-muted">{a.refId}</p>
            <h1 id="results-title" className="font-display text-2xl font-extrabold">
              {a.title}
            </h1>
          </div>
          <div className="flex flex-wrap justify-center gap-2 md:justify-start">
            {!exam && (a.passed ? <Badge tone="success">🎉 {t('results.passed')}</Badge> : a.score === null ? <Badge tone="warn">{t('results.waiting')}</Badge> : <Badge tone="warn">{t('results.notPassed')}</Badge>)}
            {a.pendingReview && <Badge tone="warn">👩‍🏫 {t('results.pendingReviewBadge')}</Badge>}
            {a.teacherReview && <Badge tone="success">✓ {t(`results.review.${a.teacherReview.status}`)}</Badge>}
            {exam && a.conversionLabel && <Badge tone="primary">{t('results.conversion', { label: a.conversionLabel })}</Badge>}
          </div>
          {a.xpAwarded > 0 && (
            <div className="pop-in inline-flex items-center gap-2 rounded-2xl bg-xp-soft px-4 py-2" data-testid="xp-awarded">
              <span className="text-2xl" aria-hidden="true">
                ⭐
              </span>
              <span className="font-display text-xl font-extrabold text-xp">+{a.xpAwarded} XP</span>
            </div>
          )}
          {a.newBadges.length > 0 && (
            <div className="space-y-2" data-testid="new-badges">
              <p className="font-semibold">
                🏅 {t('results.newBadges')}: {a.newBadges.map((b) => badgeName(b, lang)).join(', ')}
              </p>
              <BadgeShelf earned={a.newBadges} highlight={a.newBadges} />
            </div>
          )}
        </div>
      </div>
      {a.skills.length > 1 && (
        <ul className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          {a.skills.map((s) => (
            <li key={s.skill} className="rounded-2xl border border-line p-3 text-center" data-testid={`skill-${s.skill}`}>
              <SkillChip skill={s.skill} />
              <div className={cx('mt-2 font-display text-2xl font-extrabold tabular-nums', s.score === null && 'text-base text-muted')}>{s.score === null ? t(`results.skillStatus.${s.status}`) : s.score}</div>
              <div className="text-xs text-muted" lang="en">
                {s.detail}
              </div>
              {s.score !== null && s.status !== 'assessed' && <div className="mt-1 text-[11px] text-warn">{t(`results.skillStatus.${s.status}`)}</div>}
            </li>
          ))}
        </ul>
      )}
      {exam && a.overall === null && <p className="mt-3 text-center text-sm text-muted">{t('results.overallNeedsAll')}</p>}
      {!exam && a.skills[0] && (
        <p className="mt-3 text-center text-sm text-muted md:text-left" lang="en">
          {a.skills[0].detail}
        </p>
      )}
    </section>
  );
}

/** Full results: hero, notices, per-item answers/criteria/feedback and the disclaimer. */
export function ResultsView({ data, staff = false, celebrate = false }: { data: ResultsResponse & { assessment: Assessment }; staff?: boolean; celebrate?: boolean }) {
  const { t } = useTranslation();
  const a = data.assessment;
  const released = data.answersReleased !== false;
  return (
    <div className="space-y-4">
      <ResultsHero a={a} celebrate={celebrate} />
      {a.aiStatus === 'failed' && <Alert tone="warn">{t('results.aiFailed')}</Alert>}
      {a.aiStatus === 'partial' && <Alert tone="warn">{t('results.aiPartial')}</Alert>}
      {a.mode === 'exam' && !released && !staff && (
        <Alert tone="primary" className="text-sm">
          <span data-testid="answers-not-released">🔒 {t('results.answersNotReleased')}</span>
        </Alert>
      )}
      {a.teacherReview && (
        <Card className="border-success/40">
          <SectionTitle>👩‍🏫 {t('results.teacherComment', { name: a.teacherReview.reviewerName })}</SectionTitle>
          <p className="text-sm whitespace-pre-line">{a.teacherReview.comment || t('results.noComment')}</p>
        </Card>
      )}
      <div className="space-y-4">
        {data.items.map((i) => (
          <ItemSection key={i.id} item={i} result={a.items.find((r) => r.itemId === i.id)} feedback={a.feedback[i.id]} staff={staff} />
        ))}
      </div>
      <Disclaimer />
    </div>
  );
}
