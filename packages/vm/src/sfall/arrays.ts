export type ArrayKey = number | string;
export type ArrayVal = number | string;

export interface SerializedArray {
  id: number;
  assoc: boolean;
  temp: boolean;
  fixed: boolean;
  name?: string;
  items: Array<[ArrayKey, ArrayVal]>;
}

interface ArrayData {
  assoc: boolean;
  temp: boolean;
  fixed: boolean;
  name?: string;
  list: ArrayVal[];
  map: Map<ArrayKey, ArrayVal>;
}

/** Tablice sfall (create_array, set_array, ...): lista lub asocjacyjna, tymczasowe, zapis pod nazwa. */
export class SfallArrays {
  private arrays = new Map<number, ArrayData>();
  private names = new Map<string, number>();
  private nextId = 1;
  private lastExprId = 0;

  create(size: number, assoc = false): number {
    return this.add(false, assoc, size);
  }

  createTemp(size: number, assoc = false): number {
    return this.add(true, assoc, size);
  }

  fix(id: number): void {
    const a = this.arrays.get(id);
    if (!a) return;
    a.temp = false;
    a.fixed = true;
  }

  get(id: number, key: ArrayKey): ArrayVal {
    const a = this.arrays.get(id);
    if (!a) return 0;
    if (a.assoc) return a.map.get(key) ?? 0;
    return typeof key === 'number' ? (a.list[key] ?? 0) : 0;
  }

  set(id: number, key: ArrayKey, v: ArrayVal): void {
    const a = this.arrays.get(id);
    if (!a) return;
    if (a.assoc) {
      a.map.set(key, v);
    } else if (
      typeof key === 'number' &&
      Number.isInteger(key) &&
      key >= 0 &&
      key < a.list.length
    ) {
      a.list[key] = v;
    }
  }

  /** Wpisuje element do ostatnio utworzonej tablicy (opkod arrayexpr 0x8257). */
  setExpr(key: ArrayKey, v: ArrayVal): void {
    if (this.lastExprId > 0) this.set(this.lastExprId, key, v);
  }

  len(id: number): number {
    const a = this.arrays.get(id);
    if (!a) return -1;
    return a.assoc ? a.map.size : a.list.length;
  }

  resize(id: number, n: number): void {
    const a = this.arrays.get(id);
    if (!a || a.assoc || n < 0) return;
    if (n < a.list.length) a.list.length = n;
    while (a.list.length < n) a.list.push(0);
  }

  free(id: number): void {
    const a = this.arrays.get(id);
    if (!a) return;
    this.arrays.delete(id);
    if (a.name !== undefined && this.names.get(a.name) === id) this.names.delete(a.name);
  }

  /** Zwalnia tablice tymczasowe (koniec procedury). */
  freeTemps(): void {
    for (const [id, a] of [...this.arrays]) if (a.temp) this.free(id);
  }

  save(id: number, name: string): void {
    const a = this.arrays.get(id);
    if (!a) return;
    const old = this.names.get(name);
    if (old !== undefined && old !== id) {
      const o = this.arrays.get(old);
      if (o) delete o.name;
    }
    a.name = name;
    this.names.set(name, id);
  }

  load(name: string): number {
    const id = this.names.get(name);
    return id !== undefined && this.arrays.has(id) ? id : 0;
  }

  scan(id: number, v: ArrayVal): ArrayKey {
    const a = this.arrays.get(id);
    if (!a) return -1;
    if (a.assoc) {
      for (const [k, x] of a.map) if (x === v) return k;
    } else {
      const i = a.list.indexOf(v);
      if (i >= 0) return i;
    }
    return -1;
  }

  keyAt(id: number, index: number): ArrayKey {
    const a = this.arrays.get(id);
    if (!a || index < 0) return -1;
    if (a.assoc) return [...a.map.keys()][index] ?? -1;
    return index < a.list.length ? index : -1;
  }

  has(id: number): boolean {
    return this.arrays.has(id);
  }

  /** Tylko tablice nietymczasowe. */
  serialize(): SerializedArray[] {
    const out: SerializedArray[] = [];
    for (const [id, a] of this.arrays) {
      if (a.temp) continue;
      const items: Array<[ArrayKey, ArrayVal]> = a.assoc
        ? [...a.map]
        : a.list.map((v, i): [ArrayKey, ArrayVal] => [i, v]);
      const s: SerializedArray = { id, assoc: a.assoc, temp: false, fixed: a.fixed, items };
      if (a.name !== undefined) s.name = a.name;
      out.push(s);
    }
    return out;
  }

  restore(list: readonly SerializedArray[]): void {
    this.arrays.clear();
    this.names.clear();
    let maxId = 0;
    for (const d of list) {
      if (d.id <= 0) continue;
      const cur: ArrayData = {
        assoc: d.assoc,
        temp: d.temp,
        fixed: d.fixed,
        list: d.assoc ? [] : new Array<ArrayVal>(d.items.length).fill(0),
        map: new Map(),
      };
      if (d.name !== undefined) cur.name = d.name;
      for (const [k, v] of d.items) {
        if (d.assoc) cur.map.set(k, v);
        else if (typeof k === 'number' && k >= 0 && k < cur.list.length) cur.list[k] = v;
      }
      this.arrays.set(d.id, cur);
      if (d.name !== undefined) this.names.set(d.name, d.id);
      if (d.id > maxId) maxId = d.id;
    }
    this.nextId = maxId + 1;
  }

  private add(temp: boolean, assoc: boolean, size: number): number {
    const id = this.nextId++;
    this.arrays.set(id, {
      assoc,
      temp,
      fixed: !temp,
      list: assoc ? [] : new Array<ArrayVal>(Math.max(0, Math.trunc(size))).fill(0),
      map: new Map(),
    });
    this.lastExprId = id;
    return id;
  }
}
