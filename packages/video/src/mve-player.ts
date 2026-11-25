import { parseMovieCfg, parseSve, type MovieEffect, type SveCue } from '@f2/formats';
import { MveDecoder } from './mve-decoder.js';

export type MovieName =
  | 'iplogo'
  | 'intro'
  | 'elder'
  | 'vsuit'
  | 'afailed'
  | 'artimer1'
  | 'artimer2'
  | 'artimer3'
  | 'artimer4'
  | 'timeout'
  | 'tanker'
  | 'derrick'
  | 'credits';

export type MovieResult = 'finished' | 'skipped' | 'missing' | 'error';

export interface MovieAssets {
  mve: Uint8Array;
  /** Tekst SVE (juz zdekodowany z cp1252). */
  sve?: string;
  /** Tekst .cfg filmu. */
  cfg?: string;
}

/** Zaciemnienie: kolor 0..255 i udzial koloru w obrazie (1 = pelny kolor, 0 = czysty obraz). */
export interface MovieFade {
  color: [number, number, number];
  amount: number;
}

export interface MovieFrameOut {
  rgba: Uint8Array;
  width: number;
  height: number;
  index: number;
  fade: MovieFade | null;
}

export interface MovieSink {
  frame(f: MovieFrameOut): void;
  /** Tekst napisu albo null (brak). Wywolywane tylko przy zmianie. */
  subtitle(text: string | null): void;
  /** Przeplecione int16 (stereo, jesli stereo=true). */
  audio?(samples: Int16Array, sampleRate: number, stereo: boolean): void;
}

export interface MovieClock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export interface MvePlayerDeps {
  /** null = brak filmu w VFS. */
  load(name: MovieName): Promise<MovieAssets | null>;
  sink: MovieSink;
  clock?: MovieClock;
}

export interface PlayOptions {
  subtitles?: boolean;
  skippable?: boolean;
}

const realClock: MovieClock = {
  now: () => performance.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

/** Zaciemnienie w klatce `frame` wg efektow z .cfg (czysta funkcja). */
export function fadeAt(effects: readonly MovieEffect[], frame: number): MovieFade | null {
  const first = effects[0];
  if (!first) return null;
  const full = (c: [number, number, number]): MovieFade => ({
    color: [c[0] * 4, c[1] * 4, c[2] * 4],
    amount: 1,
  });
  let cur: MovieEffect | null = null;
  for (const e of effects) if (e.startFrame <= frame) cur = e;
  if (!cur) return first.kind === 'in' ? full(first.color) : null;
  const k = frame - cur.startFrame;
  if (k < cur.steps) {
    const t = (k + 1) / cur.steps;
    const amount = cur.kind === 'in' ? 1 - t : t;
    return amount <= 0 ? null : { color: full(cur.color).color, amount };
  }
  return cur.kind === 'out' ? full(cur.color) : null;
}

/** Odtwarzacz MVE bez DOM: tempo wg fps filmu i zegara, wyjscie przez MovieSink. */
export class MvePlayer {
  private skipRequested = false;
  private playing = false;
  private skippable = true;

  constructor(private readonly deps: MvePlayerDeps) {}

  skip(): void {
    if (this.playing && this.skippable) this.skipRequested = true;
  }

  async play(name: MovieName, opts: PlayOptions = {}): Promise<MovieResult> {
    if (this.playing) throw new Error('film juz odtwarzany');
    this.playing = true;
    this.skipRequested = false;
    this.skippable = opts.skippable ?? true;
    const { sink } = this.deps;
    const clock = this.deps.clock ?? realClock;
    let subtitleShown = false;
    try {
      let assets: MovieAssets | null;
      try {
        assets = await this.deps.load(name);
      } catch {
        return 'error';
      }
      if (!assets) return 'missing';

      let dec: MveDecoder;
      try {
        dec = new MveDecoder(assets.mve);
      } catch {
        return 'error';
      }
      let effects: MovieEffect[] = [];
      try {
        if (assets.cfg) effects = parseMovieCfg(assets.cfg).effects;
      } catch {
        effects = [];
      }
      const cues: SveCue[] = (opts.subtitles ?? true) && assets.sve ? parseSve(assets.sve) : [];
      let cueIdx = 0;
      let lastText: string | null = null;

      const period = 1000 / dec.fps;
      let t0 = clock.now();
      for (let k = 0; ; k++) {
        if (this.skipRequested) return 'skipped';
        const f = dec.nextFrame();
        if (!f) return dec.error ? 'error' : 'finished';
        let text: string | null = lastText;
        while (cueIdx < cues.length && cues[cueIdx]!.frame <= f.index) {
          text = cues[cueIdx]!.text === '' ? null : cues[cueIdx]!.text;
          cueIdx++;
        }
        if (text !== lastText) {
          sink.subtitle(text);
          subtitleShown = text !== null;
          lastText = text;
        }
        const w = dec.width;
        const h = dec.videoHeight;
        sink.frame({
          rgba: f.rgba.subarray(0, w * h * 4),
          width: w,
          height: h,
          index: f.index,
          fade: fadeAt(effects, f.index),
        });
        if (f.audio && sink.audio) {
          sink.audio(f.audio, dec.audioInit?.sampleRate ?? 22050, dec.audioInit?.stereo ?? true);
        }
        // tempo: klatka k+1 w t0 + (k+1)*period; przy duzym opoznieniu synchronizuj na nowo
        const due = t0 + (k + 1) * period;
        const wait = due - clock.now();
        if (wait < -4 * period) t0 = clock.now() - (k + 1) * period;
        await clock.sleep(Math.max(0, wait));
      }
    } finally {
      if (subtitleShown) sink.subtitle(null);
      this.playing = false;
    }
  }
}
