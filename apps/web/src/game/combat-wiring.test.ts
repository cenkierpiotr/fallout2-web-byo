import { describe, expect, it } from 'vitest';
import { DamageType, type AiPacket } from '@f2/rules';
import {
  CombatSession,
  weaponInMode,
  type Combatant,
  type WeaponSpec,
  type AttackContext,
} from './combat';

const msgRanges = Object.fromEntries(
  [
    'attack',
    'move',
    'run',
    'miss',
    'hitEyes',
    'hitGroin',
    'hitHead',
    'hitLeftArm',
    'hitLeftLeg',
    'hitRightArm',
    'hitRightLeg',
    'hitTorso',
  ].map((k) => [k, [0, 0]]),
) as unknown as AiPacket['msgRanges'];
const pkt = (over: Partial<AiPacket> = {}): AiPacket => ({
  name: 'T',
  packetNum: 1,
  aggression: 50,
  maxDist: 20,
  minToHit: 0,
  minHp: 0,
  chance: 0,
  hurtTooMuch: new Set(),
  runAwayIndex: 5,
  bestWeapon: -1,
  distance: 'on_your_own',
  attackWho: 'closest',
  areaMode: 'unset',
  chemUse: 0,
  msgRanges,
  ...over,
});

const SMG: WeaponSpec = {
  name: 'smg',
  pid: 9,
  minDmg: 5,
  maxDmg: 5,
  apCost: 5,
  apCost2: 6,
  range: 12,
  skill: 90,
  burst: 1,
  damageType: DamageType.Normal,
  cls: 4,
  secondary: { range: 9, burst: 5, cls: 4 },
};

const unit = (
  id: number,
  team: number,
  hex: number,
  over: Partial<Combatant> = {},
): Omit<Combatant, 'ap'> => ({
  id,
  team,
  hp: 40,
  maxHp: 40,
  maxAp: 10,
  sequence: id === 2 ? 20 : 1,
  agility: 5,
  hex,
  isPlayer: id === 1,
  ...over,
});

describe('weaponInMode / drugi tryb', () => {
  it('tryb 1 podmienia koszt AP (data[9]), zasieg i serie', () => {
    const w = weaponInMode(SMG, 1);
    expect(w).toMatchObject({ apCost: 6, range: 9, burst: 5 });
    expect(w.secondary).toBeUndefined();
    expect(weaponInMode(SMG, 0)).toBe(SMG);
    const noAlt = { ...SMG };
    delete noAlt.secondary;
    expect(weaponInMode(noAlt, 1)).toBe(noAlt);
  });
  it('atak w trybie 1 kosztuje apCost2 i strzela seria', () => {
    const seen: AttackContext[] = [];
    const c = new CombatSession(
      [unit(1, 0, 0), unit(2, 1, 5, { weapons: [SMG] })],
      (_a, _t, ctx) => {
        seen.push(ctx);
        return { hit: false, damage: 0 };
      },
    );
    expect(c.current.id).toBe(2);
    const before = c.current.ap;
    expect(c.attack(2, 1, { mode: 1 })).not.toBeNull();
    expect(before - c.current.ap).toBe(6);
    expect(seen[0]?.weapon.burst).toBe(5);
  });
  it('tryb 1 bez drugiego trybu bron nie zmienia kosztu', () => {
    const plain: WeaponSpec = { ...SMG };
    delete plain.secondary;
    const c = new CombatSession([unit(1, 0, 0), unit(2, 1, 5, { weapons: [plain] })], () => ({
      hit: false,
      damage: 0,
    }));
    const before = c.current.ap;
    c.attack(2, 1, { mode: 1 });
    expect(before - c.current.ap).toBe(5);
  });
});

describe('AI: drugi tryb i kontrola sojusznikow (0x4213e8)', () => {
  const run = (
    env: ConstructorParameters<typeof CombatSession>[3],
    units: Omit<Combatant, 'ap'>[],
  ) => {
    const used: AttackContext[] = [];
    const c = new CombatSession(
      units,
      (_a, _t, ctx) => {
        used.push(ctx);
        return { hit: false, damage: 0 };
      },
      undefined,
      env,
    );
    c.autoTurn();
    return used;
  };
  const GREN: WeaponSpec = {
    name: 'grenade',
    pid: 10,
    minDmg: 20,
    maxDmg: 30,
    apCost: 4,
    range: 10,
    skill: 90,
    burst: 1,
    explosive: true,
    damageType: DamageType.Explosion,
    cls: 3,
  };
  it('pakiet w trybie obszarowym wybiera serie z drugiego trybu', () => {
    const used = run({}, [
      unit(1, 0, 0),
      unit(2, 1, 6, { ai: pkt({ areaMode: 'always' }), weapons: [SMG] }),
    ]);
    expect(used[0]?.weapon.burst).toBe(5);
  });
  it('brak AP na tryb 2: AI rezygnuje z ataku, nie cofa sie do trybu 1 (0x42a61e, D)', () => {
    const hungry: WeaponSpec = { ...SMG, apCost2: 99 };
    const used = run({}, [
      unit(1, 0, 0),
      unit(2, 1, 6, { ai: pkt({ areaMode: 'always' }), weapons: [hungry] }),
    ]);
    expect(used.filter((u) => u.weapon.name === 'smg')).toEqual([]);
  });
  it('sojusznik na torze serii blokuje serie: AI strzela pojedynczo', () => {
    const used = run({ burstVictims: () => [3] }, [
      unit(1, 0, 0),
      unit(2, 1, 6, { ai: pkt({ areaMode: 'always' }), weapons: [SMG] }),
      unit(3, 1, 4, { dr: [50, 0, 0, 0, 0, 0, 0] }),
    ]);
    expect(used.length).toBeGreaterThan(0);
    expect(used[0]?.weapon.burst).toBe(1);
  });
  it('sojusznik w strefie wybuchu blokuje granat (be_sure), AI bierze inna bron', () => {
    const rifle: WeaponSpec = { ...SMG, name: 'rifle', pid: 11, burst: 1 };
    delete rifle.secondary;
    const used = run(
      { hitChance: () => 95 },
      [
        unit(1, 0, 10),
        unit(2, 1, 1, { ai: pkt({ areaMode: 'be_sure' }), weapons: [GREN, rifle] }),
        unit(3, 1, 11),
      ].map((u) => (u.id === 3 ? { ...u, hex: 11 } : u)),
    );
    expect(used.every((x) => !x.weapon.explosive)).toBe(true);
  });
});
