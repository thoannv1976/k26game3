/**
 * Pure helpers for browser voice recording: merge captured chunks, resample to 16 kHz
 * and encode a 16-bit mono PCM WAV file (the format the API / Speech-to-Text expects).
 * No DOM APIs here so it can be unit tested in Node.
 */

export const TARGET_SAMPLE_RATE = 16000;

/** Concatenates Float32 chunks captured from the audio graph. */
export function mergeChunks(chunks: Float32Array[]): Float32Array {
  let length = 0;
  for (const c of chunks) length += c.length;
  const out = new Float32Array(length);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/**
 * Resamples mono audio. Downsampling averages every source sample that falls inside an
 * output sample's window (a simple box low-pass filter that limits aliasing);
 * upsampling uses linear interpolation.
 */
export function resample(input: Float32Array, fromRate: number, toRate: number = TARGET_SAMPLE_RATE): Float32Array {
  if (!(fromRate > 0) || !(toRate > 0)) throw new Error('Sample rates must be positive');
  if (fromRate === toRate) return input.slice();
  const ratio = fromRate / toRate;
  const outLength = Math.floor(input.length / ratio);
  const out = new Float32Array(outLength);
  if (ratio > 1) {
    for (let i = 0; i < outLength; i++) {
      const start = i * ratio;
      const end = Math.min(input.length, start + ratio);
      let j = Math.floor(start);
      let sum = 0;
      let weight = 0;
      while (j < end) {
        // Fractional overlap of source sample j with [start, end).
        const w = Math.min(j + 1, end) - Math.max(j, start);
        if (w > 0) {
          sum += input[j]! * w;
          weight += w;
        }
        j++;
      }
      out[i] = weight > 0 ? sum / weight : 0;
    }
  } else {
    for (let i = 0; i < outLength; i++) {
      const pos = i * ratio;
      const j = Math.floor(pos);
      const frac = pos - j;
      const a = input[j] ?? 0;
      const b = input[j + 1] ?? a;
      out[i] = a + (b - a) * frac;
    }
  }
  return out;
}

/** Float [-1, 1] → signed 16-bit PCM (clamped). */
export function floatTo16BitPcm(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    out[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
  }
  return out;
}

function writeAscii(view: DataView, offset: number, text: string) {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}

/** Encodes mono samples as a canonical 44-byte-header PCM WAV (16-bit, little endian). */
export function encodeWav(samples: Float32Array, sampleRate: number = TARGET_SAMPLE_RATE): ArrayBuffer {
  const pcm = floatTo16BitPcm(samples);
  const dataBytes = pcm.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataBytes, true);
  for (let i = 0; i < pcm.length; i++) view.setInt16(44 + i * 2, pcm[i]!, true);
  return buffer;
}

/** Root-mean-square level (0..1). */
export function rms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i]! * samples[i]!;
  return Math.sqrt(sum / samples.length);
}

/** Full pipeline used by the recorder: chunks at the context rate → 16 kHz WAV. */
export function chunksToWav(chunks: Float32Array[], inputRate: number): { wav: ArrayBuffer; durationSeconds: number; level: number } {
  const merged = mergeChunks(chunks);
  const resampled = resample(merged, inputRate, TARGET_SAMPLE_RATE);
  return {
    wav: encodeWav(resampled, TARGET_SAMPLE_RATE),
    durationSeconds: resampled.length / TARGET_SAMPLE_RATE,
    level: rms(resampled),
  };
}
