import type { AcmDecoder, SpeechVfs } from '../speech/SpeechPlayer.js';
import { sfxPath } from './names.js';

export interface SfxHandle {
  /** Nazwa faktycznie zagranego efektu (po aliasach). */
  readonly name: string;
  stop(): void;
}

/** Odtwarza krotkie efekty sound/sfx/*.acm; dekodowane bufory sa cache'owane. */
export class SfxPlayer {
  private readonly cache = new Map<string, Promise<AudioBuffer>>();
  private readonly active = new Set<AudioBufferSourceNode>();

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly vfs: SpeechVfs,
    private readonly acm: AcmDecoder,
    private readonly out: AudioNode,
    private readonly maxVoices = 16,
  ) {}

  /** Pierwsza istniejaca nazwa z listy kandydatow (lancuch aliasow). */
  firstExisting(candidates: readonly string[]): string | undefined {
    return candidates.find((n) => this.vfs.resolve(sfxPath(n)));
  }

  /** Gra pierwszego istniejacego kandydata; undefined gdy zaden nie istnieje lub blad dekodowania. */
  async play(candidates: string | readonly string[]): Promise<SfxHandle | undefined> {
    const list = typeof candidates === 'string' ? [candidates] : candidates;
    const name = this.firstExisting(list);
    if (!name) return undefined;
    let buffer: AudioBuffer;
    try {
      buffer = await this.load(name);
    } catch (e) {
      console.warn(`sfx ${name}: ${e instanceof Error ? e.message : String(e)}`);
      return undefined;
    }
    if (this.active.size >= this.maxVoices) return undefined;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.out);
    this.active.add(src);
    src.onended = () => this.active.delete(src);
    src.start(this.ctx.currentTime);
    return {
      name,
      stop: () => {
        try {
          src.stop();
        } catch {
          // juz zatrzymane
        }
        this.active.delete(src);
      },
    };
  }

  stopAll(): void {
    for (const s of [...this.active]) {
      try {
        s.stop();
      } catch {
        // juz zatrzymane
      }
    }
    this.active.clear();
  }

  private load(name: string): Promise<AudioBuffer> {
    let p = this.cache.get(name);
    if (!p) {
      p = (async () => {
        const { pcm, channels, sampleRate } = await this.acm.decode(
          await this.vfs.open(sfxPath(name)),
        );
        const frames = Math.floor(pcm.length / channels);
        const buf = this.ctx.createBuffer(channels, frames, sampleRate);
        for (let c = 0; c < channels; c++) {
          const o = buf.getChannelData(c);
          for (let i = 0; i < frames; i++) o[i] = (pcm[i * channels + c] ?? 0) / 32768;
        }
        return buf;
      })();
      p.catch(() => this.cache.delete(name));
      this.cache.set(name, p);
    }
    return p;
  }
}
