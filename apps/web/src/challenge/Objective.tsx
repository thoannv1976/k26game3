import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { qk } from '../api/queries';
import type { AttemptView, ListeningView, PlayResponse, ReadingView } from '../api/types';
import { Alert, Badge, Button, cx } from '../components/ui';
import { useLocalized } from '../i18n';
import { errorMessage } from '../i18n/errors';
import { parseBlocks } from '../lib/text';
import { playAudio, type PlayHandle } from './audio';
import { useAttemptCtx } from './context';
import { QuestionCard } from './QuestionCard';

function Instructions({ text }: { text: { en: string; vi: string } }) {
  const { L } = useLocalized();
  return <p className="text-sm text-muted">{L(text)}</p>;
}

/** Audio player without seeking: each press of Play uses one of the allowed plays. */
export function ListeningPlayer({ item }: { item: ListeningView }) {
  const { t } = useTranslation();
  const ctx = useAttemptCtx();
  const qc = useQueryClient();
  const el = useRef<HTMLAudioElement>(null);
  const handle = useRef<PlayHandle | null>(null);
  const [playing, setPlaying] = useState(false);
  const [line, setLine] = useState<{ i: number; n: number } | null>(null);
  const [devTts, setDevTts] = useState(false);

  useEffect(() => () => handle.current?.stop(), []);

  const play = useMutation({
    mutationFn: () => api.post<PlayResponse>(`/api/attempts/${ctx.attemptId}/play`, { itemId: item.id }),
    onSuccess: (r) => {
      qc.setQueryData<AttemptView>(qk.attempt(ctx.attemptId), (old) =>
        old ? { ...old, items: old.items.map((i) => (i.id === item.id && i.skill === 'listening' ? { ...i, playsLeft: r.playsLeft } : i)) } : old,
      );
      setDevTts(r.audio.kind === 'browser_tts');
      setPlaying(true);
      const h = playAudio(r.audio, el.current, (i, n) => setLine({ i, n }));
      handle.current = h;
      void h.done.finally(() => {
        if (handle.current === h) {
          setPlaying(false);
          setLine(null);
        }
      });
    },
    onError: (e) => {
      if ((e as { code?: string }).code === 'TIME_UP') ctx.onTimeUp();
    },
  });

  const none = item.playsLeft <= 0;
  return (
    <div className="rounded-2xl border border-listening/30 bg-listening-soft p-4" data-testid="listening-player">
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => play.mutate()}
          disabled={none || playing || play.isPending || ctx.readOnly}
          data-testid="play-audio"
          aria-describedby={`plays-${item.id}`}
          className={cx(
            'grid h-16 w-16 shrink-0 place-items-center rounded-full text-white shadow-lg transition disabled:cursor-not-allowed disabled:opacity-50',
            playing ? 'bg-listening' : 'bg-listening hover:scale-105',
          )}
          aria-label={playing ? t('listening.playing') : t('listening.play')}
        >
          {playing ? (
            <span className="flex h-6 items-end gap-1" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className="typing-dot w-1.5 rounded bg-white" style={{ height: `${10 + ((i * 7) % 14)}px` }} />
              ))}
            </span>
          ) : (
            <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 5v14l11-7z" fill="currentColor" />
            </svg>
          )}
        </button>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{playing ? t('listening.playing') : none ? t('listening.noPlaysLeft') : t('listening.pressPlay')}</p>
          <p id={`plays-${item.id}`} className="text-sm text-muted" aria-live="polite">
            {t('listening.playsLeft', { left: item.playsLeft, max: item.playsMax })}
            {playing && line && line.n > 1 && <> · {t('listening.part', { i: line.i + 1, n: line.n })}</>}
          </p>
          {item.playsMax === 1 && <p className="text-xs font-semibold text-warn">{t('listening.onlyOnce')}</p>}
        </div>
        <div className="flex gap-1" aria-hidden="true">
          {Array.from({ length: item.playsMax }, (_, i) => (
            <span key={i} className={cx('h-3 w-3 rounded-full', i < item.playsLeft ? 'bg-listening' : 'bg-line')} />
          ))}
        </div>
      </div>
      {/* No controls: students cannot scrub or replay outside the allowed plays. */}
      <audio ref={el} preload="none" className="hidden" />
      {devTts && <p className="mt-2 text-xs text-muted">{t('listening.devTts')}</p>}
      {play.isError && <Alert tone="danger" className="mt-3">{errorMessage(t, play.error)}</Alert>}
    </div>
  );
}

