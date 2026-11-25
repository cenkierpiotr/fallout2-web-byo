import { describe, expect, it } from 'vitest';
import {
  STAT_DEFS,
  Stat,
  defaultRulesContext,
  evalExpr,
  newCritterData,
  recalcDerived,
  setStatBase,
  statBase,
  statBonus,
  statLevel,
  type CritterData,
} from '../src/index.js';

const ctx = defaultRulesContext();

function make(
  primaries: [number, number, number, number, number, number, number],
  isPlayer = true,
): CritterData {
  const c = newCritterData(isPlayer);
  primaries.forEach((v, i) => (c.baseStats[i] = v));
  recalcDerived(c, ctx);
  c.curHP = statLevel(c, Stat.MaxHitPoints, ctx);
  return c;
}

const DERIVED = [
  Stat.MaxHitPoints,
  Stat.MaxActionPoints,
  Stat.ArmorClass,
  Stat.MeleeDamage,
  Stat.CarryWeight,
  Stat.Sequence,
  Stat.HealingRate,
  Stat.CriticalChance,
  Stat.RadiationResistance,
  Stat.PoisonResistance,
];

function derived(c: CritterData): number[] {
  return DERIVED.map((s) => statLevel(c, s, ctx));
}

describe('dane', () => {
  it('stats.json ma 38 statow i poprawne zakresy min/max', () => {
    expect(STAT_DEFS).toHaveLength(38);
    STAT_DEFS.forEach((d, i) => {
      expect(d.index).toBe(i);
      expect(d.min).toBeLessThanOrEqual(d.max);
      expect(typeof d.default).toBe('number');
      expect(d.msgId).toBeGreaterThanOrEqual(100);
    });
  });
  it('evalExpr', () => {
    expect(evalExpr('5 + trunc(AG/2)', { AG: 7 })).toBe(8);
    expect(evalExpr('max(1, ST - 5)', { ST: 3 })).toBe(1);
    expect(() => evalExpr('X + 1', {})).toThrow();
  });
});

describe('statLevel', () => {
  it('clamps to 1..10', () => {
    const c = make([5, 5, 5, 5, 5, 5, 5]);
    c.bonusStats[Stat.Strength] = 7; // Buffout: 5+7 = 12
    expect(statLevel(c, Stat.Strength, ctx)).toBe(10);
    c.baseStats[Stat.Strength] = 0;
    c.bonusStats[Stat.Strength] = 0;
    expect(statLevel(c, Stat.Strength, ctx)).toBe(1);
    expect(statBase(c, Stat.Strength)).toBe(0);
    expect(statBonus(c, Stat.Strength)).toBe(0);
  });

  it('stat poza zakresem daje 0, cur* czytane z rekordu', () => {
    const c = make([5, 5, 5, 5, 5, 5, 5]);
    expect(statLevel(c, 99 as Stat, ctx)).toBe(0);
    c.curRad = 12;
    expect(statLevel(c, Stat.CurrentRadiation, ctx)).toBe(12);
  });

  it('niezapisana pochodna liczona ze wzoru', () => {
    const c = newCritterData(false);
    expect(c.baseStats[Stat.MaxHitPoints]).toBeUndefined();
    expect(statLevel(c, Stat.MaxHitPoints, ctx)).toBe(30);
    expect(statLevel(c, Stat.CarryWeight, ctx)).toBe(150);
  });
});

describe('derived', () => {
  // Spec stats.md nie zawiera tabeli przykladow: wartosci wyliczone recznie ze wzorow
  // (maxHP 15+ST+2EN, AP 5+trunc(AG/2), AC AG, melee max(1,ST-5), carry 25+25ST,
  // seq 2PE, heal max(1,trunc(EN/3)), crit LK, rad 2EN, poison 5EN).
  it('derived maxHP matches spec formula', () => {
    // [maxHP, AP, AC, melee, carry, seq, heal, crit, radRes, poisonRes]
    expect(derived(make([5, 5, 5, 5, 5, 5, 5]))).toEqual([30, 7, 5, 1, 150, 10, 1, 5, 10, 25]);
    expect(derived(make([10, 10, 10, 10, 10, 10, 10]))).toEqual([
      45, 10, 10, 5, 275, 20, 3, 10, 20, 50,
    ]);
    expect(derived(make([1, 1, 1, 1, 1, 1, 1]))).toEqual([18, 5, 1, 1, 50, 2, 1, 1, 2, 5]);
    expect(derived(make([8, 4, 6, 3, 7, 9, 2]))).toEqual([35, 9, 9, 3, 225, 8, 2, 2, 12, 30]);
  });

  it('derived uses clamped primaries', () => {
    const c = make([5, 5, 5, 5, 5, 5, 5]);
    c.bonusStats[Stat.Strength] = 7;
    c.bonusStats[Stat.Agility] = 7;
    recalcDerived(c, ctx);
    // ST/AG zacisniete do 10 (nie 12): carry 25+250, AP 5+5, AC 10, melee 5
    expect(statLevel(c, Stat.CarryWeight, ctx)).toBe(275);
    expect(statLevel(c, Stat.MaxActionPoints, ctx)).toBe(10);
    expect(statLevel(c, Stat.ArmorClass, ctx)).toBe(10);
    expect(statLevel(c, Stat.MeleeDamage, ctx)).toBe(5);
    // maxHP bez bonusow: ST0=5
    expect(statLevel(c, Stat.MaxHitPoints, ctx)).toBe(30);
  });

  it('recalcDerived nie rusza curHP ani unarmedDmg', () => {
    const c = make([5, 5, 5, 5, 5, 5, 5]);
    c.curHP = 7;
    recalcDerived(c, ctx);
    expect(c.curHP).toBe(7);
    expect(c.baseStats[Stat.UnarmedDamage]).toBeUndefined();
  });
});

