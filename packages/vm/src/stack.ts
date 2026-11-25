import { StackError } from './errors.js';

export type Value =
  | { t: 'int'; v: number }
  | { t: 'float'; v: number }
  | { t: 'str'; v: string }
  | { t: 'obj'; v: number }
  | { t: 'null' };

export const NULL_VALUE: Value = { t: 'null' };
export const int = (v: number): Value => ({ t: 'int', v: v | 0 });
export const float = (v: number): Value => ({ t: 'float', v: Math.fround(v) });
export const str = (v: string): Value => ({ t: 'str', v });
export const obj = (v: number): Value => ({ t: 'obj', v });

const strOffsetMap = new WeakMap<Value, number>();

/** String statyczny z push_const 0x9001 pamietajacy oryginalny offset (do kolizji id/string przy opkodach external). */
export const strStatic = (v: string, off: number): Value => {
  const val: Value = { t: 'str', v };
  strOffsetMap.set(val, off);
  return val;
};

export const strOffsetOf = (v: Value): number | undefined => strOffsetMap.get(v);

/** Stos danych: 0x1000 B, element = value32 + tag16 = 6 B (spec int-opcodes.md) => 682 elementow. */
export const STACK_CAPACITY = Math.floor(0x1000 / 6);

export class ValueStack {
  private readonly items: Value[] = [];

  constructor(private readonly capacity: number = STACK_CAPACITY) {}

  push(v: Value): void {
    if (this.items.length >= this.capacity) throw new StackError('przepelnienie stosu danych');
    this.items.push(v);
  }

  pop(): Value {
    const v = this.items.pop();
    if (v === undefined) throw new StackError('niedomiar stosu danych');
    return v;
  }

  /** Liczba calkowita; obj/null daja id/0, float jest obcinany, string to blad. */
  popInt(): number {
    return toInt(this.pop());
  }

  popStr(): string {
    const v = this.pop();
    if (v.t !== 'str') throw new StackError(`oczekiwano stringu, jest ${v.t}`);
    return v.v;
  }

  /** peek(0) = szczyt. */
  peek(n = 0): Value {
    const v = this.items[this.items.length - 1 - n];
    if (v === undefined) throw new StackError('niedomiar stosu danych (peek)');
    return v;
  }

  /** Element o indeksie bezwzglednym (0 = dno stosu); poza stosem to blad. */
  get(index: number): Value {
    const v = this.items[index];
    if (v === undefined || index < 0)
      throw new StackError(`indeks ${index} poza stosem danych (glebokosc ${this.items.length})`);
    return v;
  }

  set(index: number, v: Value): void {
    if (index < 0 || index >= this.items.length) {
      throw new StackError(`indeks ${index} poza stosem danych (glebokosc ${this.items.length})`);
    }
    this.items[index] = v;
  }

  depth(): number {
    return this.items.length;
  }

  truncate(depth: number): void {
    if (depth < this.items.length) this.items.length = Math.max(0, depth);
  }

  toArray(): Value[] {
    return this.items.slice();
  }
}

export function toInt(v: Value): number {
  switch (v.t) {
    case 'int':
    case 'obj':
      return v.v | 0;
    case 'float':
      return Math.trunc(v.v) | 0;
    case 'null':
      return 0;
    default:
      throw new StackError(`oczekiwano liczby, jest ${v.t}`);
  }
}

export function truthy(v: Value): boolean {
  switch (v.t) {
    case 'null':
      return false;
    case 'str':
      return v.v.length > 0;
    default:
      return v.v !== 0;
  }
}
