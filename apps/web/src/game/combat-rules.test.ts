import { describe, expect, it } from 'vitest';
import { BodyPart, DamageType, type Rng } from '@f2/rules';
import { FISTS, type Combatant, type WeaponSpec } from './combat';
import { createRulesResolver, hitChance, rangedDamageBonus } from './combat-rules';

const seq = (...v: number[]): Rng => {
  let i = 0;
  return { int: (min, max) => Math.min(max, Math.max(min, v[i++ % v.length] as number)) };
};

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

const PISTOL: WeaponSpec = {
  name: 'pistol',
  pid: 1,
  minDmg: 10,
  maxDmg: 10,
  apCost: 5,
  range: 20,
  skill: 80,
  burst: 1,
  damageType: DamageType.Normal,
  cls: 4,
};

describe('hitChance', () => {
  it('skill minus AC, korekta czesci ciala, limit 95', () => {
    const a = unit();
    expect(hitChance(a, unit({ id: 2, ac: 10 }), PISTOL, BodyPart.Uncalled, 10)).toBe(70);
    expect(hitChance(a, unit({ id: 2, ac: 10 }), PISTOL, BodyPart.Head, 10)).toBe(30);
    expect(hitChance(a, unit({ id: 2 }), { ...PISTOL, skill: 200 }, BodyPart.Uncalled, 10)).toBe(
      95,
    );
  });
  it('dystans (D, combat.md krok 3): przy dist = mult*PE modyfikator 0, blizej premia, dalej kara; bron biala bez modyfikatora', () => {
    const a = unit({ perception: 5 });
    const t = unit({ id: 2 });
    expect(hitChance(a, t, PISTOL, BodyPart.Uncalled, 10)).toBe(80);
    expect(hitChance(a, t, PISTOL, BodyPart.Uncalled, 15)).toBe(60);
    expect(hitChance(a, t, PISTOL, BodyPart.Uncalled, 8)).toBe(88);
    expect(hitChance(a, t, FISTS, BodyPart.Uncalled, 1)).toBe(55);
  });
  it('lezacy cel +40', () => {
    expect(
      hitChance(
        unit(),
        unit({ id: 2, prone: true }),
        { ...PISTOL, skill: 30 },
        BodyPart.Uncalled,
        10,
      ),
    ).toBe(70);
  });
});

describe('createRulesResolver', () => {
  const ctx = { part: BodyPart.Uncalled, weapon: PISTOL, distance: 10 };
  it('pudlo gdy rzut > szansa', () => {
    const r = createRulesResolver({ rng: seq(99, 99) });
    const o = r(unit(), unit({ id: 2 }), ctx);
    expect(o.hit).toBe(false);
    expect(o.damage).toBe(0);
  });
  it('trafienie: obrazenia z computeRoundDamage (DT i DR celu)', () => {
    // rzut 1 (trafienie), rzut krytyka 100 (brak)
    const r = createRulesResolver({ rng: seq(1, 100) });
    const t = unit({ id: 2, dt: [2, 0, 0, 0, 0, 0, 0], dr: [50, 0, 0, 0, 0, 0, 0] });
    const o = r(unit(), t, ctx);
    expect(o.hit).toBe(true);
    // 10 (mnoznik 2 / 2), -2 DT = 8, -50% DR = 4
    expect(o.damage).toBe(4);
    expect(o.critical).toBeUndefined();
  });
  it('trafienie krytyczne mnozy obrazenia wg tablicy', () => {
    // rzut 1, rzut krytyka 1 (<= margin/10 + critChance), poziom krytyka d100=95 -> 4, czesc losowa 3 (korpus)
    const r = createRulesResolver({ rng: seq(1, 1, 95, 3, 1, 1, 1, 1) });
    const o = r(unit({ critChance: 50 }), unit({ id: 2, killType: 0 }), ctx);
    expect(o.hit).toBe(true);
    expect(o.critical).toBeDefined();
    expect(o.critical?.level).toBe(4);
    expect(o.damage).toBeGreaterThan(10);
  });
  it('krytyczne pudlo zwraca poziom', () => {
    // rzut 100 (pudlo), rzut krytyka 1, poziom krytycznego pudla d100=97, LK 5 -> 4
    const r = createRulesResolver({ rng: seq(100, 1, 97) });
    const o = r(unit(), unit({ id: 2 }), ctx);
    expect(o.hit).toBe(false);
    expect(o.critMiss).toBe(4);
  });
  it('seria: kazdy pocisk trafia osobno (resolveBurst)', () => {
    const burst: WeaponSpec = { ...PISTOL, burst: 3, minDmg: 8, maxDmg: 8 };
    // rzuty trafienia: 1,1,1 (3 trafienia), potem 100 konczy; rzut krytyka 100; kolejne: obrazenia
    const r = createRulesResolver({ rng: seq(1, 1, 1, 100, 100, 8, 8, 8) });
    const o = r(unit(), unit({ id: 2 }), { ...ctx, weapon: burst });
    expect(o.hitRounds).toBe(3);
    expect(o.damage).toBe(24);
  });
  it('seria z ctx.burstSpread: liczba trafien pochodzi z rozkladu po liniach (opt-in)', () => {
    const burst: WeaponSpec = { ...PISTOL, burst: 3, minDmg: 8, maxDmg: 8 };
    let got = -1;
    const r = createRulesResolver({ rng: seq(100, 100, 8, 8) });
    const o = r(unit(), unit({ id: 2 }), {
      ...ctx,
      weapon: burst,
      burstSpread: (chance) => {
        got = chance;
        return 2;
      },
    });
    expect(got).toBeGreaterThan(0);
    expect(o.hitRounds).toBe(2);
  });
  it('obrazenia obszarowe: bez rzutu, DT/DR wybuchu', () => {
    const r = createRulesResolver({ rng: seq(20) });
    const bomb: WeaponSpec = {
      ...PISTOL,
      minDmg: 20,
      maxDmg: 20,
      explosive: true,
      damageType: DamageType.Explosion,
    };
    const o = r(unit(), unit({ id: 2 }), {
      part: BodyPart.Torso,
      weapon: bomb,
      distance: 1,
      splash: true,
    });
    expect(o.hit).toBe(true);
    expect(o.damage).toBe(20);
  });
  it('trudnosc: NPC na hard zadaje 125%', () => {
    const w = { ...PISTOL, minDmg: 20, maxDmg: 20 };
    const hard = createRulesResolver({ rng: seq(1, 100), difficulty: 'hard' });
    expect(hard(unit(), unit({ id: 2 }), { ...ctx, weapon: w }).damage).toBe(25);
    const pl = createRulesResolver({ rng: seq(1, 100), difficulty: 'hard' });
    expect(pl(unit({ isPlayer: true }), unit({ id: 2 }), { ...ctx, weapon: w }).damage).toBe(20);
  });
});