describe('traity', () => {
  it('Gifted adds +1 to all primaries', () => {
    const c = make([5, 5, 5, 5, 5, 5, 5]);
    c.traits = [15, -1];
    for (let s = 0; s <= 6; s++) expect(statLevel(c, s as Stat, ctx)).toBe(6);
    recalcDerived(c, ctx);
    expect(statLevel(c, Stat.MaxHitPoints, ctx)).toBe(15 + 6 + 12);
  });

  it('Gifted nie dziala na nie-gracza i klamruje do 10', () => {
    const npc = make([5, 5, 5, 5, 5, 5, 5], false);
    npc.traits = [15, -1];
    expect(statLevel(npc, Stat.Strength, ctx)).toBe(5);
    const pc = make([10, 5, 5, 5, 5, 5, 5]);
    pc.traits = [15, -1];
    expect(statLevel(pc, Stat.Strength, ctx)).toBe(10);
  });

  it('Bruiser +2 ST and -2 AP', () => {
    const c = make([5, 5, 5, 5, 5, 5, 5]);
    c.traits = [1, -1];
    recalcDerived(c, ctx);
    expect(statLevel(c, Stat.Strength, ctx)).toBe(7);
    expect(statLevel(c, Stat.MaxActionPoints, ctx)).toBe(5);
    expect(statLevel(c, Stat.MaxHitPoints, ctx)).toBe(15 + 7 + 10);
  });

  it('Small Frame: AG+1, carry -10*baseST', () => {
    const c = make([5, 5, 5, 5, 5, 5, 5]);
    c.traits = [2, -1];
    expect(statLevel(c, Stat.Agility, ctx)).toBe(6);
    recalcDerived(c, ctx);
    expect(statLevel(c, Stat.CarryWeight, ctx)).toBe(25 + 125 - 50);
  });

  it('Kamikaze i Heavy Handed', () => {
    const c = make([5, 5, 5, 5, 5, 5, 5]);
    c.traits = [5, 6];
    expect(statLevel(c, Stat.ArmorClass, ctx)).toBe(0);
    expect(statLevel(c, Stat.Sequence, ctx)).toBe(15);
    expect(statLevel(c, Stat.MeleeDamage, ctx)).toBe(1 + 4);
    expect(statLevel(c, Stat.BetterCriticals, ctx)).toBe(-30); // min -60
  });

  it('Fast Metabolism i Finesse', () => {
    const c = make([5, 5, 5, 5, 5, 5, 5]);
    c.traits = [0, 4];
    expect(statLevel(c, Stat.HealingRate, ctx)).toBe(3);
    expect(statLevel(c, Stat.RadiationResistance, ctx)).toBe(0);
    expect(statLevel(c, Stat.PoisonResistance, ctx)).toBe(0);
    expect(statLevel(c, Stat.CriticalChance, ctx)).toBe(15);
  });
});

