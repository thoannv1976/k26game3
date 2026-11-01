/**
 * Microphone recorder producing 16 kHz mono 16-bit PCM WAV.
 * Uses an AudioWorklet when available, otherwise a ScriptProcessorNode (older Safari).
 */
import { chunksToWav, rms } from './wav';

const WORKLET_SOURCE = `
class EcsRecorderProcessor extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(2048); this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      for (let i = 0; i < ch.length; i++) {
        this.buf[this.n++] = ch[i];
        if (this.n === this.buf.length) { this.port.postMessage(this.buf.slice(0)); this.n = 0; }
      }
    }
    return true;
  }
}
registerProcessor('ecs-recorder', EcsRecorderProcessor);
`;

export interface RecordingResult {
  blob: Blob;
  durationSeconds: number;
  level: number;
}

export type MicErrorKind = 'unsupported' | 'denied' | 'no_device' | 'failed';

export class MicError extends Error {
  constructor(readonly kind: MicErrorKind, message: string) {
    super(message);
  }
}

export function recordingSupported(): boolean {
  return typeof window !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && typeof window.AudioContext !== 'undefined';
}

export class WavRecorder {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private nodes: AudioNode[] = [];
  private chunks: Float32Array[] = [];
  private rate = 48000;

  constructor(private readonly onLevel?: (level: number) => void) {}

  get recording() {
    return this.ctx !== null;
  }

  async start(): Promise<void> {
    if (!recordingSupported()) throw new MicError('unsupported', 'Recording is not supported in this browser');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (e) {
      const name = (e as DOMException).name;
      if (name === 'NotAllowedError' || name === 'SecurityError') throw new MicError('denied', 'Microphone permission denied');
      if (name === 'NotFoundError' || name === 'OverconstrainedError') throw new MicError('no_device', 'No microphone found');
      throw new MicError('failed', (e as Error).message);
    }
    try {
      const ctx = new AudioContext();
      this.ctx = ctx;
      if (ctx.state === 'suspended') await ctx.resume();
      this.rate = ctx.sampleRate;
      this.chunks = [];
      const source = ctx.createMediaStreamSource(this.stream);
      const mute = ctx.createGain();
      mute.gain.value = 0;
      mute.connect(ctx.destination);
      const push = (data: Float32Array) => {
        this.chunks.push(data);
        this.onLevel?.(Math.min(1, rms(data) * 4));
      };
      let node: AudioNode;
      if (ctx.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
        const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'application/javascript' }));
        try {
          await ctx.audioWorklet.addModule(url);
        } finally {
          URL.revokeObjectURL(url);
        }
        const w = new AudioWorkletNode(ctx, 'ecs-recorder', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
        w.port.onmessage = (ev: MessageEvent<Float32Array>) => push(ev.data);
        node = w;
      } else {
        const sp = ctx.createScriptProcessor(4096, 1, 1);
        sp.onaudioprocess = (ev) => push(new Float32Array(ev.inputBuffer.getChannelData(0)));
        node = sp;
      }
      source.connect(node);
      node.connect(mute);
      this.nodes = [source, node, mute];
    } catch (e) {
      this.cleanup();
      throw new MicError('failed', (e as Error).message);
    }
  }

  /** Stops recording and returns the encoded WAV. */
  async stop(): Promise<RecordingResult> {
    const chunks = this.chunks;
    const rate = this.rate;
    // Give the worklet a moment to flush the last buffer.
    await new Promise((r) => setTimeout(r, 60));
    this.cleanup();
    const { wav, durationSeconds, level } = chunksToWav(chunks, rate);
    return { blob: new Blob([wav], { type: 'audio/wav' }), durationSeconds, level };
  }

  cancel() {
    this.cleanup();
    this.chunks = [];
  }

  private cleanup() {
    for (const n of this.nodes) {
      try {
        n.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    this.nodes = [];
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => undefined);
  }
}
