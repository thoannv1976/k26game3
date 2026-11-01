import { describe, expect, it } from 'vitest';
import { chunksToWav, encodeWav, floatTo16BitPcm, mergeChunks, resample, rms, TARGET_SAMPLE_RATE } from './wav';

function ascii(view: DataView, offset: number, len: number) {
  let s = '';
  for (let i = 0; i < len; i++) s += String.fromCharCode(view.getUint8(offset + i));
  return s;
}

function sine(freq: number, rate: number, seconds: number, amp = 0.5) {
  const n = Math.round(rate * seconds);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * freq * i) / rate);
  return out;
}

/** Counts upward zero crossings – a cheap frequency estimate. */
function zeroCrossings(x: Float32Array) {
  let n = 0;
  for (let i = 1; i < x.length; i++) if (x[i - 1]! < 0 && x[i]! >= 0) n++;
  return n;
}

describe('mergeChunks', () => {
  it('concatenates in order', () => {
    const m = mergeChunks([new Float32Array([1, 2]), new Float32Array([]), new Float32Array([3])]);
    expect(Array.from(m)).toEqual([1, 2, 3]);
  });
});

describe('floatTo16BitPcm', () => {
  it('maps and clamps the float range', () => {
    const pcm = floatTo16BitPcm(new Float32Array([0, 1, -1, 2, -2, 0.5]));
    expect(Array.from(pcm)).toEqual([0, 32767, -32768, 32767, -32768, 16384]);
  });
});

describe('resample', () => {
  it('returns a copy when rates match', () => {
    const x = new Float32Array([0.1, 0.2]);
    const y = resample(x, 16000, 16000);
    expect(Array.from(y)).toEqual(Array.from(x));
    expect(y).not.toBe(x);
  });

  it('downsamples 48 kHz → 16 kHz with the right length', () => {
    const x = new Float32Array(48000).fill(0.25);
    const y = resample(x, 48000, 16000);
    expect(y.length).toBe(16000);
    // A constant signal stays constant.
    expect(Math.max(...y)).toBeCloseTo(0.25, 6);
    expect(Math.min(...y)).toBeCloseTo(0.25, 6);
  });

  it('handles non-integer ratios (44.1 kHz)', () => {
    const x = sine(440, 44100, 1);
    const y = resample(x, 44100, 16000);
    expect(y.length).toBe(16000);
    // Frequency is preserved: ~440 cycles per second.
    expect(Math.abs(zeroCrossings(y) - 440)).toBeLessThanOrEqual(2);
    // Energy roughly preserved for an in-band tone.
    expect(rms(y)).toBeGreaterThan(rms(x) * 0.9);
  });

  it('attenuates tones above the new Nyquist frequency', () => {
    const x = sine(15000, 48000, 0.5);
    const y = resample(x, 48000, 16000);
    expect(rms(y)).toBeLessThan(rms(x) * 0.5);
  });

  it('upsamples with linear interpolation', () => {
    const y = resample(new Float32Array([0, 1, 0, -1]), 8000, 16000);
    expect(y.length).toBe(8);
    expect(y[1]).toBeCloseTo(0.5, 6);
    expect(y[2]).toBeCloseTo(1, 6);
  });

  it('rejects invalid rates', () => {
    expect(() => resample(new Float32Array(4), 0, 16000)).toThrow();
  });
});

describe('encodeWav', () => {
  it('writes a valid 16-bit mono PCM header and data', () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1]);
    const buf = encodeWav(samples, 16000);
    const v = new DataView(buf);
    expect(buf.byteLength).toBe(44 + samples.length * 2);
    expect(ascii(v, 0, 4)).toBe('RIFF');
    expect(v.getUint32(4, true)).toBe(36 + samples.length * 2);
    expect(ascii(v, 8, 4)).toBe('WAVE');
    expect(ascii(v, 12, 4)).toBe('fmt ');
    expect(v.getUint32(16, true)).toBe(16);
    expect(v.getUint16(20, true)).toBe(1); // PCM
    expect(v.getUint16(22, true)).toBe(1); // mono
    expect(v.getUint32(24, true)).toBe(16000);
    expect(v.getUint32(28, true)).toBe(32000);
    expect(v.getUint16(32, true)).toBe(2);
    expect(v.getUint16(34, true)).toBe(16);
    expect(ascii(v, 36, 4)).toBe('data');
    expect(v.getUint32(40, true)).toBe(samples.length * 2);
    expect(v.getInt16(44, true)).toBe(0);
    expect(v.getInt16(46, true)).toBe(16384);
    expect(v.getInt16(48, true)).toBe(-16384);
    expect(v.getInt16(50, true)).toBe(32767);
  });
});

describe('chunksToWav', () => {
  it('produces a 16 kHz WAV of the expected duration', () => {
    const rate = 48000;
    const chunks = [sine(300, rate, 0.5), sine(300, rate, 0.5)];
    const r = chunksToWav(chunks, rate);
    const v = new DataView(r.wav);
    expect(v.getUint32(24, true)).toBe(TARGET_SAMPLE_RATE);
    expect(r.durationSeconds).toBeCloseTo(1, 3);
    expect(r.wav.byteLength).toBe(44 + TARGET_SAMPLE_RATE * 2);
    expect(r.level).toBeGreaterThan(0.3);
  });
});
