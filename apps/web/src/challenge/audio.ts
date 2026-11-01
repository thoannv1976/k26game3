/**
 * Plays listening audio returned by POST /api/attempts/:id/play.
 * - "segments": pre-rendered MP3 files behind the API (fetched with the auth header, played one after another).
 * - "browser_tts": development only (no Text-to-Speech configured) – the browser reads the script aloud.
 * Playback always finishes: if the browser never reports the end (e.g. headless speech synthesis) a timeout based on
 * the text length / segment duration ends it, so the UI never hangs.
 */
import { api } from '../api/client';
import type { PlayAudio } from '../api/types';

export interface PlayHandle {
  done: Promise<void>;
  stop: () => void;
}

/** Fallback duration of a spoken line (ms): ~14 characters per second, at least 1.5 s. */
export function speechFallbackMs(text: string): number {
  return Math.max(1500, Math.round((text.length / 14) * 1000) + 800);
}

function wait(ms: number, signal: { stopped: boolean }) {
  return new Promise<void>((resolve) => {
    const start = Date.now();
    const tick = () => (signal.stopped || Date.now() - start >= ms ? resolve() : setTimeout(tick, 100));
    tick();
  });
}

function pickVoice(languageCode: string, name: string): SpeechSynthesisVoice | null {
  const voices = typeof speechSynthesis !== 'undefined' ? speechSynthesis.getVoices() : [];
  return voices.find((v) => v.name === name) ?? voices.find((v) => v.lang === languageCode) ?? voices.find((v) => v.lang.startsWith(languageCode.slice(0, 2))) ?? null;
}

function speak(text: string, voice: { languageCode: string; name: string }, signal: { stopped: boolean }): Promise<void> {
  return new Promise<void>((resolve) => {
    let finished = false;
    const end = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(end, speechFallbackMs(text));
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = voice.languageCode;
      const v = pickVoice(voice.languageCode, voice.name);
      if (v) u.voice = v;
      u.rate = 0.95;
      u.onend = end;
      u.onerror = end;
      speechSynthesis.speak(u);
    } catch {
      end();
    }
    const poll = setInterval(() => {
      if (signal.stopped) {
        clearInterval(poll);
        end();
      } else if (finished) clearInterval(poll);
    }, 150);
  });
}

function playBlob(el: HTMLAudioElement, blob: Blob, seconds: number, signal: { stopped: boolean }): Promise<void> {
  return new Promise<void>((resolve) => {
    const url = URL.createObjectURL(blob);
    let finished = false;
    const end = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      clearInterval(poll);
      el.onended = null;
      el.onerror = null;
      URL.revokeObjectURL(url);
      resolve();
    };
    const timer = setTimeout(end, Math.max(4000, seconds * 1500 + 4000));
    const poll = setInterval(() => {
      if (signal.stopped) {
        el.pause();
        end();
      }
    }, 150);
    el.onended = end;
    el.onerror = end;
    el.src = url;
    el.play().catch(end);
  });
}

export function playAudio(audio: PlayAudio, el: HTMLAudioElement | null, onLine: (index: number, total: number) => void): PlayHandle {
  const signal = { stopped: false };
  const done = (async () => {
    if (audio.kind === 'segments') {
      const segs = [...audio.segments].sort((a, b) => a.index - b.index);
      for (const [i, s] of segs.entries()) {
        if (signal.stopped) break;
        onLine(i, segs.length);
        let blob: Blob;
        try {
          blob = await api.blob(s.url);
        } catch {
          continue;
        }
        if (el) await playBlob(el, blob, s.seconds, signal);
        else await wait(s.seconds * 1000, signal);
      }
      return;
    }
    const supported = typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
    if (supported) speechSynthesis.cancel();
    for (const [i, l] of audio.lines.entries()) {
      if (signal.stopped) break;
      onLine(i, audio.lines.length);
      if (supported) await speak(l.text, l.voice, signal);
      else await wait(speechFallbackMs(l.text), signal);
    }
  })();
  return {
    done,
    stop: () => {
      signal.stopped = true;
      try {
        if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
      } catch {
        /* ignore */
      }
      el?.pause();
    },
  };
}
