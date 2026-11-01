import { useTranslation } from 'react-i18next';
import type { Item, ObjectiveQuestion } from '@vq/shared';
import { Passage } from '../../challenge/Objective';
import { SkillChip } from '../../components/game';
import { Badge } from '../../components/ui';

function QuestionKey({ q, n }: { q: ObjectiveQuestion; n: number }) {
  const { t } = useTranslation();
  return (
    <li className="rounded-xl border border-line p-3 text-sm" lang="en">
      <p className="font-semibold">
        {n}. {q.prompt} <Badge className="ml-1">{t(`question.types.${q.type}`)}</Badge>
      </p>
      {q.type === 'tfng' && <p className="italic">“{q.statement}”</p>}
      {q.type === 'mcq' && (
        <ol className="mt-1 space-y-0.5">
          {q.options.map((o, i) => (
            <li key={i} className={i === q.correctIndex ? 'font-bold text-success' : ''}>
              {String.fromCharCode(65 + i)}. {o} {i === q.correctIndex && '✓'}
            </li>
          ))}
        </ol>
      )}
      {q.type === 'tfng' && <p className="mt-1 font-bold text-success">✓ {t(`question.tfng.${q.answer}`)}</p>}
      {q.type === 'short' && (
        <p className="mt-1">
          <span className="font-bold text-success">✓ {q.acceptable.join(' | ')}</span> <span className="text-muted">({t('question.maxWords', { count: q.maxWords })})</span>
        </p>
      )}
      <p className="mt-1 text-muted">{q.explanation}</p>
      <p className="mt-1 border-l-4 border-primary/50 pl-2 text-muted italic">“{q.evidence}”</p>
    </li>
  );
}

/** Readable preview of an item version for staff, including answers, scripts, key points and sample answers. */
export function ItemPreview({ item }: { item: Item }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3" data-testid="item-preview">
      <div className="flex flex-wrap items-center gap-2">
        <SkillChip skill={item.skill} />
        <Badge>{item.level}</Badge>
        <Badge>{t('content.difficultyN', { n: item.difficulty })}</Badge>
        <span className="text-sm text-muted">{item.topic}</span>
      </div>
      <h3 className="font-display text-lg font-extrabold" lang="en">
        {item.title}
      </h3>
      <p className="text-sm text-muted">
        <strong>{t('content.objective')}:</strong> {item.objective}
      </p>
      <p className="text-sm">
        {item.instructions.en} <span className="text-muted">/ {item.instructions.vi}</span>
      </p>
      {item.skill === 'listening' && (
        <div className="space-y-2 rounded-xl bg-surface-2 p-3 text-sm" lang="en">
          <p>
            <strong>{t('listening.context')}</strong> {item.script.context}
          </p>
          <p className="text-xs text-muted">
            {t('content.plays', { quest: item.plays.quest, exam: item.plays.exam })} · {item.script.speakers.map((s) => `${s.name} (${s.voice.name})`).join(', ')}
          </p>
          {item.script.lines.map((l, i) => (
            <p key={i}>
              <strong>{item.script.speakers.find((s) => s.id === l.speaker)?.name ?? l.speaker}:</strong> {l.text}
            </p>
          ))}
        </div>
      )}
      {item.skill === 'reading' && <Passage passage={item.passage} />}
      {(item.skill === 'listening' || item.skill === 'reading') && (
        <ol className="space-y-2">
          {item.questions.map((q, i) => (
            <QuestionKey key={q.id} q={q} n={i + 1} />
          ))}
        </ol>
      )}
      {item.skill === 'writing' && (
        <div className="space-y-2 text-sm" lang="en">
          {item.task.input && <div className="rounded-xl bg-surface-2 p-3 whitespace-pre-line">{item.task.input}</div>}
          <p className="whitespace-pre-line">
            <strong>{t('writing.task')}:</strong> {item.task.prompt}
          </p>
          <p className="text-muted">{t('writing.wordsTarget', { min: item.task.minWords, max: item.task.maxWords })} · {t('writing.suggestedTime', { count: item.task.timeMinutes })} · ×{item.weight}</p>
          <div>
            <strong>{t('content.keyPoints')}</strong>
            <ul className="list-disc pl-5">
              {item.keyPoints.map((k, i) => (
                <li key={i}>{k}</li>
              ))}
            </ul>
          </div>
          <details>
            <summary className="cursor-pointer font-semibold">{t('content.sampleAnswer')}</summary>
            <p className="mt-1 whitespace-pre-line text-muted">{item.sampleAnswer}</p>
          </details>
        </div>
      )}
      {item.skill === 'speaking' && (
        <div className="space-y-2 text-sm" lang="en">
          {item.parts.map((p, i) => (
            <div key={p.id} className="rounded-xl border border-line p-3">
              <p className="font-semibold">
                {t('speaking.part', { n: i + 1 })} ({p.type}) · {t('speaking.limits', { prep: p.prepSeconds, speak: p.speakSeconds })}
              </p>
              <p className="whitespace-pre-line">{p.prompt}</p>
              {p.options.length > 0 && <p className="text-muted">{p.options.join(' / ')}</p>}
              {p.followUps.length > 0 && <p className="text-muted">↳ {p.followUps.join(' · ')}</p>}
              <p className="mt-1">
                <strong>{t('content.keyPoints')}</strong> {p.keyPoints.join('; ')}
              </p>
            </div>
          ))}
          <details>
            <summary className="cursor-pointer font-semibold">{t('content.sampleAnswer')}</summary>
            <p className="mt-1 whitespace-pre-line text-muted">{item.sampleAnswer}</p>
          </details>
        </div>
      )}
    </div>
  );
}