export function ListeningChallenge({ item, startNumber = 1 }: { item: ListeningView; startNumber?: number }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Instructions text={item.instructions} />
        <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm" lang="en">
          <span className="font-semibold">{t('listening.context')}</span> {item.context}
        </p>
      </div>
      <ListeningPlayer item={item} />
      <div className="space-y-3">
        {item.questions.map((q, i) => (
          <QuestionCard key={q.id} item={item} q={q} number={startNumber + i} />
        ))}
      </div>
      {item.transcript && (
        <details className="rounded-2xl border border-line bg-surface p-4" data-testid="transcript">
          <summary className="cursor-pointer font-semibold">📝 {t('listening.transcript')}</summary>
          <div className="mt-3 space-y-2 text-sm" lang="en">
            {item.transcript.map((l, i) => (
              <p key={i}>
                <span className="font-semibold">{l.speaker}:</span> {l.text}
              </p>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

export function Passage({ passage }: { passage: ReadingView['passage'] }) {
  const { t } = useTranslation();
  const blocks = parseBlocks(passage.body);
  const meta = Object.entries(passage.meta ?? {});
  return (
    <article className="rounded-2xl border border-line bg-surface p-4 shadow-sm sm:p-6" lang="en" aria-label={passage.title} data-testid="passage">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge tone="primary">{t(`reading.types.${passage.type}`, { defaultValue: passage.type })}</Badge>
      </div>
      <h3 className="font-serif text-xl font-bold">{passage.title}</h3>
      {meta.length > 0 && (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 border-b border-line pb-3 text-sm">
          {meta.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-semibold capitalize">{k}:</dt>
              <dd className="text-muted">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="passage mt-3 font-serif text-[1.02rem]">
        {blocks.map((b, i) =>
          b.kind === 'paragraph' ? (
            <p key={i}>
              {b.lines.map((l, j) => (
                <span key={j}>
                  {j > 0 && <br />}
                  {l}
                </span>
              ))}
            </p>
          ) : b.kind === 'list' ? (
            b.ordered ? (
              <ol key={i} className="my-2 list-decimal space-y-1 pl-6">
                {b.items.map((x, j) => (
                  <li key={j}>{x}</li>
                ))}
              </ol>
            ) : (
              <ul key={i} className="my-2 list-disc space-y-1 pl-6">
                {b.items.map((x, j) => (
                  <li key={j}>{x}</li>
                ))}
              </ul>
            )
          ) : (
            <div key={i} className="my-3 overflow-x-auto">
              <table className="w-full border-collapse text-sm [&_td]:border [&_td]:border-line [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-line [&_th]:bg-surface-2 [&_th]:px-2 [&_th]:py-1">
                <thead>
                  <tr>
                    {b.table.header.map((h, j) => (
                      <th key={j}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.table.rows.map((r, j) => (
                    <tr key={j}>
                      {r.map((c, k) => (
                        <td key={k}>{c}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ),
        )}
      </div>
    </article>
  );
}

/** Reading: passage on the left, questions on the right (desktop); stacked on phones. */
export function ReadingChallenge({ item, startNumber = 1 }: { item: ReadingView; startNumber?: number }) {
  return (
    <div className="space-y-3">
      <Instructions text={item.instructions} />
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <div className="lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto">
          <Passage passage={item.passage} />
        </div>
        <div className="space-y-3">
          {item.questions.map((q, i) => (
            <QuestionCard key={q.id} item={item} q={q} number={startNumber + i} />
          ))}
        </div>
      </div>
    </div>
  );
}
