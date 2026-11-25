/** Minimalny podzbior AudioContext uzywany przez adapter (ulatwia testy bez przegladarki). */
export interface PcmAudioBufferLike {
  getChannelData(channel: number): Float32Array;
}
export interface PcmSourceNodeLike {
  buffer: PcmAudioBufferLike | null;
  connect(dest: unknown): unknown;
  start(when?: number): void;
  stop(): void;
  onended: ((ev: Event) => unknown) | null;
}
export interface PcmAudioContextLike {
  readonly currentTime: number;
  readonly destination: unknown;
  createBuffer(channels: number, length: number, sampleRate: number): PcmAudioBufferLike;
  createBufferSource(): PcmSourceNodeLike;
  resume?(): Promise<void>;
  close?(): Promise<void>;
}

/**
 * Lekki adapter strumienia PCM (int16 przeplecione) do Web Audio: kazda porcja to bufor
 * planowany tuz po poprzedniej. `lead` to zapas (s) przy starcie i po niedoborze danych.
 */
export class PcmStreamSource {
  private nextTime = 0;
  private stopped = false;
  private readonly nodes = new Set<PcmSourceNodeLike>();

  constructor(
    private readonly ctx: PcmAudioContextLike,
    private readonly lead = 0.05,
  ) {}

  push(samples: Int16Array, sampleRate: number, stereo: boolean): void {
    if (this.stopped || samples.length === 0) return;
    const channels = stereo ? 2 : 1;
    const frames = Math.floor(samples.length / channels);
    if (frames === 0) return;
    const buf = this.ctx.createBuffer(channels, frames, sampleRate);
    for (let c = 0; c < channels; c++) {
      const out = buf.getChannelData(c);
      for (let i = 0; i < frames; i++) out[i] = samples[i * channels + c]! / 32768;
    }
    const node = this.ctx.createBufferSource();
    node.buffer = buf;
    node.connect(this.ctx.destination);
    const when = Math.max(this.nextTime, this.ctx.currentTime + this.lead);
    node.onended = () => this.nodes.delete(node);
    this.nodes.add(node);
    node.start(when);
    this.nextTime = when + frames / sampleRate;
  }

  stop(): void {
    this.stopped = true;
    for (const n of this.nodes) {
      try {
        n.stop();
      } catch {
        /* juz zatrzymane */
      }
    }
    this.nodes.clear();
  }

  /** Zamyka kontekst (po stop). */
  async close(): Promise<void> {
    this.stop();
    await this.ctx.close?.();
  }
}
