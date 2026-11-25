import { describe, expect, it } from 'vitest';
import {
  RollResult,
  Stat,
  adjustHitPoints,
  adjustPoison,
  adjustRadiation,
  defaultRulesContext,
  handleRadiationEvent,
  healCritterHours,
  newCritterData,
  poisonTick,
  radiationLevel,
  radiationMidnightCheck,
  recalcDerived,
  restHealAmount,
  restHoursToFullHeal,
  statLevel,
  statRoll,
  type CritterData,
  type Rng,
} from '../src/index.js';

function seq(values: number[]): Rng & { calls: [number, number][] } {
  let i = 0;
  const calls: [number, number][] = [];
  return {
    calls,
    int: (min, max) => {
      calls.push([min, max]);
      return values[i++] ?? min;
    },
  };
}

function critter(player = true, base = [5, 5, 5, 5, 5, 5, 5]): CritterData {
  const c = newCritterData(player);
  base.forEach((v, i) => (c.baseStats[i] = v));
  recalcDerived(c, defaultRulesContext());
  c.curHP = statLevel(c, Stat.MaxHitPoints, defaultRulesContext());
  return c;
}

const ctx = (rng: Rng) => ({ ...defaultRulesContext(), rng });

describe('statRoll (0x4afa78)', () => {
  it('rzut k10 <= stat + modyfikator = sukces', () => {
    const rng = seq([7]);
    const r = statRoll(critter(), Stat.Endurance, 2, ctx(rng));
    expect(rng.calls[0]).toEqual([1, 10]);
    expect(r.result).toBe(RollResult.Success);
    expect(r.margin).toBe(0);
  });
  it('rzut ponad cel = porazka z ujemnym marginesem', () => {
    const r = statRoll(critter(), Stat.Endurance, 2, ctx(seq([8])));
    expect(r.result).toBe(RollResult.Failure);
    expect(r.margin).toBe(-1);
  });
});

