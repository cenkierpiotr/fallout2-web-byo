import { describe, expect, it } from 'vitest';
import {
  CLASSIC_RULES,
  findPath,
  hexDistance,
  hexInDirection,
  hexNeighbors,
  isHexBlocked,
} from '../index.js';
import { door, emptyMap, fake, put } from './helpers.js';

const START = 20100;

describe('findPath', () => {
  it('test_findPath_straight_line_open_map', () => {
    const m = emptyMap();
    const mover = put(m, fake(1, START));
    for (const d of [0, 1, 2, 3, 4, 5] as const) {
      const to = hexInDirection(START, d, 10);
      const p = findPath(m, 0, START, to, mover)!;
      expect(p.length).toBe(hexDistance(START, to));
      expect(p[p.length - 1]).toBe(to);
    }
  });

  it('sciezka to ciag sasiadow, deterministyczna', () => {
    const m = emptyMap();
    const mover = put(m, fake(1, START));
    const to = START + 7 + 400 * 3;
    const p = findPath(m, 0, START, to, mover)!;
    const full = [START, ...p];
    for (let i = 1; i < full.length; i++) expect(hexNeighbors(full[i - 1]!)).toContain(full[i]);
    expect(findPath(m, 0, START, to, mover)).toEqual(p);
  });

  it('test_findPath_avoids_wall_objects', () => {
    const m = emptyMap();
    const mover = put(m, fake(1, START));
    const to = hexInDirection(START, 0, 6);
    const direct = findPath(m, 0, START, to, mover)!;
    for (const h of direct.slice(1, -1)) put(m, fake(3, h));
    const p = findPath(m, 0, START, to, mover)!;
    expect(p).not.toBeNull();
    for (const h of p.slice(0, -1)) expect(isHexBlocked(m, 0, h, mover)).toBe(false);
    expect(p.length).toBeGreaterThanOrEqual(direct.length);
  });

  it('test_findPath_returns_null_when_enclosed', () => {
    const m = emptyMap();
    const mover = put(m, fake(1, START));
    for (const n of hexNeighbors(START)) put(m, fake(3, n));
    expect(findPath(m, 0, START, START + 1000, mover)).toBeNull();
  });

  it('test_findPath_respects_maxLength_from_spec', () => {
    const m = emptyMap();
    const mover = put(m, fake(1, START));
    const to = hexInDirection(START, 0, 30);
    expect(findPath(m, 0, START, to, mover)!.length).toBe(30);
    const cut = findPath(m, 0, START, to, mover, { maxLength: 10 })!;
    expect(cut.length).toBe(10);
    expect(cut).toEqual(findPath(m, 0, START, to, mover)!.slice(0, 10));
  });

  it('test_findPath_through_open_door_not_closed', () => {
    const m = emptyMap();
    const mover = put(m, fake(1, START));
    const to = hexInDirection(START, 0, 2);
    const mid = hexInDirection(START, 0, 1);
    // korytarz: sciany dookola, jedyne przejscie przez drzwi na mid
    const wallHexes = new Set<number>();
    for (const h of [START, to]) for (const n of hexNeighbors(h)) wallHexes.add(n);
    for (const n of hexNeighbors(mid)) wallHexes.add(n);
    wallHexes.delete(mid);
    wallHexes.delete(START);
    wallHexes.delete(to);
    for (const h of wallHexes) put(m, fake(3, h));
    // zamkniete na klucz: brak sciezki
    const locked = put(m, door(mid, 0x2));
    expect(findPath(m, 0, START, to, mover)).toBeNull();
    // zamkniete, nie zablokowane: przechodnie, sciezka przez drzwi
    locked.extra = { kind: 'door', subtype: 0, flags: 0, raw: new Int32Array([0]) };
    expect(findPath(m, 0, START, to, mover)).toEqual([mid, to]);
    // otwarte (NoBlock): tez przechodnie
    locked.flags |= 0x10;
    expect(findPath(m, 0, START, to, mover)).toEqual([mid, to]);
  });

  it('wlasna polityka drzwi (parametr Z) moze zabronic przejscia', () => {
    const m = emptyMap();
    const mover = put(m, fake(1, START));
    const mid = hexInDirection(START, 0, 1);
    const to = hexInDirection(START, 0, 2);
    for (const h of new Set([...hexNeighbors(START), ...hexNeighbors(mid), ...hexNeighbors(to)])) {
      if (h !== START && h !== mid && h !== to) put(m, fake(3, h));
    }
    put(m, door(mid));
    expect(findPath(m, 0, START, to, mover, { doorPolicy: () => false })).toBeNull();
  });

  it('cel zawsze przyjmowany, checkTarget go odrzuca', () => {
    const m = emptyMap();
    const mover = put(m, fake(1, START));
    const to = hexInDirection(START, 0, 3);
    put(m, fake(3, to));
    expect(findPath(m, 0, START, to, mover)!.at(-1)).toBe(to);
    expect(findPath(m, 0, START, to, mover, { checkTarget: true })).toBeNull();
  });

  it('flaga rules.fixes.pathNodeLimit: limit 2000 klasyczny obcina dalekie szukanie', () => {
    const m = emptyMap();
    const mover = put(m, fake(1, START));
    const to = START + 60 + 200 * 60;
    expect(findPath(m, 0, START, to, mover)).not.toBeNull();
    expect(findPath(m, 0, START, to, mover, { rules: CLASSIC_RULES })).toBeNull();
  });

  it('poza siatka lub from==to daje null', () => {
    const m = emptyMap();
    const mover = put(m, fake(1, START));
    expect(findPath(m, 0, START, START, mover)).toBeNull();
    expect(findPath(m, 0, START, 40000, mover)).toBeNull();
    expect(findPath(m, 0, -1, 5, mover)).toBeNull();
  });
});

describe('isHexBlocked = test obiektu z silnik gry 0x48b848', () => {
  it('blokuja krytter/scenery/sciana; ukryty, NoBlock i przedmiot nie; multi-hex blokuje sasiednie heksy', () => {
    const m = emptyMap();
    put(m, fake(1, START));
    put(m, fake(2, START + 1));
    put(m, fake(3, START + 2));
    put(m, fake(1, START + 3, 0x1));
    put(m, fake(2, START + 4, 0x10));
    put(m, fake(0, START + 5));
    expect([0, 1, 2, 3, 4, 5].map((i) => isHexBlocked(m, 0, START + i))).toEqual([
      true,
      true,
      true,
      false,
      false,
      false,
    ]);
    const mh = emptyMap();
    put(mh, fake(2, START, 0x800));
    for (const n of hexNeighbors(START)) expect(isHexBlocked(mh, 0, n)).toBe(true);
    const mn = emptyMap();
    put(mn, fake(0, START, 0x800));
    for (const n of hexNeighbors(START)) expect(isHexBlocked(mn, 0, n)).toBe(false);
  });
});
