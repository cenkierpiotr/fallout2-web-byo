/** Globalne zmienne (VAULT13.GAM) z powiadomieniem o zmianie (`gvarChanged`) i zapisem. */
export type GvarListener = (idx: number, value: number) => void;

export interface GlobalVarsJSON {
  version: 1;
  values: number[];
}

export class GlobalVars {
  private readonly values: Int32Array;
  private readonly listeners = new Set<GvarListener>();

  constructor(count: number, initial?: ArrayLike<number>) {
    this.values = new Int32Array(count);
    if (initial)
      for (let i = 0; i < Math.min(count, initial.length); i++)
        this.values[i] = initial[i] as number;
  }

  get size(): number {
    return this.values.length;
  }

  /** Indeks poza zakresem -> 0 (bez wyjatku). */
  get(idx: number): number {
    return this.values[idx] ?? 0;
  }

  /** Indeks poza zakresem: brak zmiany, false. */
  set(idx: number, value: number): boolean {
    if (!Number.isInteger(idx) || idx < 0 || idx >= this.values.length) return false;
    const v = value | 0;
    if (this.values[idx] === v) return true;
    this.values[idx] = v;
    for (const l of this.listeners) l(idx, v);
    return true;
  }

  subscribe(l: GvarListener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  toJSON(): GlobalVarsJSON {
    return { version: 1, values: Array.from(this.values) };
  }

  static fromJSON(j: GlobalVarsJSON, count?: number): GlobalVars {
    if (!j || j.version !== 1 || !Array.isArray(j.values))
      throw new Error('GlobalVars: nieprawidlowy zapis');
    return new GlobalVars(count ?? j.values.length, j.values);
  }
}
