/**
 * Cykle palety (R3b, dokumentacja techniczna). Czysta logika bez DOM:
 * z bazowej palety RGBA i tablic cykli liczy palete dla czasu `nowMs`.
 * Kolory cykli pochodza z tablic w binarce (indeksy 229..255 w color.pal to znaczniki).
 */

export interface PaletteCycle {
  name: string;
  /** Pierwszy i ostatni indeks palety nalezacy do cyklu (wlacznie). */
  first: number;
  last: number;
  /** Okres jednego ticku w ms przy mnozniku 1 (w grze: okres * s). */
  periodMs: number;
  /** 1: kolory wedruja ku wyzszym indeksom (zachowanie gry). */
  direction: 1 | -1;
  /** (last-first+1)*3 bajtow RGB 8-bit; ignorowane gdy ustawione `pulse`. */
  colors: Uint8Array;
  /** Tryb pulsowania kanalu R (alarm): fala trojkatna 0..maxR, krok stepR na tick. */
  pulse?: { maxR: number; stepR: number };
}

const rgb = (...v: number[]): Uint8Array => Uint8Array.from(v);

const DEFAULT: readonly PaletteCycle[] = [
  {
    name: 'slime',
    first: 229,
    last: 232,
    periodMs: 200,
    direction: 1,
    colors: rgb(0, 108, 0, 11, 115, 7, 27, 123, 15, 43, 131, 27),
  },
  {
    name: 'monitors',
    first: 233,
    last: 237,
    periodMs: 100,
    direction: 1,
    colors: rgb(107, 107, 111, 99, 103, 127, 87, 107, 143, 0, 147, 163, 107, 187, 255),
  },
  {
    name: 'fire_slow',
    first: 238,
    last: 242,
    periodMs: 200,
    direction: 1,
    colors: rgb(255, 0, 0, 215, 0, 0, 147, 43, 11, 255, 119, 0, 255, 59, 0),
  },
  {
    name: 'fire_fast',
    first: 243,
    last: 247,
    periodMs: 142,
    direction: 1,
    colors: rgb(71, 0, 0, 123, 0, 0, 179, 0, 0, 123, 0, 0, 71, 0, 0),
  },
  {
    name: 'shore',
    first: 248,
    last: 253,
    periodMs: 200,
    direction: 1,
    colors: rgb(83, 63, 43, 75, 59, 43, 67, 55, 39, 63, 51, 39, 55, 47, 35, 51, 43, 35),
  },
  {
    // R3b: poczatkowa delta w binarce = 0xfc (-4), maksimum R = 0x3c (60), timer 33 ms
    name: 'alarm',
    first: 254,
    last: 254,
    periodMs: 33,
    direction: 1,
    colors: new Uint8Array(0),
    pulse: { maxR: 60, stepR: 4 },
  },
];

export class PaletteCycler {
  static readonly DEFAULT_CYCLES: readonly PaletteCycle[] = DEFAULT;

  private readonly base: Uint8Array;
  private readonly pal: Uint8Array;
  private readonly cycles: readonly PaletteCycle[];
  private readonly speed: number;

  /** `speedFactor` to mnoznik okresu z gry (`cycle_speed_factor`): wiekszy = wolniej. */
  constructor(
    base: Uint8Array,
    cycles: readonly PaletteCycle[] = PaletteCycler.DEFAULT_CYCLES,
    speedFactor = 1,
  ) {
    if (base.length !== 1024) throw new Error(`base musi miec 1024 B, ma ${base.length}`);
    for (const c of cycles) {
      const n = c.last - c.first + 1;
      if (n < 1 || c.first < 0 || c.last > 255) throw new Error(`cykl ${c.name}: zly zakres`);
      if (!c.pulse && c.colors.length !== n * 3) {
        throw new Error(`cykl ${c.name}: colors ma ${c.colors.length} B, oczekiwano ${n * 3}`);
      }
      if (!(c.periodMs > 0)) throw new Error(`cykl ${c.name}: zly okres`);
    }
    this.base = new Uint8Array(base);
    this.pal = new Uint8Array(base);
    this.cycles = cycles;
    this.speed = Number.isFinite(speedFactor) && speedFactor > 0 ? speedFactor : 1;
    this.apply(0);
  }

  /** Aktualizuje palete dla czasu `nowMs`; true, gdy jakikolwiek bajt sie zmienil. */
  tick(nowMs: number): boolean {
    const t = Number.isFinite(nowMs) && nowMs > 0 ? nowMs : 0;
    return this.apply(t);
  }

  /** Biezaca paleta RGBA (1024 B); ten sam bufor przy kazdym wywolaniu. */
  getPalette(): Uint8Array {
    return this.pal;
  }

  isEmissive(index: number): boolean {
    return this.cycles.some((c) => index >= c.first && index <= c.last);
  }

  private set(i: number, r: number, g: number, b: number): boolean {
    const o = i * 4;
    const p = this.pal;
    const changed = p[o] !== r || p[o + 1] !== g || p[o + 2] !== b || p[o + 3] !== 255;
    p[o] = r;
    p[o + 1] = g;
    p[o + 2] = b;
    p[o + 3] = 255;
    return changed;
  }

  private apply(t: number): boolean {
    let changed = false;
    for (const c of this.cycles) {
      const ticks = Math.floor(t / (c.periodMs * this.speed));
      if (c.pulse) {
        const steps = Math.max(1, Math.round(c.pulse.maxR / c.pulse.stepR));
        const pos = ticks % (2 * steps);
        const k = pos <= steps ? pos : 2 * steps - pos;
        if (this.set(c.first, Math.min(255, k * c.pulse.stepR), 0, 0)) changed = true;
        continue;
      }
      const n = c.last - c.first + 1;
      const shift = ticks % n;
      for (let j = 0; j < n; j++) {
        const s = (c.direction === 1 ? (j - shift + n) % n : (j + shift) % n) * 3;
        const col = c.colors;
        if (this.set(c.first + j, col[s]!, col[s + 1]!, col[s + 2]!)) changed = true;
      }
    }
    return changed;
  }
}
