import type { AcmStreamHandle } from '../acm/worker-client.js';

/** Wezel strumieniowy (AudioWorkletNode `acm-stream-processor` albo atrapa w testach). */
export interface MusicNodeLike {
  port: {
    postMessage(msg: unknown, transfer?: Transferable[]): void;
    onmessage: ((e: { data: unknown }) => void) | null;
  };
  connect(dest: unknown): unknown;
  disconnect(): void;
}

export interface MusicVfs {
  open(path: string): Promise<Uint8Array>;
}
export interface MusicAcm {
  openStream(buf: Uint8Array): Promise<AcmStreamHandle>;
}
export interface MusicCtx {
  readonly currentTime: number;
  createGain(): {
    gain: {
      setValueAtTime(v: number, t: number): unknown;
      linearRampToValueAtTime(v: number, t: number): unknown;
    };
    connect(dest: unknown): unknown;
    disconnect(): void;
  };
}

export interface MusicDeps {
  createNode: (opts: { sourceRate: number; channels: number }) => MusicNodeLike;
  /** Domyslnie setTimeout; test wstrzykuje reczny scheduler. */
  schedule?: (fn: () => void, ms: number) => unknown;
}

export interface PlayOptions {
  loop?: boolean;
  /** Domyslnie 1500 ms. */
  crossfadeMs?: number;
}

interface Track {
  path: string;
  stream: AcmStreamHandle;
  node: MusicNodeLike;
  gain: ReturnType<MusicCtx['createGain']>;
  loop: boolean;
  chunk: number;
  alive: boolean;
  pumping: boolean;
}

const CHUNK_SECONDS = 1;

/** Muzyka tla: strumien ACM -> worklet, petla przez seek(0), crossfade miedzy utworami. */
export class MusicPlayer {
  private cur: Track | null = null;
  private token = 0;

  constructor(
    private readonly ctx: MusicCtx,
    private readonly vfs: MusicVfs,
    private readonly acm: MusicAcm,
    private readonly out: unknown,
    private readonly deps: MusicDeps,
  ) {}

  get current(): string | null {
    return this.cur?.path ?? null;
  }

  async play(path: string, opts: PlayOptions = {}): Promise<void> {
    if (this.cur?.path === path && this.cur.alive) return;
    const my = ++this.token;
    const fadeMs = opts.crossfadeMs ?? 1500;
    const bytes = await this.vfs.open(path);
    const stream = await this.acm.openStream(bytes);
    if (my !== this.token) {
      stream.close(); // pojawilo sie nowsze play/stop w trakcie otwierania
      return;
    }
    const { sampleRate, channels } = stream.header;
    const node = this.deps.createNode({ sourceRate: sampleRate, channels });
    const gain = this.ctx.createGain();
    node.connect(gain);
    gain.connect(this.out);
    const now = this.ctx.currentTime;
    const prev = this.cur;
    const t: Track = {
      path,
      stream,
      node,
      gain,
      loop: opts.loop ?? true,
      chunk: Math.max(1, Math.floor(sampleRate * channels * CHUNK_SECONDS)),
      alive: true,
      pumping: false,
    };
    this.cur = t;
    node.port.onmessage = (e) => this.onMessage(t, e.data);
    if (prev) {
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(1, now + fadeMs / 1000);
      this.fadeOut(prev, fadeMs);
    } else {
      gain.gain.setValueAtTime(1, now);
    }
    await this.pump(t);
  }

  async stop(fadeMs = 0): Promise<void> {
    this.token++;
    const prev = this.cur;
    this.cur = null;
    if (prev) this.fadeOut(prev, fadeMs);
  }

  private fadeOut(t: Track, fadeMs: number): void {
    const now = this.ctx.currentTime;
    t.gain.gain.setValueAtTime(1, now);
    t.gain.gain.linearRampToValueAtTime(0, now + fadeMs / 1000);
    const kill = (): void => this.release(t);
    if (fadeMs <= 0) kill();
    else (this.deps.schedule ?? ((fn, ms) => setTimeout(fn, ms)))(kill, fadeMs);
  }

  private release(t: Track): void {
    if (!t.alive) return;
    t.alive = false;
    t.node.port.onmessage = null;
    t.stream.close();
    t.node.disconnect();
    t.gain.disconnect();
  }

  private onMessage(t: Track, data: unknown): void {
    const m = data as { type?: string };
    if (m.type === 'need') void this.pump(t);
  }

  /** Dosyla kolejny kawalek PCM; na koncu pliku petla (seek 0) albo sygnal done. */
  private async pump(t: Track): Promise<void> {
    if (!t.alive || t.pumping) return;
    t.pumping = true;
    try {
      let r = await t.stream.read(t.chunk);
      if (!t.alive) return;
      if (r.done && t.loop) {
        await t.stream.seek(0); // nastepny odczyt zaczyna utwor od poczatku
        if (!t.alive) return;
        if (r.samples.length === 0) {
          r = await t.stream.read(t.chunk);
          if (!t.alive) return;
        }
        r = { samples: r.samples, done: false };
      }
      t.node.port.postMessage({ type: 'push', samples: r.samples, done: r.done }, [
        r.samples.buffer,
      ]);
    } catch {
      this.release(t); // blad dekodera: cisza zamiast wyjatku w petli audio
      if (this.cur === t) this.cur = null;
    } finally {
      t.pumping = false;
    }
  }
}
