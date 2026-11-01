import speech from '@google-cloud/speech';
import type { SpeechMetrics } from '@vq/shared';
import type { WavInfo } from './wav.js';

export interface SttResult {
  transcript: string;
  confidence: number;
  metrics: SpeechMetrics;
  billedSeconds: number;
}

export interface SttContext {
  /** Used only by the offline provider to return a realistic line for the current stage. */
  scriptedLine?: string;
  phraseHints?: string[];
}

export interface SpeechToText {
  readonly name: string;
  recognize(wav: WavInfo, ctx: SttContext): Promise<SttResult>;
}

const LONG_PAUSE_SECONDS = 1.5;

type Duration = { seconds?: number | string | null; nanos?: number | null } | null | undefined;
const secs = (d: Duration) => Number(d?.seconds ?? 0) + (d?.nanos ?? 0) / 1e9;

export function metricsFromWords(words: { start: number; end: number }[], confidence: number): SpeechMetrics {
  if (words.length === 0) return { words: 0, speechSeconds: 0, longPauses: 0, confidence };
  let longPauses = 0;
  for (let i = 1; i < words.length; i++) {
    if (words[i]!.start - words[i - 1]!.end > LONG_PAUSE_SECONDS) longPauses++;
  }
  const speechSeconds = Math.max(0.1, words[words.length - 1]!.end - words[0]!.start);
  return { words: words.length, speechSeconds, longPauses, confidence };
}

export class GoogleSpeechToText implements SpeechToText {
  readonly name = 'google';
  private readonly client = new speech.SpeechClient();
  constructor(
    private readonly model: string,
    private readonly language: string,
  ) {}

  async recognize(wav: WavInfo, ctx: SttContext): Promise<SttResult> {
    const [res] = await this.client.recognize({
      config: {
        encoding: 'LINEAR16',
        sampleRateHertz: wav.sampleRate,
        languageCode: this.language,
        enableWordTimeOffsets: true,
        enableWordConfidence: true,
        enableAutomaticPunctuation: true,
        model: this.model,
        profanityFilter: true,
        speechContexts: ctx.phraseHints?.length ? [{ phrases: ctx.phraseHints.slice(0, 50) }] : undefined,
      },
      audio: { content: wav.pcm.toString('base64') },
    });
    const parts: string[] = [];
    const words: { start: number; end: number }[] = [];
    let confSum = 0;
    let confN = 0;
    for (const r of res.results ?? []) {
      const alt = r.alternatives?.[0];
      if (!alt?.transcript) continue;
      parts.push(alt.transcript.trim());
      if (typeof alt.confidence === 'number') {
        confSum += alt.confidence;
        confN++;
      }
      for (const w of alt.words ?? []) words.push({ start: secs(w.startTime as Duration), end: secs(w.endTime as Duration) });
    }
    const confidence = confN ? confSum / confN : 0;
    return {
      transcript: parts.join(' ').trim(),
      confidence,
      metrics: metricsFromWords(words, confidence),
      billedSeconds: Math.ceil(wav.durationSeconds),
    };
  }
}

/** Offline STT for development/tests: returns the scripted line for the current stage. */
export class FakeSpeechToText implements SpeechToText {
  readonly name = 'fake';
  async recognize(wav: WavInfo, ctx: SttContext): Promise<SttResult> {
    const transcript = wav.durationSeconds < 0.3 ? '' : (ctx.scriptedLine ?? 'I would like some help, please.');
    const n = transcript.split(/\s+/).filter(Boolean).length;
    const speechSeconds = Math.max(0.5, Math.min(wav.durationSeconds, n / 2.2));
    return {
      transcript,
      confidence: transcript ? 0.92 : 0,
      metrics: { words: n, speechSeconds, longPauses: 0, confidence: transcript ? 0.92 : 0 },
      billedSeconds: Math.ceil(wav.durationSeconds),
    };
  }
}
