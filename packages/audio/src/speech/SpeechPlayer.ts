import { LipSync } from './LipSync.js';
import { parseLip } from './lip.js';

export class SpeechError extends Error {}

export interface AcmDecoder {
  decode(bytes: Uint8Array): Promise<{ pcm: Int16Array; channels: number; sampleRate: number }>;
}

export interface SpeechVfs {
  resolve(path: string): unknown;
  open(path: string): Promise<Uint8Array>;
}

export interface SayOptions {
  lipPath?: string;
  subtitle?: string;
  onMouth?: (frame: number) => void;
  onEnd?: () => void;
}

export interface SpeechHandle {
  readonly durationMs: number;
  readonly hasLip: boolean;
  readonly subtitle: string | undefined;
}

export interface SchedulerOptions {
  raf?: (cb: () => void) => number;
  caf?: (id: number) => void;
}

interface Active {
  src: AudioBufferSourceNode;
  opts: SayOptions | undefined;
  rafId: number | null;
  done: boolean;
}

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Odtwarza mowe (ACM po dekodowaniu) z synchronizacja ust (LIP) i napisami. */
export class SpeechPlayer {
  private active: Active | null = null;
  private readonly raf: (cb: () => void) => number;
  private readonly caf: (id: number) => void;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly vfs: SpeechVfs,
    private readonly acm: AcmDecoder,
    private readonly mixerOut: AudioNode,
    sched: SchedulerOptions = {},
  ) {
    this.raf = sched.raf ?? ((cb) => requestAnimationFrame(cb));
    this.caf = sched.caf ?? ((id) => cancelAnimationFrame(id));
  }

  async say(acmPath: string, opts?: SayOptions): Promise<SpeechHandle> {
    this.stop();
    if (!this.vfs.resolve(acmPath)) throw new SpeechError(`brak pliku mowy: ${acmPath}`);
    let decoded: Awaited<ReturnType<AcmDecoder['decode']>>;
    try {
      decoded = await this.acm.decode(await this.vfs.open(acmPath));
    } catch (e) {
      throw new SpeechError(`nie mozna odczytac mowy ${acmPath}: ${msg(e)}`);
    }
    const { pcm, channels, sampleRate } = decoded;
    const frames = Math.floor(pcm.length / channels);
    const buffer = this.ctx.createBuffer(channels, frames, sampleRate);
    for (let c = 0; c < channels; c++) {
      const out = buffer.getChannelData(c);
      for (let i = 0; i < frames; i++) out[i] = (pcm[i * channels + c] ?? 0) / 32768;
    }

    const lipSync = await this.loadLip(opts?.lipPath, pcm.length * 2);
    // Zadanie moglo zostac zastapione w trakcie await (drugi say()).
    this.stop();

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.mixerOut);
    const active: Active = { src, opts, rafId: null, done: false };
    this.active = active;
    src.onended = () => this.finish(active);
    const startTime = this.ctx.currentTime;
    src.start(startTime);

    const onMouth = opts?.onMouth;
    if (lipSync && onMouth) {
      let last = -1;
      const tick = (): void => {
        if (active.done) return;
        const pos = (this.ctx.currentTime - startTime) * sampleRate * channels * 2;
        const frame = lipSync.frameAt(pos);
        if (frame !== last) {
          last = frame;
          onMouth(frame);
        }
        if (!active.done) active.rafId = this.raf(tick);
      };
      active.rafId = this.raf(tick);
    }
    return {
      durationMs: (frames / sampleRate) * 1000,
      hasLip: lipSync !== undefined,
      subtitle: opts?.subtitle,
    };
  }

  stop(): void {
    const a = this.active;
    if (!a) return;
    try {
      a.src.stop();
    } catch {
      // zrodlo juz zatrzymane
    }
    this.finish(a);
  }

  private async loadLip(path: string | undefined, pcmBytes: number): Promise<LipSync | undefined> {
    if (!path || !this.vfs.resolve(path)) return undefined;
    try {
      const lip = parseLip(await this.vfs.open(path));
      if (lip.pcmBytes !== pcmBytes) {
        console.warn(`LIP ${path}: pcmBytes ${lip.pcmBytes} != ${pcmBytes}, gra bez ust`);
        return undefined;
      }
      return new LipSync(lip);
    } catch (e) {
      console.warn(`LIP ${path}: ${msg(e)}, gra bez ust`);
      return undefined;
    }
  }

  private finish(a: Active): void {
    if (a.done) return;
    a.done = true;
    if (a.rafId !== null) this.caf(a.rafId);
    a.rafId = null;
    if (this.active === a) this.active = null;
    a.opts?.onMouth?.(0);
    a.opts?.onEnd?.();
  }
}
