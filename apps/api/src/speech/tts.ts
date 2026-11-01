import { createHash } from 'node:crypto';
import textToSpeech from '@google-cloud/text-to-speech';
import type { BlobStore } from '../blob.js';

export interface Voice {
  languageCode: string;
  name: string;
}

export interface TextToSpeech {
  readonly name: string;
  /** Returns MP3 bytes, or null when the provider has no audio (client uses browser speech). */
  synthesize(text: string, voice: Voice, speakingRate: number): Promise<Buffer | null>;
}

export class GoogleTextToSpeech implements TextToSpeech {
  readonly name = 'google';
  private readonly client = new textToSpeech.TextToSpeechClient();
  async synthesize(text: string, voice: Voice, speakingRate: number) {
    const [res] = await this.client.synthesizeSpeech({
      input: { text },
      voice: { languageCode: voice.languageCode, name: voice.name },
      audioConfig: { audioEncoding: 'MP3', speakingRate },
    });
    if (!res.audioContent) return null;
    return Buffer.from(res.audioContent as Uint8Array);
  }
}

/** Offline TTS: no audio; the web client falls back to the browser's speech synthesis. */
export class FakeTextToSpeech implements TextToSpeech {
  readonly name = 'fake';
  async synthesize() {
    return null;
  }
}

export function ttsHash(text: string, voice: Voice, rate: number): string {
  return createHash('sha256').update(`${voice.languageCode}|${voice.name}|${rate}|${text}`).digest('hex').slice(0, 40);
}

export const ttsPath = (hash: string) => `tts-cache/${hash}.mp3`;

/**
 * Cached synthesis: identical lines (opening lines, fallback lines) are synthesized once
 * and served from storage. Returns the hash or null if no audio is available.
 */
export async function cachedTts(
  tts: TextToSpeech,
  blobs: BlobStore,
  text: string,
  voice: Voice,
  rate: number,
): Promise<{ hash: string | null; chars: number; cached: boolean }> {
  const hash = ttsHash(text, voice, rate);
  if (await blobs.exists(ttsPath(hash))) return { hash, chars: 0, cached: true };
  const audio = await tts.synthesize(text, voice, rate);
  if (!audio) return { hash: null, chars: 0, cached: false };
  await blobs.put(ttsPath(hash), audio, 'audio/mpeg');
  return { hash, chars: text.length, cached: false };
}