describe('hitChance: hook sfall tohit', () => {
  const a = unit({ id: 7 });
  const t = unit({ id: 9, ac: 10 });
  it('bez hooka (flaga wylaczona) wynik identyczny', () => {
    const base = hitChance(a, t, PISTOL, BodyPart.Uncalled, 10);
    expect(hitChance(a, t, PISTOL, BodyPart.Uncalled, 10, undefined)).toBe(base);
    expect(hitChance(a, t, PISTOL, BodyPart.Uncalled, 10, () => undefined)).toBe(base);
    expect(hitChance(a, t, PISTOL, BodyPart.Uncalled, 10, () => () => undefined)).toBe(base);
  });
  it('wlaczony hook zmienia szanse i dostaje id oraz czesc ciala', () => {
    const seen: number[] = [];
    const v = hitChance(a, t, PISTOL, BodyPart.Head, 10, (x, y, p) => {
      seen.push(x, y, p);
      return () => 33;
    });
    expect(v).toBe(33);
    expect(seen).toEqual([7, 9, BodyPart.Head]);
  });
  it('resolver uzywa hooka (100% trafien)', () => {
    const r = createRulesResolver({ rng: seq(1), toHitHook: () => () => 95 });
    expect(r(a, t, { weapon: PISTOL, part: BodyPart.Uncalled, distance: 5 } as never).hit).toBe(
      true,
    );
  });
});

describe('forcedHits (dodatkowy cel serii, 0x423488)', () => {
  const burstGun: WeaponSpec = { ...PISTOL, burst: 5, minDmg: 8, maxDmg: 8 };
  const resolve = createRulesResolver({ rng: seq(1), difficulty: 'normal' });
  it('narzucone trafienia daja obrazenia bez rzutu na trafienie', () => {
    const out = resolve(unit(), unit({ id: 2 }), {
      part: BodyPart.Uncalled,
      weapon: burstGun,
      distance: 5,
      forcedHits: 3,
    });
    expect(out.hit).toBe(true);
    expect(out.hitRounds).toBe(3);
    expect(out.rounds).toBe(5);
    expect(out.damage).toBeGreaterThan(0);
  });
  it('0 trafien = pudlo bez obrazen', () => {
    const out = resolve(unit(), unit({ id: 2 }), {
      part: BodyPart.Uncalled,
      weapon: burstGun,
      distance: 5,
      forcedHits: 0,
    });
    expect(out).toMatchObject({ hit: false, damage: 0 });
  });
});

describe('rangedDamageBonus (0x424911, D)', () => {
  it('2 na stopien perka 4, tylko gracz i bron dystansowa', () => {
    const p = unit({ isPlayer: true, perks: { 4: 2 } });
    expect(rangedDamageBonus(p, PISTOL)).toBe(4);
    expect(rangedDamageBonus(p, { ...PISTOL, cls: 2 })).toBe(0);
    expect(rangedDamageBonus(unit({ perks: { 4: 2 } }), PISTOL)).toBe(0);
  });
});
