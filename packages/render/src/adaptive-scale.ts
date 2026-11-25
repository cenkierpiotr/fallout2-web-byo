export interface AdaptiveScaleOptions {
  /** Docelowy czas klatki, ms (domyslnie 1000/60). */
  targetMs?: number;
  minScale?: number;
  maxScale?: number;
  /** Krok zmiany skali. */
  step?: number;
  /** Okno uśredniania (klatki). */
  window?: number;
  /** Ile kolejnych "zlych" okien przed obnizeniem. */
  downWindows?: number;
  /** Ile kolejnych "dobrych" okien przed podniesieniem (wiecej niz down: histereza). */
  upWindows?: number;
  /** Klatki dluzsze niz to (karta w tle, pauza) sa pomijane. */
  ignoreAboveMs?: number;
}

/**
 * Adaptacyjna rozdzielczosc renderu. Czasu GPU nie da sie zmierzyc wprost, wiec patrzymy na
 * odstep miedzy klatkami (rAF), czyli to, co widzi gracz. Srednia z okna > 1.25 x cel przez 2 okna z rzedu
 * obniza skale o `step`; srednia < 0.8 x cel przez 8 okien z rzedu podnosi ja (wolniej niz spada,
 * zeby nie oscylowac). Pojedyncze zatory (GC) usrednia okno; klatki > 250 ms sa ignorowane.
 * `sample` zwraca nowa skale tylko przy zmianie. Skala mnozy renderDpr (zmiana = resize bufora).
 */
export class AdaptiveScale {
  private cur: number;
  private sum = 0;
  private n = 0;
  private bad = 0;
  private good = 0;
  private readonly o: Required<AdaptiveScaleOptions>;

  constructor(opts: AdaptiveScaleOptions = {}) {
    this.o = {
      targetMs: 1000 / 60,
      minScale: 0.5,
      maxScale: 1,
      step: 0.125,
      window: 30,
      downWindows: 2,
      upWindows: 8,
      ignoreAboveMs: 250,
      ...opts,
    };
    this.cur = this.o.maxScale;
  }

  get scale(): number {
    return this.cur;
  }

  reset(): void {
    this.cur = this.o.maxScale;
    this.sum = 0;
    this.n = 0;
    this.bad = 0;
    this.good = 0;
  }

  sample(frameMs: number): number | undefined {
    if (!(frameMs > 0) || frameMs > this.o.ignoreAboveMs) return undefined;
    this.sum += frameMs;
    if (++this.n < this.o.window) return undefined;
    const avg = this.sum / this.n;
    this.sum = 0;
    this.n = 0;
    if (avg > this.o.targetMs * 1.25) {
      this.good = 0;
      if (++this.bad >= this.o.downWindows) return this.move(-this.o.step);
    } else if (avg < this.o.targetMs * 0.8) {
      this.bad = 0;
      if (++this.good >= this.o.upWindows) return this.move(this.o.step);
    } else {
      this.bad = 0;
      this.good = 0;
    }
    return undefined;
  }

  private move(delta: number): number | undefined {
    this.bad = 0;
    this.good = 0;
    const next =
      Math.round(Math.min(this.o.maxScale, Math.max(this.o.minScale, this.cur + delta)) * 1000) /
      1000;
    if (next === this.cur) return undefined;
    this.cur = next;
    return next;
  }
}
