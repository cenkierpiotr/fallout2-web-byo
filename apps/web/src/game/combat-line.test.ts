import { describe, expect, it } from 'vitest';
import { indexObject, makeHex, type GameMap, type GameObject } from '@f2/engine-core';
import { coverCountBetween, missRedirectHex } from './combat-line';
import { hitChance } from './combat-rules';
import { DamageType } from '@f2/rules';
import type { Combatant, WeaponSpec } from './combat';

const emptyMap = (): GameMap => ({ byHex: new Map(), objects: [] }) as unknown as GameMap;
const obj = (id: number, hex: number, type = 1, flags = 0): GameObject =>
  ({
    id,
    pid: id,
    type,
    hex,
    flags,
    elevation: 0,
    extra: { kind: 'critter', flags: 0, raw: new Int32Array(10) },
    inventory: [],
  }) as unknown as GameObject;

describe('coverCountBetween (0x426cc4 na realnej siatce)', () => {
  it('krytter na linii strzalu = 1 oslona, brak = 0, sciana nie liczy sie jako krytter', () => {
    const map = emptyMap();
    const a = obj(1, makeHex(100, 100));
    const t = obj(2, makeHex(94, 100));
    const mid = obj(3, makeHex(97, 100));
    for (const o of [a, t]) indexObject(map, o);
    expect(coverCountBetween(map, a, t)).toBe(0);
    indexObject(map, mid);
    expect(coverCountBetween(map, a, t)).toBe(1);
  });
});

describe('hitChance z osłona i swiatlem', () => {
  const unit = (over: Partial<Combatant> = {}): Combatant => ({
    id: 1,
    team: 0,
    hp: 30,
    maxAp: 8,
    sequence: 5,
    agility: 5,
    hex: 0,
    ap: 8,
    isPlayer: false,
    ...over,
  });
  const gun: WeaponSpec = {
    name: 'g',
    pid: 1,
    minDmg: 5,
    maxDmg: 5,
    apCost: 4,
    range: 20,
    skill: 60,
    burst: 1,
    damageType: DamageType.Normal,
    cls: 4,
  };
  it('kazda oslona -10; kara swiatla wchodzi do wyniku; AC amunicji obniza szanse', () => {
    const a = unit();
    const t = unit({ id: 2 });
    const base = hitChance(a, t, gun, 3, 2);
    expect(hitChance(a, t, gun, 3, 2, undefined, { coverCount: 2 })).toBe(base - 20);
    expect(hitChance(a, t, gun, 3, 2, undefined, { lightPenalty: -25 })).toBe(base - 25);
    expect(hitChance(a, t, { ...gun, ammoAcMod: 10 }, 3, 2)).toBe(base - 10);
  });
});

describe('missRedirectHex: zajetosc 0x42dd18 = is_dead (D)', () => {
  const rng = { int: () => 5 } as never;
  const setup = (): { map: GameMap; a: GameObject; t: GameObject; mid: GameObject } => {
    const map = emptyMap();
    const a = obj(1, makeHex(100, 100));
    const t = obj(2, makeHex(94, 100));
    const mid = obj(3, makeHex(97, 100));
    for (const o of [a, t, mid]) indexObject(map, o);
    return { map, a, t, mid };
  };
  it('zywy kryter z szansa 0: rzut 5 nie trafia', () => {
    const { map, a, t } = setup();
    expect(missRedirectHex(map, a, t, 20, () => 0, rng)).toBeNull();
  });
  it('martwy kryter (flaga +0x44 & 0x80) ma szanse wymuszona na 5: rzut 5 trafia', () => {
    const { map, a, t, mid } = setup();
    if (mid.extra.kind === 'critter') mid.extra.raw[3] = 0x80;
    expect(missRedirectHex(map, a, t, 20, () => 0, rng)).toBe(mid.hex);
  });
  it('HP <= 0 z zewnatrz (hpDead) tez wymusza szanse 5', () => {
    const { map, a, t, mid } = setup();
    expect(
      missRedirectHex(
        map,
        a,
        t,
        20,
        () => 0,
        rng,
        (o) => o === mid,
      ),
    ).toBe(mid.hex);
  });
});
