import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { MicError, type RecordingResult } from '../audio/recorder';
import { Spinner, cx } from '../components/ui';
import { useRecorder } from './useRecorder';

const HOLD_MS = 650;

export interface MicButtonProps {
  maxSeconds: number;
  disabled: boolean;
  processing: boolean;
  /** Return false to block recording (e.g. consent missing). */
  beforeStart: () => boolean;
  onRecorded: (r: RecordingResult) => void;
  onMicError: (e: MicError) => void;
}

/** Tap to start / tap to stop, or press-and-hold to talk. */
export function MicButton({ maxSeconds, disabled, processing, beforeStart, onRecorded, onMicError }: MicButtonProps) {
  const { t } = useTranslation();
  const rec = useRecorder(maxSeconds, onRecorded);
  const ignoreNextUp = useRef(false);

  const begin = () => {
    if (!beforeStart()) return;
    rec.start().catch((e) => onMicError(e instanceof MicError ? e : new MicError('failed', String(e))));
  };

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || disabled || processing) return;
    e.preventDefault();
    if (rec.stateRef.current === 'recording') {
      ignoreNextUp.current = true;
      void rec.stop();
    } else if (rec.stateRef.current === 'idle') {
      ignoreNextUp.current = false;
      begin();
    }
  };

  const onPointerUp = () => {
    if (ignoreNextUp.current) {
      ignoreNextUp.current = false;
      return;
    }
    // Hold-to-talk: released after holding long enough while recording.
    if (rec.recordingFor() > HOLD_MS) void rec.stop();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
      e.preventDefault();
      if (disabled || processing) return;
      if (rec.stateRef.current === 'recording') void rec.stop();
      else if (rec.stateRef.current === 'idle') begin();
    }
  };

  const recording = rec.state === 'recording';
  const left = Math.max(0, Math.ceil(maxSeconds - rec.elapsed));
  const label = processing ? t('play.processing') : recording ? t('play.tapToStop') : rec.state === 'starting' ? t('play.micStarting') : t('play.tapToSpeak');

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative grid place-items-center">
        {recording && (
          <span
            className="absolute inset-0 rounded-full bg-danger/25 transition-transform duration-75"
            style={{ transform: `scale(${1 + rec.level * 0.6})` }}
            aria-hidden="true"
          />
        )}
        <button
          type="button"
          data-testid="play-mic"
          data-state={processing ? 'processing' : rec.state}
          aria-pressed={recording}
          aria-label={label}
          disabled={disabled && !recording}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => recording && void rec.stop()}
          onKeyDown={onKeyDown}
          onContextMenu={(e) => e.preventDefault()}
          className={cx(
            'relative grid h-20 w-20 touch-none place-items-center rounded-full text-white shadow-lg transition-colors select-none disabled:cursor-not-allowed disabled:opacity-40',
            recording ? 'bg-danger' : 'bg-primary hover:bg-primary-hover',
          )}
        >
          {processing || rec.state === 'starting' || rec.state === 'stopping' ? (
            <Spinner className="h-8 w-8" />
          ) : recording ? (
            <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor" />
            </svg>
          ) : (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
              <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
        </button>
      </div>
      <div className="min-h-10 text-center text-sm" aria-live="polite">
        <div className={cx('font-semibold', recording ? 'text-danger' : 'text-fg')}>{label}</div>
        {recording ? (
          <div className="flex items-center justify-center gap-2 text-xs text-muted">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-danger" aria-hidden="true" />
            {t('play.secondsLeft', { count: left })}
          </div>
        ) : (
          !processing && <div className="text-xs text-muted">{t('play.holdHint', { seconds: maxSeconds })}</div>
        )}
      </div>
      {recording && (
        <div className="h-1.5 w-40 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
          <div className="h-full bg-danger transition-[width] duration-100" style={{ width: `${Math.min(100, (rec.elapsed / maxSeconds) * 100)}%` }} />
        </div>
      )}
    </div>
  );
}