describe('leczenie', () => {
  it('adjustHitPoints ogranicza do max i zabija ponizej 1', () => {
    const c = critter();
    const max = c.curHP;
    c.curHP = max - 3;
    expect(adjustHitPoints(c, 10, ctx(seq([])))).toEqual({ dead: false });
    expect(c.curHP).toBe(max);
    expect(adjustHitPoints(c, -max, ctx(seq([])))).toEqual({ dead: true });
    expect(c.curHP).toBe(0);
  });
  it('healCritterHours: 14 * floor(h/3), obciete do max, tylko gdy HP < max', () => {
    const c = critter();
    const max = c.curHP;
    c.curHP = 1;
    expect(healCritterHours(c, 6, ctx(seq([])))).toBe(28);
    expect(c.curHP).toBe(29);
    c.curHP = 1;
    expect(healCritterHours(c, 30, ctx(seq([])))).toBe(max - 1);
    expect(c.curHP).toBe(max);
    c.curHP = 1;
    expect(healCritterHours(c, 2, ctx(seq([])))).toBe(0);
    c.curHP = max;
    expect(healCritterHours(c, 30, ctx(seq([])))).toBe(0);
  });
  it('restHealAmount = healing rate * floor(3/3)', () => {
    const c = critter();
    expect(restHealAmount(c, ctx(seq([])))).toBe(statLevel(c, Stat.HealingRate, ctx(seq([]))));
  });
  it('restHoursToFullHeal = brakujace HP / healing rate * 3 (W)', () => {
    expect(restHoursToFullHeal(10, 2)).toBe(15);
    expect(restHoursToFullHeal(0, 2)).toBe(0);
    expect(restHoursToFullHeal(10, 0)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('trucizna (0x42d210, 0x42d318)', () => {
  it('dodatnia dawka odejmuje odpornosc, planuje tick', () => {
    const c = critter();
    c.baseStats[Stat.PoisonResistance] = 20;
    const r = adjustPoison(c, 10, ctx(seq([])));
    expect(c.curPoison).toBe(8);
    expect(r.nextTickDelay).toBe((505 - 5 * 8) * 10);
    expect(r.message).toBe(3000);
  });
  it('nie dziala na nie-graczu', () => {
    const c = critter(false);
    expect(adjustPoison(c, 10, ctx(seq([]))).applied).toBe(false);
    expect(c.curPoison).toBe(0);
  });
  it('ujemna dawka do zera = wyleczenie, bez ticka; przy braku trucizny nic', () => {
    const c = critter();
    c.curPoison = 3;
    const r = adjustPoison(c, -5, ctx(seq([])));
    expect(c.curPoison).toBe(0);
    expect(r.nextTickDelay).toBeNull();
    expect(r.message).toBe(3003);
    expect(adjustPoison(c, -5, ctx(seq([]))).applied).toBe(false);
  });
  it('ujemna dawka czesciowa: komunikat "mniej"', () => {
    const c = critter();
    c.curPoison = 10;
    const r = adjustPoison(c, -4, ctx(seq([])));
    expect(c.curPoison).toBe(6);
    expect(r.message).toBe(3002);
  });
  it('tick: trucizna -2, HP -1, przerywa gdy HP <= 5', () => {
    const c = critter();
    c.curPoison = 10;
    c.curHP = 30;
    const t = poisonTick(c, ctx(seq([])));
    expect(c.curPoison).toBe(8);
    expect(c.curHP).toBe(29);
    expect(t.nextTickDelay).toBe((505 - 40) * 10);
    expect(t.interrupt).toBe(false);
    c.curHP = 6;
    expect(poisonTick(c, ctx(seq([]))).interrupt).toBe(true);
    c.curHP = 1;
    expect(poisonTick(c, ctx(seq([]))).dead).toBe(true);
  });
  it('tick bez trucizny nadal zabiera 1 HP (zachowanie oryginalu)', () => {
    const c = critter();
    c.curHP = 30;
    poisonTick(c, ctx(seq([])));
    expect(c.curHP).toBe(29);
  });
  it('tick nie-gracza nic nie robi', () => {
    const c = critter(false);
    const hp = c.curHP;
    expect(poisonTick(c, ctx(seq([]))).applied).toBe(false);
    expect(c.curHP).toBe(hp);
  });
});

describe('promieniowanie', () => {
  it('radiationLevel: progi 100/200/400/600/1000', () => {
    const l = [0, 99, 100, 199, 200, 399, 400, 599, 600, 999, 1000, 5000].map(radiationLevel);
    expect(l).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  });
  it('adjustRadiation: odpornosc, flaga, komunikaty, dolna granica 0', () => {
    const c = critter();
    c.baseStats[Stat.RadiationResistance] = 25;
    const r = adjustRadiation(c, 100, ctx(seq([])), false);
    expect(c.curRad).toBe(75);
    expect(r.needsMidnightCheck).toBe(true);
    expect(r.messages).toEqual([1007]);
    const g = adjustRadiation(c, 4, ctx(seq([])), true);
    expect(g.messages).toEqual([1008]);
    const g2 = adjustRadiation(c, 8, ctx(seq([])), true);
    expect(g2.messages).toEqual([1009]);
    const z = adjustRadiation(c, -9999, ctx(seq([])), false);
    expect(c.curRad).toBe(0);
    expect(z.needsMidnightCheck).toBe(false);
    expect(adjustRadiation(critter(false), 50, ctx(seq([])), false).applied).toBe(false);
  });
  it('polnoc: porazka testu Endurance podnosi poziom, planuje zdarzenie 4-18 h', () => {
    const c = critter();
    c.curRad = 250; // poziom 2, modyfikator -2: cel 3
    const fail = seq([5, 10]);
    const r = radiationMidnightCheck(c, true, 0, ctx(fail));
    expect(fail.calls).toEqual([
      [1, 10],
      [4, 18],
    ]);
    expect(r.schedule).toEqual({ level: 3, phase: 0, delayTicks: 360000 });
    const ok = radiationMidnightCheck(c, true, 0, ctx(seq([3, 4])));
    expect(ok.schedule).toEqual({ level: 2, phase: 0, delayTicks: 144000 });
  });
  it('polnoc: brak flagi, niski poziom lub istniejacy wyzszy poziom = bez zdarzenia', () => {
    const c = critter();
    c.curRad = 250;
    expect(radiationMidnightCheck(c, false, 0, ctx(seq([10, 4]))).schedule).toBeUndefined();
    expect(radiationMidnightCheck(c, true, 3, ctx(seq([5, 4]))).schedule).toBeUndefined();
    c.curRad = 10; // poziom 0, mod +2: cel 7, rzut 1 = sukces -> 0 nie > 0
    expect(radiationMidnightCheck(c, true, 0, ctx(seq([1, 4]))).schedule).toBeUndefined();
  });
  it('zdarzenie faza 0: kary statow, odzysk po 7 dobach, komunikat poziomu', () => {
    const c = critter();
    const r = handleRadiationEvent(c, { level: 2, phase: 0 }, 1000, []);
    expect(c.bonusStats[Stat.Strength]).toBe(-1);
    expect(r.schedule).toEqual({ level: 2, phase: 1, atTick: 1000 + 6048000 });
    expect(r.messages).toEqual([1001]);
    expect(r.dead).toBe(false);
    expect(r.interrupt).toBe(true);
  });
  it('zdarzenie faza 1 cofa kary', () => {
    const c = critter();
    handleRadiationEvent(c, { level: 3, phase: 0 }, 0, []);
    // poziom 3 = wiersz 2 tabeli 0x518378 (wiersz = poziom - 1)
    expect(c.bonusStats[Stat.Strength]).toBe(-1);
    expect(c.bonusStats[Stat.Agility]).toBe(-1);
    expect(c.bonusStats[Stat.HealingRate]).toBe(-3);
    const r = handleRadiationEvent(c, { level: 3, phase: 1 }, 0, []);
    expect(c.bonusStats[Stat.Strength]).toBe(0);
    expect(c.bonusStats[Stat.HealingRate]).toBe(0);
    expect(r.schedule).toBeUndefined();
  });
  it('faza 0 usuwa oczekujace zdarzenia i cofa te w fazie 1', () => {
    const c = critter();
    c.bonusStats[Stat.Strength] = -1;
    const pending = [
      { level: 2, phase: 1 as const, atTick: 500 },
      { level: 1, phase: 0 as const, atTick: 600 },
    ];
    const r = handleRadiationEvent(c, { level: 3, phase: 0 }, 0, pending);
    expect(r.remove).toEqual(pending);
    // cofnieto poziom 2 (+1), zastosowano poziom 3 (-1)
    expect(c.bonusStats[Stat.Strength]).toBe(-1);
  });
  it('smierc gdy SPECIAL spada do 0', () => {
    const c = critter(true, [1, 5, 5, 5, 5, 5, 5]);
    const r = handleRadiationEvent(c, { level: 2, phase: 0 }, 0, []);
    expect(r.dead).toBe(true);
    expect(r.messages).toContain(1006);
  });
  it('poziom 6 (porazka testu przy poziomie 5, bez limitu w exe) uzywa wiersza 5; poziom 1 bez kar', () => {
    const c = critter();
    c.curRad = 1500; // poziom 5, mod -8
    const r = radiationMidnightCheck(c, true, 0, ctx(seq([1, 4])));
    expect(r.schedule?.level).toBe(6);
    handleRadiationEvent(c, { level: 6, phase: 0 }, 0, []);
    expect(c.bonusStats[Stat.Strength]).toBe(-6);
    expect(c.bonusStats[Stat.HealingRate]).toBe(-10);
    const d = critter();
    handleRadiationEvent(d, { level: 1, phase: 0 }, 0, []);
    expect(d.bonusStats[Stat.Strength] ?? 0).toBe(0);
  });
  it('smierc nie dotyczy Luck (petla 0x42d6c9 tylko St..Ag)', () => {
    const c = critter(true, [5, 5, 5, 5, 5, 5, 0]);
    expect(handleRadiationEvent(c, { level: 2, phase: 0 }, 0, []).dead).toBe(false);
  });
  it('poziom 0: bez efektu; efekt dziala tez na nie-graczu (Z)', () => {
    const c = critter();
    expect(handleRadiationEvent(c, { level: 0, phase: 0 }, 0, []).messages).toEqual([]);
    const n = critter(false);
    handleRadiationEvent(n, { level: 2, phase: 0 }, 0, []);
    expect(n.bonusStats[Stat.Strength]).toBe(-1);
  });
});
