/** Deterministyczny generator pseudolosowy (mulberry32): ten sam seed daje ten sam ciag. */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Liczba z przedzialu [0,1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Liczba calkowita z przedzialu [min,max] (obustronnie wlacznie; przy min>max zamiana). */
  int(min: number, max: number): number {
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }
}
