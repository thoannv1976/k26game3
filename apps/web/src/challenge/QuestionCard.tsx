import { useEffect, useId, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import type { Explanation, ObjectiveView, QuestionView } from '../api/types';
import { Alert, Badge, Button, Input, Spinner, cx } from '../components/ui';
import { errorMessage } from '../i18n/errors';
import { useAttemptCtx } from './context';

const TFNG = ['true', 'false', 'not_given'] as const;

/** Displays a stored answer value (option text for MCQ). */
export function answerText(q: QuestionView, v: number | string, t: (k: string) => string): string {
  if (q.type === 'mcq') return q.options?.[Number(v)] ?? String(v);
  if (q.type === 'tfng') return TFNG.includes(String(v) as (typeof TFNG)[number]) ? t(`question.tfng.${String(v)}`) : String(v);
  return String(v);
}

export function RevealBox({ q, sourceLabel }: { q: QuestionView; sourceLabel: string }) {
  const { t } = useTranslation();
  if (!q.reveal) return null;
  return (
    <div className="mt-3 space-y-2 rounded-xl bg-surface-2 p-3 text-sm">
      <p>
        <span className="font-semibold">{t('question.correctAnswer')}</span>{' '}
        <span lang="en">{q.type === 'tfng' ? t(`question.tfng.${q.reveal.correct}`) : q.reveal.correct}</span>
      </p>
      <p lang="en">{q.reveal.explanation}</p>
      <blockquote className="border-l-4 border-primary/60 pl-3 text-muted italic" lang="en">
        <span className="not-italic font-semibold">{sourceLabel}: </span>“{q.reveal.evidence}”
      </blockquote>
    </div>
  );
}

function ExplainPanel({ item, q }: { item: ObjectiveView; q: QuestionView }) {
  const { t } = useTranslation();
  const { attemptId } = useAttemptCtx();
  const m = useMutation({ mutationFn: () => api.post<{ explanation: Explanation }>(`/api/attempts/${attemptId}/explain`, { itemId: item.id, questionId: q.id }) });
  const explained = item.explained?.includes(q.id);
  if (!m.data) {
    return (
      <div className="mt-2">
        <Button variant="secondary" size="sm" onClick={() => m.mutate()} loading={m.isPending} data-testid="explain-ai">
          🤖 {explained ? t('question.showExplanation') : t('question.explainAi')}
        </Button>
        {m.isError && <Alert tone="danger" className="mt-2">{errorMessage(t, m.error)}</Alert>}
      </div>
    );
  }
  const e = m.data.explanation;
  return (
    <div className="mt-3 space-y-2 rounded-xl border border-primary/30 bg-primary-soft/40 p-3 text-sm" aria-live="polite" data-testid="explanation">
      <div className="flex items-center gap-2">
        <Badge tone={e.source === 'ai' ? 'primary' : 'neutral'}>{e.source === 'ai' ? t('question.sourceAi') : t('question.sourceTeacher')}</Badge>
      </div>
      <p lang="en">{e.explanation}</p>
      {e.whyStudentAnswer && (
        <p lang="en">
          <span className="font-semibold">{t('question.whyYours')}</span> {e.whyStudentAnswer}
        </p>
      )}
      {e.quote && (
        <blockquote className="border-l-4 border-primary/60 pl-3 italic" lang="en">
          “{e.quote}”
        </blockquote>
      )}
      {e.vocabulary.length > 0 && (
        <div>
          <div className="font-semibold">{t('question.vocabulary')}</div>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {e.vocabulary.map((v) => (
              <li key={v.term} className="rounded-lg bg-surface px-2 py-1 text-xs">
                <strong lang="en">{v.term}</strong> – {v.meaning}
              </li>
            ))}
          </ul>
        </div>
      )}
      {e.tip && (
        <p>
          💡 <span className="font-semibold">{t('question.tip')}</span> {e.tip}
        </p>
      )}
    </div>
  );
}

/**
 * One objective question. Quest Mode: one answer, then correctness + explanation + evidence right away (and AI help).
 * Exam Mode: answers are saved immediately and can be changed until the section closes; nothing is revealed.
 */
export function QuestionCard({ item, q, number }: { item: ObjectiveView; q: QuestionView; number: number }) {
  const { t } = useTranslation();
  const ctx = useAttemptCtx();
  const exam = ctx.mode === 'exam';
  const name = useId();
  const answered = q.answer !== null;
  const locked = ctx.readOnly || (!exam && answered);
  const [value, setValue] = useState<number | string | null>(q.answer?.value ?? null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'queued' | 'error'>(answered ? 'saved' : 'idle');
  const [error, setError] = useState<unknown>(null);
  const pending = ctx.pending.has(`${item.id}:${q.id}`);

  useEffect(() => {
    if (q.answer) setValue(q.answer.value);
  }, [q.answer]);

  const send = async (v: number | string) => {
    if (ctx.readOnly) return;
    setStatus('saving');
    setError(null);
    try {
      const r = await ctx.sendAnswer(item.id, q.id, v);
      setStatus(r === 'queued' ? 'queued' : 'saved');
    } catch (e) {
      setStatus('error');
      setError(e);
    }
  };

  const choose = (v: number | string) => {
    if (locked) return;
    setValue(v);
    if (exam) void send(v);
  };

  const correct = q.answer?.correct;
  const sourceLabel = item.skill === 'listening' ? t('question.fromRecording') : t('question.fromPassage');
  const optionCls = (selected: boolean, isCorrectChoice: boolean | null) =>
    cx(
      'flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border-2 px-3 py-2 text-sm transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/40',
      selected ? 'border-primary bg-primary-soft' : 'border-line hover:border-primary/50',
      isCorrectChoice === true && 'border-success bg-success-soft',
      isCorrectChoice === false && 'border-danger bg-danger-soft',
      locked && 'cursor-default',
    );

  return (
    <fieldset
      className="rounded-2xl border border-line bg-surface p-4"
      data-testid={`question-${item.id}-${q.id}`}
      data-answered={answered ? 'true' : 'false'}
      data-correct={correct === undefined ? '' : String(correct)}
    >
      <legend className="sr-only">{t('question.number', { n: number })}</legend>
      <div className="mb-3 flex items-start gap-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-bold text-primary" aria-hidden="true">
          {number}
        </span>
        <div className="min-w-0 flex-1 space-y-1" lang="en">
          <p className="font-semibold">{q.prompt}</p>
          {q.type === 'tfng' && q.statement && <p className="rounded-lg bg-surface-2 px-3 py-2 italic">“{q.statement}”</p>}
        </div>
        {q.points > 1 && <Badge>{t('question.points', { count: q.points })}</Badge>}
      </div>

      {q.type === 'mcq' && (
        <div className="grid gap-2" role="radiogroup" aria-label={q.prompt}>
          {(q.options ?? []).map((o, i) => {
            const selected = value === i;
            const mark = !exam && answered && q.reveal ? (q.reveal.correct === o ? true : selected ? false : null) : null;
            return (
              <label key={i} className={optionCls(selected, mark)} data-testid={`option-${i}`}>
                <input type="radio" name={name} className="mt-1 h-4 w-4 accent-[var(--vq-primary)]" checked={selected} disabled={locked} onChange={() => choose(i)} />
                <span lang="en">
                  <span className="font-bold">{String.fromCharCode(65 + i)}.</span> {o}
                </span>
              </label>
            );
          })}
        </div>
      )}

      {q.type === 'tfng' && (
        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label={q.statement ?? q.prompt}>
          {TFNG.map((v) => {
            const selected = value === v;
            const mark = !exam && answered && q.reveal ? (q.reveal.correct === v ? true : selected ? false : null) : null;
            return (
              <label key={v} className={optionCls(selected, mark)} data-testid={`tfng-${v}`}>
                <input type="radio" name={name} className="mt-1 h-4 w-4 accent-[var(--vq-primary)]" checked={selected} disabled={locked} onChange={() => choose(v)} />
                <span>{t(`question.tfng.${v}`)}</span>
              </label>
            );
          })}
        </div>
      )}

      {q.type === 'short' && (
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (exam && typeof value === 'string' && value.trim()) void send(value.trim());
          }}
        >
          <label className="sr-only" htmlFor={`${name}-short`}>
            {t('question.yourAnswer')}
          </label>
          <Input
            id={`${name}-short`}
            data-testid="short-input"
            lang="en"
            value={typeof value === 'string' ? value : value === null ? '' : String(value)}
            disabled={locked}
            maxLength={120}
            autoComplete="off"
            placeholder={t('question.shortPlaceholder', { count: q.maxWords ?? 3 })}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => {
              if (exam && typeof value === 'string' && value.trim() && value.trim() !== q.answer?.value) void send(value.trim());
            }}
          />
          {exam && !locked && (
            <Button type="submit" variant="secondary" disabled={typeof value !== 'string' || !value.trim()}>
              {t('common.save')}
            </Button>
          )}
        </form>
      )}

      {q.type === 'short' && <p className="mt-1 text-xs text-muted">{t('question.maxWords', { count: q.maxWords ?? 3 })}</p>}

      {!exam && !answered && !ctx.readOnly && (
        <div className="mt-3">
          <Button
            data-testid="check-answer"
            disabled={value === null || (typeof value === 'string' && !value.trim())}
            loading={status === 'saving'}
            onClick={() => value !== null && void send(typeof value === 'string' ? value.trim() : value)}
          >
            {t('question.check')}
          </Button>
        </div>
      )}

      <div aria-live="polite" className="text-sm">
        {exam && status === 'saving' && (
          <span className="mt-2 inline-flex items-center gap-1 text-muted">
            <Spinner className="h-3 w-3" /> {t('common.saving')}
          </span>
        )}
        {exam && status === 'saved' && answered && <span className="mt-2 inline-block text-success">✓ {t('question.saved')}</span>}
        {(status === 'queued' || pending) && <span className="mt-2 inline-block text-warn">📶 {t('question.queued')}</span>}
        {!exam && answered && correct !== undefined && (
          <p className={cx('mt-3 font-bold', correct ? 'text-success' : 'text-danger')} data-testid="answer-result">
            {correct ? `✓ ${t('question.correct')}` : `✗ ${t('question.incorrect')}`}
            {!correct && q.answer && <span className="ml-1 font-normal text-muted">({t('question.yourAnswerWas', { answer: answerText(q, q.answer.value, t) })})</span>}
          </p>
        )}
      </div>
      {status === 'error' && error !== null && <Alert tone="danger" className="mt-2">{errorMessage(t, error)}</Alert>}
      {!exam && answered && <RevealBox q={q} sourceLabel={sourceLabel} />}
      {!exam && answered && ctx.helpAllowed && <ExplainPanel item={item} q={q} />}
    </fieldset>
  );
}
