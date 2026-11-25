import { describe, expect, it } from 'vitest';
import {
  KILL_TYPE_NO_DOORS,
  findPath,
  hexInDirection,
  hexNeighbors,
  makeDoorPolicy,
  sceneryPenalty,
} from '../index.js';
import { door, emptyMap, fake, put } from './helpers.js';

const START = 20100;
const FLAG_NO_BLOCK = 0x10;

function penaltyScenery(hex: number, pid = 0x20003d9) {
  const o = fake(2, hex, FLAG_NO_BLOCK);
  o.pid = pid;
  return o;
}

describe('kara scenerii pid 0x20003d9..dc (R8-U2, D 0x415efc)', () => {
  it('krytter omija heks z kara (+400) i wybiera objazd', () => {
    const m = emptyMap();
    const mover = put(m, fake(1, START));
    const to = hexInDirection(START, 0, 4);
    const direct = findPath(m, 0, START, to, mover)!;
    const mid = direct[1]!;
    put(m, penaltyScenery(mid));
    const p = findPath(m, 0, START, to, mover)!;
    expect(p).not.toContain(mid);
    expect(p[p.length - 1]).toBe(to);
  });

  it('wartosci: 400, dla typu zabicia 0xf 100, poza zakresem pid 0, nie-krytter 0', () => {
    const m = emptyMap();
    const mover = put(m, fake(1, START));
    const h = hexInDirection(START, 0, 1);
    put(m, penaltyScenery(h, 0x20003dc));
    expect(sceneryPenalty(m, 0, h, mover)).toBe(400);
    expect(sceneryPenalty(m, 0, h, mover, 0xf)).toBe(100);
    const h2 = hexInDirection(START, 0, 2);
    put(m, penaltyScenery(h2, 0x20003dd));
    expect(sceneryPenalty(m, 0, h2, mover)).toBe(0);
    const item = fake(0, START + 5);
    expect(sceneryPenalty(m, 0, h, item)).toBe(0);
  });

  it('cel z kara jest nadal osiagalny (kara nie blokuje)', () => {
    const m = emptyMap();
    const mover = put(m, fake(1, START));
    const to = hexInDirection(START, 0, 2);
    put(m, penaltyScenery(to));
    expect(findPath(m, 0, START, to, mover)!.at(-1)).toBe(to);
  });
});

describe('polityka drzwi wg 0x415e24 (R8-U3, D)', () => {
  function corridor() {
    const m = emptyMap();
    const mid = hexInDirection(START, 0, 1);
    const to = hexInDirection(START, 0, 2);
    for (const h of new Set([...hexNeighbors(START), ...hexNeighbors(mid), ...hexNeighbors(to)])) {
      if (h !== START && h !== mid && h !== to) put(m, fake(3, h));
    }
    put(m, door(mid));
    return { m, to, mid };
  }
  const traits = (bodyType: number, killType = 0, isPlayer = false) =>
    makeDoorPolicy(() => ({ bodyType, killType, isPlayer }));

  it('humanoid i robot przechodza, czworonog i typ zabicia 0xf nie', () => {
    for (const [bt, kt, expected] of [
      [0, 0, true],
      [2, 0, true],
      [1, 0, false],
      [0, KILL_TYPE_NO_DOORS, false],
    ] as const) {
      const { m, to, mid } = corridor();
      const mover = put(m, fake(1, START));
      const p = findPath(m, 0, START, to, mover, { doorPolicy: traits(bt, kt) });
      expect(p, `bodyType ${bt} kill ${kt}`).toEqual(expected ? [mid, to] : null);
    }
  });

  it('gracz wymaga bitu 4 w proto drzwi (W: w danych gry zawsze 0)', () => {
    const { m, to, mid } = corridor();
    const mover = put(m, fake(1, START));
    const blocked = makeDoorPolicy(() => ({ bodyType: 0, killType: 0, isPlayer: true }));
    expect(findPath(m, 0, START, to, mover, { doorPolicy: blocked })).toBeNull();
    const open = makeDoorPolicy(
      () => ({ bodyType: 0, killType: 0, isPlayer: true }),
      () => 4,
    );
    expect(findPath(m, 0, START, to, mover, { doorPolicy: open })).toEqual([mid, to]);
  });
});