describe('perki i inne', () => {
  it('Gain Strength, Adrenaline Rush, Mirrored Shades', () => {
    const c = make([5, 5, 5, 5, 5, 5, 5]);
    c.perkRanks[84] = 1;
    expect(statLevel(c, Stat.Strength, ctx)).toBe(6);
    c.perkRanks[79] = 1;
    expect(statLevel(c, Stat.Strength, ctx)).toBe(6); // curHP pelne
    c.curHP = 14; // < 30/2
    expect(statLevel(c, Stat.Strength, ctx)).toBe(7);
    c.heldItemPids = [0x1b1];
    expect(statLevel(c, Stat.Charisma, ctx)).toBe(6);
  });

  it('perki nie dzialaja na nie-gracza', () => {
    const c = make([5, 5, 5, 5, 5, 5, 5], false);
    c.perkRanks[84] = 1;
    expect(statLevel(c, Stat.Strength, ctx)).toBe(5);
  });

  it('DR: pierwszy trafiony perk wygrywa, maxHP perki sumuja sie', () => {
    const c = make([5, 5, 5, 5, 5, 5, 5]);
    c.perkRanks[74] = 1;
    c.perkRanks[75] = 1;
    expect(statLevel(c, Stat.DrNormal, ctx)).toBe(5);
    c.perkRanks[74] = 0;
    expect(statLevel(c, Stat.DrNormal, ctx)).toBe(10);
    c.perkRanks[108] = 1;
    c.perkRanks[111] = 1;
    expect(statLevel(c, Stat.MaxHitPoints, ctx)).toBe(30 + 2 - 4);
  });

  it('tabela korekt perkow w f2_stat_level 0x4aef48 (74-79, 84-90, 108-115)', () => {
    const base = (): CritterData => make([5, 5, 5, 5, 5, 5, 5]);
    const diff = (perk: number, stat: number): number => {
      const a = base();
      const b = base();
      b.perkRanks[perk] = 1;
      return statLevel(b, stat, ctx) - statLevel(a, stat, ctx);
    };
    expect(diff(78, 31)).toBe(10); // radRes
    expect(diff(78, 32)).toBe(10); // poisonRes
    for (const st of [24, 30]) {
      expect(diff(74, st)).toBe(5);
      expect(diff(75, st)).toBe(10);
    }
    for (const st of [25, 26, 27]) {
      expect(diff(76, st)).toBe(5);
      expect(diff(77, st)).toBe(10);
    }
    const maxHp: [number, number][] = [
      [108, 2],
      [109, 4],
      [110, -2],
      [111, -4],
      [112, 2],
      [113, 4],
      [114, -2],
      [115, -4],
    ];
    for (const [perk, d] of maxHp) expect(diff(perk, 7), `perk ${perk}`).toBe(d);
    for (let i = 0; i < 7; i++) expect(diff(84 + i, i), `gain ${i}`).toBe(1);
  });

  it('wiek rosnie z zegarem, slepota -5 PE, przeciazenie obniza AP', () => {
    const c = make([5, 5, 5, 5, 5, 5, 5]);
    const aged = { ...ctx, clock: { ticks: 315360000 * 3 + 5 } };
    expect(statLevel(c, Stat.Age, aged)).toBe(28);
    c.blinded = true;
    expect(statLevel(c, Stat.Perception, ctx)).toBe(1); // 5-5=0 -> min 1
    c.carriedWeight = 150 + 80; // d=-80 -> -(2+1)
    expect(statLevel(c, Stat.MaxActionPoints, ctx)).toBe(7 - 3);
  });

  it('AC w walce dodaje niewykorzystane AP (nie dla krytera w turze)', () => {
    const c = make([5, 5, 5, 5, 5, 5, 5]);
    c.apLeft = 4;
    const other = make([5, 5, 5, 5, 5, 5, 5], false);
    const inCombat = { ...ctx, combat: { active: true, current: other } };
    expect(statLevel(c, Stat.ArmorClass, inCombat)).toBe(9);
    expect(statLevel(c, Stat.ArmorClass, { ...ctx, combat: { active: true, current: c } })).toBe(5);
    c.perkRanks[93] = 1;
    const skilled = { ...inCombat, skillLevel: () => 60 };
    expect(statLevel(c, Stat.ArmorClass, skilled)).toBe(5 + 8 + 5);
  });
});

describe('setStatBase', () => {
  it('rejects out of range', () => {
    const c = make([5, 5, 5, 5, 5, 5, 5]);
    expect(setStatBase(c, Stat.Strength, 11)).toEqual({ ok: false, reason: 'stat-out-of-range' });
    expect(setStatBase(c, Stat.Strength, 0)).toEqual({ ok: false, reason: 'stat-out-of-range' });
    expect(setStatBase(c, Stat.Age, 15)).toEqual({ ok: false, reason: 'stat-out-of-range' });
    expect(c.baseStats[Stat.Strength]).toBe(5);
  });

  it('stat pochodny i nieistniejacy odrzucone', () => {
    const c = make([5, 5, 5, 5, 5, 5, 5]);
    expect(setStatBase(c, Stat.MaxHitPoints, 50)).toEqual({
      ok: false,
      reason: 'stat-derived-readonly',
    });
    expect(setStatBase(c, 40 as Stat, 1)).toEqual({ ok: false, reason: 'stat-invalid' });
  });

  it('zapis SPECIAL przelicza pochodne; gracz: zapis bez poprawki traitu', () => {
    const c = make([5, 5, 5, 5, 5, 5, 5]);
    expect(setStatBase(c, Stat.Strength, 8)).toEqual({ ok: true });
    expect(statLevel(c, Stat.MaxHitPoints, ctx)).toBe(15 + 8 + 10);
    c.traits = [15, -1];
    // wartosc 10 przy Gifted: zapisana baza 9
    expect(setStatBase(c, Stat.Luck, 10)).toEqual({ ok: true });
    expect(c.baseStats[Stat.Luck]).toBe(9);
    expect(setStatBase(c, Stat.CurrentHitPoints, 12)).toEqual({ ok: true });
    expect(c.curHP).toBe(12);
    expect(setStatBase(c, Stat.CurrentHitPoints, 3000)).toEqual({
      ok: false,
      reason: 'stat-out-of-range',
    });
  });
});
