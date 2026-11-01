import { useCallback, useEffect, useRef, useState } from 'react';
import { WavRecorder, type RecordingResult } from '../audio/recorder';

export type RecorderState = 'idle' | 'starting' | 'recording' | 'stopping';

/** React wrapper around WavRecorder with level meter, elapsed time and auto-stop. */
export function useRecorder(maxSeconds: number, onComplete: (r: RecordingResult) => void) {
  const [state, setState] = useState<RecorderState>('idle');
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const rec = useRef<WavRecorder | null>(null);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stateRef = useRef<RecorderState>('idle');
  const complete = useRef(onComplete);
  complete.current = onComplete;

  const set = (s: RecorderState) => {
    stateRef.current = s;
    setState(s);
  };

  const clearTimer = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  const stop = useCallback(async () => {
    if (stateRef.current !== 'recording' || !rec.current) return;
    set('stopping');
    clearTimer();
    try {
      const r = await rec.current.stop();
      rec.current = null;
      set('idle');
      setLevel(0);
      complete.current(r);
    } catch {
      rec.current = null;
      set('idle');
    }
  }, []);

  const start = useCallback(async () => {
    if (stateRef.current !== 'idle') return;
    set('starting');
    setElapsed(0);
    const r = new WavRecorder((l) => setLevel(l));
    rec.current = r;
    try {
      await r.start();
    } catch (e) {
      rec.current = null;
      set('idle');
      throw e;
    }
    startedAt.current = performance.now();
    set('recording');
    timer.current = setInterval(() => {
      const s = (performance.now() - startedAt.current) / 1000;
      setElapsed(s);
      if (s >= maxSeconds) void stop();
    }, 100);
  }, [maxSeconds, stop]);

  const cancel = useCallback(() => {
    clearTimer();
    rec.current?.cancel();
    rec.current = null;
    set('idle');
    setLevel(0);
  }, []);

  useEffect(() => () => cancel(), [cancel]);

  /** ms since recording actually started (0 when not recording). */
  const recordingFor = () => (stateRef.current === 'recording' ? performance.now() - startedAt.current : 0);

  return { state, level, elapsed, start, stop, cancel, recordingFor, stateRef };
}
