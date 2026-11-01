import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, isApiError } from '../api/client';
import type { MeUser, SpeakingPart, SpeakingUploadResponse, SpeakingView } from '../api/types';
import { isTenantUser } from '../api/types';
import { MicError, recordingSupported, type RecordingResult } from '../audio/recorder';
import { useAuth, useSetMeUser } from '../auth/AuthProvider';
import { Alert, Badge, Button, cx } from '../components/ui';
import { useLocalized } from '../i18n';
import { errorMessage } from '../i18n/errors';
import { formatClock } from '../lib/clock';
import { ConsentModal } from '../voice/ConsentModal';
import { useRecorder } from '../voice/useRecorder';
import { useAttemptCtx } from './context';

type Phase = 'idle' | 'prep' | 'recording' | 'uploading';

/** Shared consent state: asks once, then runs the pending action. */
function useConsent() {
  const { me } = useAuth();
  const setMe = useSetMeUser();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const after = useRef<(() => void) | null>(null);
  const has = isTenantUser(me?.user) && Boolean(me.user.recordingConsentAt);
  const ensure = useCallback(
    (then: () => void) => {
      if (has) then();
      else {
        after.current = then;
        setOpen(true);
      }
    },
    [has],
  );
  const require = useCallback((then: () => void) => {
    after.current = then;
    setOpen(true);
  }, []);
  const agree = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ recordingConsentAt: string | null }>('/api/me/recording-consent', { accept: true });
      if (isTenantUser(me?.user)) setMe({ ...me.user, recordingConsentAt: r.recordingConsentAt } as MeUser);
      setOpen(false);
      const f = after.current;
      after.current = null;
      f?.();
    } finally {
      setBusy(false);
    }
  };
  return { ensure, require, modal: <ConsentModal open={open} onClose={() => setOpen(false)} onAgree={() => void agree()} loading={busy} /> };
}

