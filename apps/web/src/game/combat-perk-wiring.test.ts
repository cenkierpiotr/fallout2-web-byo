import { describe, expect, it } from 'vitest';
import { DamageType, Perk, RollResult, SOLAR_SCORCHER_PID, Trait, createRng } from '@f2/rules';
import { CombatSession, type Combatant, type WeaponSpec } from './combat';
import { applyJinxedRoll } from './combat-rules';
import { sheetJinxed, withThrowRange } from './combat-controller';

const mk = (id: number, team: number, hex: number, seq: number, isPlayer = false) => ({
  id,
  team,
  hp: 30,
  maxAp: 8,
  sequence: seq,
  agility: 5,
  hex,
  isPlayer,
});

const GUN = (pid: number): WeaponSpec => ({
  name: 'g',
  pid,
  minDmg: 1,
  maxDmg: 1,
  apCost: 4,
  range: 10,
  skill: 90,
  burst: 1,
  damageType: DamageType.Normal,
  cls: 4,
});

describe('Solar Scorcher (D 0x478874)', () => {
  const run = (light: number | undefined) => {
    const player: Omit<Combatant, 'ap'> = {
      ...mk(1, 0, 0, 9, true),
      weapons: [GUN(SOLAR_SCORCHER_PID)],
    };
    const c = new CombatSession(
      [player, mk(2, 1, 3, 1)],
      () => ({ hit: true, damage: 1 }),
      undefined,
      light === undefined ? {} : { ambientLight: () => light },
    );
    return c.attack(1, 2);
  };
  it('strzela przy jasnym swietle', () => expect(run(0x10000)).not.toBeNull());
  it('nie strzela w ciemnosci', () => expect(run(0x4000)).toBeNull());
  it('brak informacji o swietle nie blokuje', () => expect(run(undefined)).not.toBeNull());
  it('inna bron nie zalezy od swiatla', () => {
    const player: Omit<Combatant, 'ap'> = { ...mk(1, 0, 0, 9, true), weapons: [GUN(8)] };
    const c = new CombatSession(
      [player, mk(2, 1, 3, 1)],
      () => ({ hit: true, damage: 1 }),
      undefined,
      { ambientLight: () => 0x4000 },
    );
    expect(c.attack(1, 2)).not.toBeNull();
  });
});

describe('powalenie i Quick Recovery (D 0x425fbc)', () => {
  const standAp = (quickRecovery: number): number => {
    const player: Omit<Combatant, 'ap'> = {
      ...mk(1, 0, 0, 1, true),
      perks: { [Perk.QuickRecovery]: quickRecovery },
    };
    const foe: Omit<Combatant, 'ap'> = { ...mk(2, 1, 1, 9), weapons: [GUN(8)] };
    const c = new CombatSession([player, foe], () => ({
      hit: true,
      damage: 1,
      knockedDown: true,
    }));
    expect(c.current.id).toBe(2);
    expect(c.attack(2, 1)).toMatchObject({ knockedDown: true });
    expect(c.all.find((x) => x.id === 1)!.prone).toBe(true);
    c.endTurn();
    expect(c.current.id).toBe(1);
    expect(c.current.prone).toBe(false);
    return c.current.ap;
  };
  it('powalony gracz wstaje za 3 AP', () => expect(standAp(0)).toBe(5));
  it('z Quick Recovery wstaje za 1 AP', () => expect(standAp(1)).toBe(7));
});

describe('Jinxed (D 0x4238b2)', () => {
  it('zwykla porazka zamienia sie w krytyczna gdy los != 0', () => {
    const rng = { int: () => 1 };
    expect(applyJinxedRoll(RollResult.Failure, true, rng)).toBe(RollResult.CriticalFailure);
  });
  it('los 0 zostawia zwykla porazke', () => {
    expect(applyJinxedRoll(RollResult.Failure, true, { int: () => 0 })).toBe(RollResult.Failure);
  });
  it('bez Jinxed i dla innych wynikow bez zmian', () => {
    expect(applyJinxedRoll(RollResult.Failure, false, createRng(1))).toBe(RollResult.Failure);
    expect(applyJinxedRoll(RollResult.Success, true, { int: () => 1 })).toBe(RollResult.Success);
  });
  it('sheetJinxed: atut 9 albo perk 118', () => {
    expect(sheetJinxed({ traits: [Trait.Jinxed], perks: {} })).toBe(true);
    expect(sheetJinxed({ traits: [], perks: { [Perk.Jinxed]: 1 } })).toBe(true);
    expect(sheetJinxed({ traits: [], perks: {} })).toBe(false);
  });
});

describe('Heave Ho (D 0x478ac9)', () => {
  const throwWeapon: WeaponSpec = { ...GUN(9), cls: 3, range: 40 };
  it('ogranicza zasieg rzutu gracza do ST i rangi perku', () => {
    expect(withThrowRange(throwWeapon, 5, 0, true).range).toBeLessThan(40);
    expect(withThrowRange(throwWeapon, 5, 3, true).range).toBeGreaterThan(
      withThrowRange(throwWeapon, 5, 0, true).range,
    );
  });
  it('nie rusza broni innej klasy', () => {
    expect(withThrowRange(GUN(8), 5, 0, true).range).toBe(10);
  });
});
