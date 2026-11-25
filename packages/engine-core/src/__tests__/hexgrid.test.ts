import { describe, expect, it } from 'vitest';
import {
  type Direction,
  type Hex,
  HEX_COUNT,
  directionTo,
  hexDistance,
  hexInDirection,
  hexNeighbors,
  hexToTile,
  hexToWorld,
  hexX,
  hexY,
  isHexInRect,
  makeHex,
  tileIndexToWorld,
  worldToHex,
} from '../hexgrid.js';

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const START = 18492;

/** Lewy gorny rog obrysu wzgledem widoku 640x381 ze srodkiem START (spec: START -> (304, 182)). */
function viewPos(h: Hex): { x: number; y: number } {
  const w = hexToWorld(h);
  const s = hexToWorld(START);
  return { x: w.x - s.x + 304 + 16, y: w.y - s.y + 182 + 8 };
}

describe('hexgrid', () => {
  it('test_hexToWorld_startHex_artemple', () => {
    expect(hexX(START)).toBe(92);
    expect(hexY(START)).toBe(92);
    // spec: hexToPixel(18492) = (304, 182) (rog obrysu), srodek = +16,+8
    expect(viewPos(START)).toEqual({ x: 320, y: 190 });
    // spec: hexToPixel(18492 + 200) = (320, 194)
    expect(viewPos(START + 200)).toEqual({ x: 336, y: 202 });
    expect(makeHex(92, 92)).toBe(START);
    expect(makeHex(200, 0)).toBe(-1);
  });

  it('test_worldToHex_roundtrip_1000_random', () => {
    const r = rng(42);
    for (let i = 0; i < 1000; i++) {
      const h = Math.floor(r() * HEX_COUNT);
      const w = hexToWorld(h);
      expect(worldToHex(w.x, w.y)).toBe(h);
    }
  });

  it('worldToHex: poza siatka i piksele w obrysie wlasnego heksa', () => {
    expect(worldToHex(-1000, -1000)).toBe(-1);
    expect(worldToHex(100000, 100000)).toBe(-1);
    const w = hexToWorld(START);
    expect(worldToHex(w.x + 5, w.y + 3)).toBe(START);
    expect(worldToHex(w.x - 5, w.y - 3)).toBe(START);
  });

  it('test_hexInDirection_even_and_odd_rows', () => {
    // x parzyste (92): tabela W=200 -> przyrosty -1, 199, 200, 201, 1, -200
    const even = [-1, 199, 200, 201, 1, -200];
    // x nieparzyste (93): -201, -1, 200, 1, -199, -200
    const odd = [-201, -1, 200, 1, -199, -200];
    for (let d = 0; d < 6; d++) {
      expect(hexInDirection(18492, d as Direction)).toBe(18492 + even[d]!);
      expect(hexInDirection(18493, d as Direction)).toBe(18493 + odd[d]!);
    }
    expect(hexInDirection(18492, 2, 5)).toBe(19492);
    expect(hexInDirection(19, 5, 3)).toBe(19);
    expect(hexInDirection(18492, 2, 0)).toBe(18492);
    expect(hexInDirection(-1, 2)).toBe(-1);
  });

  it('hexInDirection: 120000 losowych przypadkow nie wychodzi z siatki, krawedz stoi', () => {
    const r = rng(42);
    let bad = 0;
    for (let i = 0; i < 120000; i++) {
      const h = Math.floor(r() * HEX_COUNT);
      const d = Math.floor(r() * 6) as Direction;
      const n = 1 + Math.floor(r() * 30);
      const out = hexInDirection(h, d, n);
      const x = hexX(h);
      const y = hexY(h);
      if (out < 0 || out >= HEX_COUNT) bad++;
      else if ((x === 0 || x === 199 || y === 0 || y === 199) && out !== h) bad++;
    }
    expect(bad).toBe(0);
  });

  it('przesuniecia ekranowe kierunkow zgodne ze spec (parzyste i nieparzyste x)', () => {
    const screen = [
      [16, -12],
      [32, 0],
      [16, 12],
      [-16, 12],
      [-32, 0],
      [-16, -12],
    ];
    for (const h of [18492, 18493, 9100, 9101]) {
      const w = hexToWorld(h);
      for (let d = 0; d < 6; d++) {
        const n = hexToWorld(hexInDirection(h, d as Direction));
        expect([n.x - w.x, n.y - w.y]).toEqual(screen[d]);
      }
    }
  });

  it('test_hexDistance_examples', () => {
    expect(hexDistance(18492, 18492 + 200)).toBe(1);
    expect(hexDistance(18492, 18492)).toBe(0);
    expect(hexDistance(-1, 5)).toBe(9999);
    expect(hexDistance(5, 40000)).toBe(9999);
    expect(hexDistance(18492, 18492 + 5 * 200)).toBe(5);
  });

  it('hexDistance == BFS po heksach: 2000 losowych par (seed 42, do 40 wierszy/kolumn)', () => {
    const r = rng(42);
    const dist = new Int32Array(HEX_COUNT);
    const queue = new Int32Array(HEX_COUNT);
    function bfs(a: Hex, b: Hex): number {
      dist.fill(-1);
      dist[a] = 0;
      let head = 0;
      let tail = 0;
      queue[tail++] = a;
      while (head < tail) {
        const f = queue[head++]!;
        if (f === b) return dist[f]!;
        for (const nb of hexNeighbors(f)) {
          if (dist[nb] === -1) {
            dist[nb] = dist[f]! + 1;
            queue[tail++] = nb;
          }
        }
      }
      return -1;
    }
    let bad = 0;
    let n = 0;
    while (n < 2000) {
      const x = 3 + Math.floor(r() * 194);
      const y = 3 + Math.floor(r() * 194);
      const x2 = x + Math.floor(r() * 81) - 40;
      const y2 = y + Math.floor(r() * 81) - 40;
      if (x2 < 0 || x2 > 199 || y2 < 0 || y2 > 199) continue;
      const a = makeHex(x, y);
      const b = makeHex(x2, y2);
      // BFS ogranicz: pary blizsze niz 45 kroków wystarcza do wartosciowego testu
      if (Math.max(Math.abs(x - x2), Math.abs(y - y2)) > 40) continue;
      if (hexDistance(a, b) !== bfs(a, b)) bad++;
      n++;
    }
    expect(bad).toBe(0);
  }, 30000);

  it('test_hexNeighbors_edge_has_fewer', () => {
    expect(hexNeighbors(18492)).toEqual([18491, 18691, 18692, 18693, 18493, 18292]);
    expect(hexNeighbors(0).length).toBeLessThan(6);
    expect(hexNeighbors(0)).toEqual([200, 201, 1]);
    expect(hexNeighbors(39999).length).toBeLessThan(6);
    expect(hexNeighbors(100).length).toBeLessThan(6); // y = 0
    expect(hexNeighbors(-1)).toEqual([]);
    for (const n of hexNeighbors(18493)) expect(hexDistance(18493, n)).toBe(1);
  });

  it('test_directionTo_six_cases', () => {
    for (let d = 0; d < 6; d++) {
      const to = hexInDirection(18492, d as Direction);
      expect(directionTo(18492, to)).toBe(d);
      const to2 = hexInDirection(18493, d as Direction);
      expect(directionTo(18493, to2)).toBe(d);
    }
    expect(directionTo(18492, 18492)).toBe(2);
    // kierunek przeciwny = (d + 3) % 6
    for (let d = 0; d < 6; d++) {
      const to = hexInDirection(18492, d as Direction, 3);
      expect(directionTo(to, 18492)).toBe((d + 3) % 6);
    }
  });

  it('tileIndexToWorld i hexToTile', () => {
    // rog kafla = rog heksa (2tx+1, 2ty) + (-16,-2)
    const t = tileIndexToWorld(4646);
    const h = hexToWorld(makeHex(2 * 46 + 1, 2 * 46));
    expect(t).toEqual({ x: h.x - 16 - 16, y: h.y - 8 - 2 });
    // skok kafla: (48,-12) w kolumnie (tx-1), (32,24) w wierszu
    const a = tileIndexToWorld(4646);
    expect(tileIndexToWorld(4645)).toEqual({ x: a.x + 48, y: a.y - 12 });
    expect(tileIndexToWorld(4746)).toEqual({ x: a.x + 32, y: a.y + 24 });
    expect(hexToTile(makeHex(0, 10))).toBe(-1);
    expect(hexToTile(makeHex(1, 0))).toBe(0);
    expect(hexToTile(makeHex(2, 1))).toBe(0);
    expect(hexToTile(makeHex(3, 2))).toBe(101);
    expect(hexToTile(makeHex(199, 199))).toBe(99 * 100 + 99);
    expect(() => tileIndexToWorld(10000)).toThrow(RangeError);
  });

  it('isHexInRect', () => {
    const rect = { x0: 90, y0: 90, x1: 95, y1: 95 };
    expect(isHexInRect(START, rect)).toBe(true);
    expect(isHexInRect(makeHex(96, 92), rect)).toBe(false);
    expect(isHexInRect(makeHex(95, 95), rect)).toBe(true);
    expect(isHexInRect(-1, rect)).toBe(false);
  });
});
