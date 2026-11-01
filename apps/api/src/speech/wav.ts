/** Parses a PCM WAV (RIFF) file. The web client records 16-bit mono PCM. */
export interface WavInfo {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  pcm: Buffer;
  durationSeconds: number;
}

export function parseWav(buf: Buffer): WavInfo {
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Not a WAV file');
  }
  let offset = 12;
  let fmt: { format: number; channels: number; sampleRate: number; bits: number } | null = null;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ') {
      fmt = {
        format: buf.readUInt16LE(body),
        channels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        bits: buf.readUInt16LE(body + 14),
      };
    } else if (id === 'data') {
      if (!fmt) throw new Error('WAV data before fmt chunk');
      if (fmt.format !== 1 || fmt.bits !== 16) throw new Error('WAV must be 16-bit PCM');
      if (fmt.channels !== 1) throw new Error('WAV must be mono');
      if (fmt.sampleRate < 8000 || fmt.sampleRate > 48000) throw new Error('Unsupported sample rate');
      const end = Math.min(buf.length, body + size);
      const pcm = buf.subarray(body, end);
      return {
        sampleRate: fmt.sampleRate,
        channels: fmt.channels,
        bitsPerSample: fmt.bits,
        pcm,
        durationSeconds: pcm.length / 2 / fmt.sampleRate,
      };
    }
    offset = body + size + (size % 2);
  }
  throw new Error('WAV has no data chunk');
}

/** Builds a WAV file (used by tests and the dev tools). */
export function buildWav(pcm: Buffer, sampleRate = 16000): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** Root-mean-square level (0..1) – used to reject silent recordings early. */
export function rmsLevel(pcm: Buffer): number {
  const n = Math.floor(pcm.length / 2);
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const v = pcm.readInt16LE(i * 2) / 32768;
    sum += v * v;
  }
  return Math.sqrt(sum / n);
}
