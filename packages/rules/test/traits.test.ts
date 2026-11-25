import { describe, expect, it } from 'vitest';
import {
  Stat,
  Trait,
  TRAIT_DEFS,
  defaultRulesContext,
  newCritterData,
  recalcDerived,
  setTraits,
  statLevel,
  traitAdjustSkill,
  traitAdjustStat,
  traitProcs,
} from '../src/index.js';

const ctx = defaultRulesContext();
function pc() {
  const c = newCritterData(true);
  [5, 5, 5, 5, 5, 5, 5].forEach((v, i) => (c.baseStats[i] = v));
  recalcDerived(c, ctx);
  return c;
}

// Literaly skopiowane ze specs/traits.md (kolumna efekt) i skills.md.
const STAT_EFFECTS: Record<number, [number, number][]> = {
  [Trait.FastMetabolism]: [[Stat.HealingRate, 2]],
  [Trait.Bruiser]: [
    [Stat.Strength, 2],
    [Stat.MaxActionPoints, -2],
  ],
  [Trait.Kamikaze]: [[Stat.Sequence, 5]],
  [Trait.HeavyHanded]: [
    [Stat.MeleeDamage, 4],
    [Stat.BetterCriticals, -30],
  ],
  [Trait.Finesse]: [[Stat.CriticalChance, 10]],
  [Trait.Gifted]: [0, 1, 2, 3, 4, 5, 6].map((s) => [s, 1] as [number, number]),
  [Trait.SmallFrame]: [[Stat.Agility, 1]],
};

describe('traity', () => {
  it('16 traitow, indeksy 0..15', () => {
    expect(TRAIT_DEFS).toHaveLength(16);
    TRAIT_DEFS.forEach((t, i) => expect(t.index).toBe(i));
    expect(Trait.Gifted).toBe(15);
  });

  it('efekty statowe wszystkich 16 traitow zgodne z tabela', () => {
    for (const def of TRAIT_DEFS) {
      const got = def.effects
        .filter((e) => e.kind === 'stat' && e.delta !== undefined)
        .map((e) => [e.target, e.delta] as [number, number]);
      expect(got, def.key).toEqual(STAT_EFFECTS[def.index] ?? []);
    }
    expect(TRAIT_DEFS[Trait.SmallFrame]?.effects.some((e) => e.deltaPerBase?.factor === -10)).toBe(
      true,
    );
    expect(
      TRAIT_DEFS[Trait.Kamikaze]?.effects.some((e) => e.cancelBase && e.target === Stat.ArmorClass),
    ).toBe(true);
  });

  it('traitAdjustStat zgodne ze statLevel', () => {
    const c = pc();
    expect(traitAdjustStat(c, Stat.Strength, ctx)).toBe(0);
    setTraits(c, Trait.Bruiser, Trait.Gifted);
    expect(traitAdjustStat(c, Stat.Strength, ctx)).toBe(3);
    expect(statLevel(c, Stat.Strength, ctx)).toBe(8);
    expect(traitAdjustStat(c, Stat.MaxActionPoints, ctx)).toBe(-2);
  });

  it('skille: Gifted -10 wszystko, Good Natured wg tabeli, suma', () => {
    const c = pc();
    setTraits(c, Trait.Gifted, null);
    for (let s = 0; s < 18; s++) expect(traitAdjustSkill(c, s)).toBe(-10);
    setTraits(c, Trait.GoodNatured, null);
    for (let s = 0; s < 6; s++) expect(traitAdjustSkill(c, s)).toBe(-10);
    for (const s of [6, 7, 14, 15]) expect(traitAdjustSkill(c, s)).toBe(15);
    for (const s of [8, 9, 10, 11, 12, 13, 16, 17]) expect(traitAdjustSkill(c, s)).toBe(0);
    setTraits(c, Trait.Gifted, Trait.GoodNatured);
    expect(traitAdjustSkill(c, 0)).toBe(-20);
    expect(traitAdjustSkill(c, 6)).toBe(5);
  });

  it('setTraits: duplikat odrzucony, null czysci, zly indeks odrzucony', () => {
    const c = pc();
    expect(setTraits(c, Trait.Finesse, Trait.Finesse)).toEqual({
      ok: false,
      reason: 'trait-duplicate',
    });
    expect(c.traits).toEqual([-1, -1]);
    expect(setTraits(c, Trait.Finesse, null)).toEqual({ ok: true });
    expect(c.traits).toEqual([Trait.Finesse, -1]);
    expect(setTraits(c, null, null)).toEqual({ ok: true });
    expect(setTraits(c, 16 as Trait, null)).toEqual({ ok: false, reason: 'trait-invalid' });
    expect(setTraits(c, null, null)).toEqual({ ok: true });
  });

  it('procedury (w tym Z: Bloody Mess, Jinxed, Sex Appeal) sygnalizowane nazwa', () => {
    const c = pc();
    setTraits(c, Trait.BloodyMess, Trait.Jinxed);
    expect(traitProcs(c)).toEqual(['bloodyMess', 'jinxed']);
    setTraits(c, Trait.Skilled, Trait.SexAppeal);
    expect(traitProcs(c)).toEqual(['skillPointsPerLevel', 'sexAppeal']);
  });
});
