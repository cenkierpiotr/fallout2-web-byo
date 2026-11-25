import { describe, it, expect } from 'vitest';
import { decodeMveVideoData, MveVideoError, MVE_VIDEO_HEADER_SIZE } from './mve-video.js';

const W = 16;
const H = 8;

/** Mapa: dwa bloki 8x8, mlodszy polbajt pierwszy. */
function run(modes: [number, number], body: number[], prevFill = 0) {
  const data = new Uint8Array(MVE_VIDEO_HEADER_SIZE + body.length);
  data.set(body, MVE_VIDEO_HEADER_SIZE);
  const map = new Uint8Array([modes[0] | (modes[1] << 4)]);
  const cur = new Uint8Array(W * H);
  const prev = new Uint8Array(W * H).fill(prevFill);
  const r = decodeMveVideoData({ data, map, cur, prev, width: W, blocksW: 2, blocksH: 1 });
  return { cur, ...r };
}

describe('decodeMveVideoData', () => {
  it('tryb E wypelnia blok, B kopiuje 64 bajty', () => {
    const { cur, consumed } = run([0xe, 0xb], [7, ...Array.from({ length: 64 }, (_, i) => i)]);
    expect(cur[0]).toBe(7);
    expect(cur[7 * W + 7]).toBe(7);
    expect(cur[0 * W + 8]).toBe(0);
    expect(cur[1 * W + 9]).toBe(9);
    expect(cur[1 * W + 8]).toBe(8);
    expect(consumed).toBe(65);
  });
  it('tryb 0 kopiuje z prev, 1 pomija', () => {
    const { cur } = run([0, 1], [], 5);
    expect(cur[0]).toBe(5);
    expect(cur[7 * W + 7]).toBe(5);
    expect(cur[8]).toBe(0);
  });
  it('tryb D wypelnia cwiartki 4x4', () => {
    const { cur } = run([0xd, 1], [1, 2, 3, 4]);
    expect(cur[0]).toBe(1);
    expect(cur[4]).toBe(2);
    expect(cur[4 * W]).toBe(3);
    expect(cur[4 * W + 4]).toBe(4);
  });
  it('tryb 7: P0>P1 uzywa 2 bajtow flag (komorki 2x2)', () => {
    const { cur, consumed } = run([7, 1], [9, 3, 0b00000001, 0]);
    expect(cur[0]).toBe(3);
    expect(cur[1]).toBe(3);
    expect(cur[W]).toBe(3);
    expect(cur[2]).toBe(9);
    expect(consumed).toBe(4);
  });
  it('tryb 7: P0<=P1 uzywa 8 bajtow flag', () => {
    const { consumed } = run([7, 1], [1, 2, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(consumed).toBe(10);
  });
  it('urwane dane rzucaja MveVideoError', () => {
    expect(() => run([0xe, 1], [])).toThrow(MveVideoError);
  });
  it('kopia ruchu poza obraz rzuca MveVideoError', () => {
    expect(() => run([5, 1], [0x7f, 0x7f])).toThrow(MveVideoError);
  });
});

/** Rysuje blok 8x8 jako wiersze liter wg legendy (litera -> indeks palety). */
function rows(cur: Uint8Array, legend: Record<string, number>): string[] {
  const inv = new Map(Object.entries(legend).map(([k, v]) => [v, k]));
  return Array.from({ length: 8 }, (_, y) =>
    Array.from({ length: 8 }, (_, x) => inv.get(cur[y * W + x]!) ?? '?').join(''),
  );
}

// Wektory z elder.mve (klatka 0), zweryfikowane piksel w piksel wzgledem niezaleznego dekodera referencyjnego (ffmpeg, 40 klatek bez roznic).
describe('male bloki: podzialy polowkowe i cwiartki (golden)', () => {
  it('tryb 8, P0>P1, podzial pionowy (P2<=P3): polowa 4x8, bajt = dwa wiersze', () => {
    const body = [247, 34, 254, 83, 233, 251, 20, 34, 255, 191, 55, 0];
    const { cur, consumed } = run([8, 1], body);
    expect(consumed).toBe(12);
    expect(rows(cur, { a: 247, b: 34, c: 20 })).toEqual([
      'abbbbbbb',
      'bbbbbbbb',
      'bbaabbbb',
      'bababbcb',
      'baabbbbc',
      'abbbbbcc',
      'bbabcccc',
      'bbbbcccc',
    ]);
  });
  it('tryb 8, P0>P1, podzial poziomy (P2>P3): polowa 8x4, bajt = wiersz', () => {
    const body = [34, 20, 192, 240, 240, 120, 247, 34, 63, 223, 15, 239];
    const { cur, consumed } = run([8, 1], body);
    expect(consumed).toBe(12);
    expect(rows(cur, { a: 34, b: 20, c: 247 })).toEqual([
      'aaaaaabb',
      'aaaabbbb',
      'aaaabbbb',
      'aaabbbba',
      'aaaaaacc',
      'aaaaacaa',
      'aaaacccc',
      'aaaacaaa',
    ]);
  });
  it('tryb 8, P0<=P1: cwiartki w kolejnosci TL, BL, TR, BR', () => {
    // kazda cwiartka: P0=q*10, P1=q*10+1, flagi 0xFFFF (same P1)
    const body = [0, 1, 255, 255, 10, 11, 0, 0, 20, 21, 255, 255, 30, 31, 0, 0];
    const { cur, consumed } = run([8, 1], body);
    expect(consumed).toBe(16);
    expect(cur[0]).toBe(1); // TL
    expect(cur[4 * W]).toBe(10); // BL
    expect(cur[4]).toBe(21); // TR
    expect(cur[4 * W + 4]).toBe(30); // BR
  });
  it('tryb A, P0>P1, P4>P5: podzial poziomy, 2 B flag na wiersz, polowy osobno', () => {
    const body = [
      20, 18, 34, 247, 84, 252, 84, 189, 84, 188, 85, 177, 18, 14, 20, 34, 0, 242, 69, 250, 4, 186,
      164, 170,
    ];
    const { cur, consumed } = run([0xa, 1], body);
    expect(consumed).toBe(24);
    expect(rows(cur, { a: 20, b: 18, c: 247, d: 34, e: 14 })).toEqual([
      'abbbaccc',
      'abbbbccd',
      'abbbaccd',
      'bbbbbacd',
      'bbbbabdd',
      'eebeaadd',
      'bebbaada',
      'beaaaaaa',
    ]);
  });
  it('tryb A, P0<=P1: cwiartki w kolejnosci TL, BL, TR, BR', () => {
    const q = (v: number): number[] => [v, v + 1, v + 2, v + 3, 0xff, 0xff, 0xff, 0xff]; // flagi 3 = P3
    const { cur, consumed } = run([0xa, 1], [...q(0), ...q(10), ...q(20), ...q(30)]);
    expect(consumed).toBe(32);
    expect(cur[0]).toBe(3);
    expect(cur[4 * W]).toBe(13);
    expect(cur[4]).toBe(23);
    expect(cur[4 * W + 4]).toBe(33);
  });
  it('tryb A, P0>P1, P4<=P5: podzial pionowy, polowa 4x8, indeks y*4+x', () => {
    // lewa: P0..P3 = 9,5,6,7, flagi 8 B: wszystkie 0b00 poza pierwszym bajtem 0b11100100 (x0..3 wiersza 0 = 0,1,2,3)
    // prawa: P4..P7 = 1,2,3,4 (P4<=P5), flagi wszystkie 0b11 (= P7=4)
    const body = [
      9, 5, 6, 7, 0b11100100, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 255, 255, 255, 255, 255, 255, 255,
      255,
    ];
    const { cur, consumed } = run([0xa, 1], body);
    expect(consumed).toBe(24);
    expect([cur[0], cur[1], cur[2], cur[3]]).toEqual([9, 5, 6, 7]);
    expect(cur[W]).toBe(9); // wiersz 1 lewej polowy: indeks 0 -> P0
    expect(cur[4]).toBe(4);
    expect(cur[7 * W + 7]).toBe(4);
  });
});
