import type { GamResult } from './gam-loader.js';

export interface GvarReader {
  get(id: number): number;
}

/** Rejestr globali gry. Odczyt poza zakresem zwraca 0 (0x443c68 w oryginale loguje blad). */
export class GvarRegistry implements GvarReader {
  private readonly vals: Int32Array;
  private readonly names: string[];
  private readonly byName = new Map<string, number>();

  constructor(names: readonly string[], values: readonly number[]) {
    this.names = [...names];
    this.vals = Int32Array.from(values);
    this.names.forEach((n, i) => {
      if (!this.byName.has(n)) this.byName.set(n, i);
    });
  }

  static fromGam(g: GamResult): GvarRegistry {
    return new GvarRegistry(g.names, g.values);
  }

  get size(): number {
    return this.vals.length;
  }
  has(id: number): boolean {
    return Number.isInteger(id) && id >= 0 && id < this.vals.length;
  }
  get(id: number): number {
    return this.has(id) ? (this.vals[id] ?? 0) : 0;
  }
  set(id: number, v: number): void {
    if (this.has(id)) this.vals[id] = v;
  }
  idOf(name: string): number {
    return this.byName.get(name) ?? -1;
  }
  nameOf(id: number): string | undefined {
    return this.has(id) ? this.names[id] : undefined;
  }
  snapshot(): Record<string, number> {
    const out: Record<string, number> = {};
    for (let i = 0; i < this.vals.length; i++) out[String(i)] = this.vals[i] ?? 0;
    return out;
  }
  restore(rec: Record<string, number>): void {
    for (const [k, v] of Object.entries(rec)) {
      const id = Number(k);
      if (typeof v === 'number') this.set(id, v);
    }
  }
}
