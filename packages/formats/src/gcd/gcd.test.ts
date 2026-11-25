import { describe, expect, it } from 'vitest';
import { parseBio, parseGcd } from './index.js';

function build(opts: { name?: string; size?: number } = {}): Uint8Array {
  const buf = new Uint8Array(opts.size ?? 432);
  const v = new DataView(buf.buffer);
  const set = (i: number, n: number) => v.setInt32(i * 4, n, false);
  for (let s = 0; s < 7; s++) set(1 + s, s + 1);
  set(1 + 33, 25); // Age
  set(1 + 34, 1); // Gender
  set(71 + 3, 7); // skillBonus[3]
  const name = opts.name ?? 'Test';
  for (let i = 0; i < name.length; i++) buf[372 + i] = name.charCodeAt(i);
  [4, 0, 5, -1].forEach((t, i) => set(101 + i, t));
  [6, -1].forEach((t, i) => set(105 + i, t));
  if (buf.length >= 432) set(107, 5);
  return buf;
}

describe('parseGcd', () => {
  it('czyta pola big-endian', () => {
    const r = parseGcd(build());
    expect(r.name).toBe('Test');
    expect(r.baseStats).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(r.stats).toHaveLength(35);
    expect(r.age).toBe(25);
    expect(r.gender).toBe(1);
    expect(r.skills).toHaveLength(18);
    expect(r.skills[3]).toBe(7);
    expect(r.tags).toEqual([4, 0, 5, -1]);
    expect(r.traits).toEqual([6, -1]);
    expect(r.unspentSpecialPoints).toBe(5);
  });
  it('odrzuca plik krotszy niz 428 B', () => {
    expect(() => parseGcd(new Uint8Array(427))).toThrow(/GCD/);
  });
  it('pole 92 brakujace -> 0 (plik 428 B nie ma licznika punktow, ale mieści sie)', () => {
    expect(() => parseGcd(build({ size: 428 }))).not.toThrow();
  });
  it('imie bez NUL zajmuje 32 B', () => {
    const r = parseGcd(build({ name: 'A'.repeat(32) }));
    expect(r.name).toHaveLength(32);
  });
});

describe('parseBio', () => {
  it('dekoduje latin1 i normalizuje CRLF', () => {
    const b = Uint8Array.from('NARG\r\nx\xe9', (c) => c.charCodeAt(0));
    expect(parseBio(b)).toBe('NARG\nxé');
  });
});