function PartRecorder({ itemId, part, index, consent }: { itemId: string; part: SpeakingPart; index: number; consent: ReturnType<typeof useConsent> }) {
  const { t } = useTranslation();
  const ctx = useAttemptCtx();
  const exam = ctx.mode === 'exam';
  const [phase, setPhase] = useState<Phase>('idle');
  const [prepLeft, setPrepLeft] = useState(part.prepSeconds);
  const [error, setError] = useState<unknown>(null);
  const [micError, setMicError] = useState<MicError | null>(null);
  const [pending, setPending] = useState<RecordingResult | null>(null);
  const [localUrl, setLocalUrl] = useState<string | null>(null);

  useEffect(() => () => void (localUrl && URL.revokeObjectURL(localUrl)), [localUrl]);

  const upload = useCallback(
    async (r: RecordingResult) => {
      setPhase('uploading');
      setError(null);
      const form = new FormData();
      form.append('audio', r.blob, `${part.id}.wav`);
      try {
        const res = await api.post<SpeakingUploadResponse>(`/api/attempts/${ctx.attemptId}/speaking/${itemId}/${part.id}`, form);
        ctx.setView(res.view);
        setPending(null);
      } catch (e) {
        // The recording stays on this device until the upload succeeds.
        setPending(r);
        if (isApiError(e, 'CONSENT_REQUIRED')) consent.require(() => void upload(r));
        else {
          setError(e);
          if (isApiError(e, 'TIME_UP') || isApiError(e, 'SESSION_NOT_ACTIVE')) ctx.onTimeUp();
        }
      } finally {
        setPhase('idle');
      }
    },
    [consent, ctx, itemId, part.id],
  );

  const onRecorded = useCallback(
    (r: RecordingResult) => {
      setLocalUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(r.blob);
      });
      void upload(r);
    },
    [upload],
  );
  const rec = useRecorder(part.speakSeconds, onRecorded);
  const recStart = rec.start;

  const startRecording = useCallback(async () => {
    setMicError(null);
    try {
      setPhase('recording');
      await recStart();
    } catch (e) {
      setPhase('idle');
      setMicError(e instanceof MicError ? e : new MicError('failed', String(e)));
    }
  }, [recStart]);

  // Preparation countdown, then recording starts automatically.
  useEffect(() => {
    if (phase !== 'prep') return;
    if (prepLeft <= 0) {
      void startRecording();
      return;
    }
    const timer = setTimeout(() => setPrepLeft((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [phase, prepLeft, startRecording]);

  const begin = () =>
    consent.ensure(() => {
      setError(null);
      setPrepLeft(part.prepSeconds);
      if (part.prepSeconds > 0) setPhase('prep');
      else void startRecording();
    });

  const take = part.take;
  const canRecordAgain = !exam || !take || take.status === 'unclear';
  const recording = rec.state === 'recording';
  const left = Math.max(0, Math.ceil(part.speakSeconds - rec.elapsed));

  return (
    <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm" data-testid={`speaking-part-${part.id}`} aria-labelledby={`part-${part.id}`}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 id={`part-${part.id}`} className="font-display text-lg font-extrabold">
          {t('speaking.part', { n: index + 1 })}
        </h3>
        <Badge>{t(`speaking.types.${part.type}`)}</Badge>
        <Badge tone="neutral">{t('speaking.limits', { prep: part.prepSeconds, speak: part.speakSeconds })}</Badge>
        {take && (
          <Badge tone={take.status === 'transcribed' ? 'success' : 'warn'} className="ml-auto">
            {take.status === 'transcribed' ? `✓ ${t('speaking.recorded')}` : t('speaking.unclear')}
          </Badge>
        )}
      </div>
      <div className="space-y-2" lang="en">
        <p className="font-semibold whitespace-pre-line">{part.prompt}</p>
        {part.options.length > 0 && (
          <ul className="grid gap-2 sm:grid-cols-3">
            {part.options.map((o, i) => (
              <li key={i} className="rounded-xl bg-speaking-soft px-3 py-2 text-sm">
                <span className="font-bold">{String.fromCharCode(65 + i)}.</span> {o}
              </li>
            ))}
          </ul>
        )}
        {part.followUps.length > 0 && (
          <div className="rounded-xl bg-surface-2 p-3 text-sm">
            <p className="font-semibold" lang={undefined}>
              {t('speaking.followUps')}
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {part.followUps.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-col items-center gap-3 rounded-2xl bg-speaking-soft/60 p-4 text-center" aria-live="polite">
        {phase === 'prep' && (
          <>
            <p className="text-sm font-semibold">{t('speaking.prepare')}</p>
            <p className="font-display text-4xl font-extrabold tabular-nums" role="timer" data-testid="prep-timer">
              {formatClock(prepLeft)}
            </p>
            <Button variant="secondary" onClick={() => setPrepLeft(0)} data-testid="skip-prep">
              {t('speaking.startNow')}
            </Button>
          </>
        )}
        {(phase === 'recording' || recording) && (
          <>
            <div className="rec-pulse grid h-16 w-16 place-items-center rounded-full bg-speaking text-white" aria-hidden="true">
              <span className="h-5 w-5 rounded-sm bg-white" style={{ transform: `scale(${1 + rec.level * 0.4})` }} />
            </div>
            <p className="font-semibold text-speaking">{rec.state === 'starting' ? t('speaking.micStarting') : t('speaking.recording')}</p>
            <p className="font-display text-3xl font-extrabold tabular-nums" role="timer" data-testid="speak-timer">
              {formatClock(left)}
            </p>
            <div className="h-1.5 w-48 overflow-hidden rounded-full bg-surface" aria-hidden="true">
              <div className="h-full bg-speaking transition-[width] duration-100" style={{ width: `${Math.min(100, (rec.elapsed / part.speakSeconds) * 100)}%` }} />
            </div>
            <Button variant="danger" onClick={() => void rec.stop()} disabled={!recording} data-testid="stop-recording">
              ⏹ {t('speaking.stop')}
            </Button>
          </>
        )}
        {phase === 'uploading' && <p className="text-sm font-semibold">{t('speaking.uploading')}</p>}
        {phase === 'idle' && !recording && (
          <>
            {!recordingSupported() && <Alert tone="warn">{t('speaking.micErrors.unsupported')}</Alert>}
            {(!take || canRecordAgain) && !ctx.readOnly && (
              <Button onClick={begin} data-testid="start-speaking" disabled={!recordingSupported()}>
                🎤 {take ? t('speaking.recordAgain') : part.prepSeconds > 0 ? t('speaking.startPrep', { count: part.prepSeconds }) : t('speaking.startRecording')}
              </Button>
            )}
            {pending && !ctx.readOnly && (
              <Button variant="secondary" onClick={() => void upload(pending)} data-testid="retry-upload">
                ⬆️ {t('speaking.retryUpload')}
              </Button>
            )}
          </>
        )}
        {micError && <Alert tone="danger">{t(`speaking.micErrors.${micError.kind}`)}</Alert>}
        {error !== null && <Alert tone="danger">{errorMessage(t, error)}</Alert>}
      </div>

      {(take || localUrl) && (
        <div className="mt-3 space-y-2 text-sm">
          {localUrl && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted">{t('speaking.listenBack')}</span>
              <audio src={localUrl} controls className="h-10 max-w-full" />
            </div>
          )}
          {take && (
            <div className={cx('rounded-xl p-3', take.status === 'transcribed' ? 'bg-surface-2' : 'bg-warn-soft')} data-testid="transcript-take">
              <p className="text-xs font-semibold text-muted">{t('speaking.transcript', { seconds: Math.round(take.durationSeconds) })}</p>
              <p className="mt-1" lang="en">
                {take.transcript || <em className="text-muted">{t('speaking.noSpeech')}</em>}
              </p>
              {take.status === 'unclear' && <p className="mt-1 text-xs text-warn">{t('speaking.unclearHint')}</p>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export function SpeakingTask({ item }: { item: SpeakingView }) {
  const { t } = useTranslation();
  const { L } = useLocalized();
  const consent = useConsent();
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{L(item.instructions)}</p>
      <Alert tone="neutral">🎧 {t('speaking.tips')}</Alert>
      {item.parts.map((p, i) => (
        <PartRecorder key={p.id} itemId={item.id} part={p} index={i} consent={consent} />
      ))}
      {consent.modal}
    </div>
  );
}
