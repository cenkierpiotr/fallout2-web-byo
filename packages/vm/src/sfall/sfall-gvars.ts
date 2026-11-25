/** Globalne zmienne sfall (set_sfall_global / get_sfall_global_*). Klucz tekstowy ma dokladnie 8 znakow, liczbowy: `#n`. */
export class SfallGvars {
  private data = new Map<string, number>();

  set(key: string | number, v: number): void {
    const k = this.normalizeKey(key);
    if (k === null) return;
    this.data.set(k, v);
  }

  getInt(key: string | number): number {
    const k = this.normalizeKey(key);
    if (k === null) return 0;
    return Math.trunc(this.data.get(k) ?? 0) | 0;
  }

  getFloat(key: string | number): number {
    const k = this.normalizeKey(key);
    if (k === null) return 0;
    return Math.fround(this.data.get(k) ?? 0);
  }

  has(key: string | number): boolean {
    const k = this.normalizeKey(key);
    return k !== null && this.data.has(k);
  }

  serialize(): Record<string, number> {
    return Object.fromEntries(this.data);
  }

  restore(data: Record<string, number>): void {
    this.data.clear();
    for (const [k, v] of Object.entries(data)) {
      if (typeof v === 'number' && (k.length === 8 || /^#-?\d+$/.test(k))) this.data.set(k, v);
    }
  }

  clear(): void {
    this.data.clear();
  }

  private normalizeKey(key: string | number): string | null {
    if (typeof key === 'number') return `#${key}`;
    return key.length === 8 ? key : null;
  }
}
