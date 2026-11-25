import { describe, expect, it } from 'vitest';
import {
  DamageType,
  computeRoundDamage,
  difficultyPercent,
  totalDamage,
  knockbackDamage,
  applyDamage,
} from '../src/index.js';

const r = (o: Partial<Parameters<typeof computeRoundDamage>[0]>) =>
  computeRoundDamage({
    roll: 0,
    rangedBonus: 0,
    ammoMult: 1,
    ammoDiv: 1,
    difficulty: 100,
    dt: 0,
    dr: 0,
    ...o,
  });

describe('obrazenia jednej rundy (0x4247b8, D) - tabela ze specyfikacji', () => {
  const rows: [number, number, number, number, number, number, number, number][] = [
    // roll, bonus, mult, div, diff, DT, DR, wynik
    [10, 0, 1, 1, 100, 0, 0, 5],
    [10, 0, 1, 1, 100, 2, 20, 3],
    [20, 0, 1, 1, 100, 5, 50, 3],
    [30, 0, 2, 1, 100, 3, 0, 27],
    [30, 0, 1, 2, 100, 0, 10, 7],
    [40, 0, 1, 1, 125, 4, 25, 16],
    [40, 0, 1, 1, 75, 4, 25, 9],
    [12, 3, 1, 1, 100, 0, 0, 7],
    [7, 0, 1, 1, 100, 10, 0, 0],
    [100, 0, 1, 1, 100, 8, 80, 9],
  ];
  for (const [roll, rangedBonus, ammoMult, ammoDiv, difficulty, dt, dr, want] of rows)
    it(`roll ${roll} bonus ${rangedBonus} ${ammoMult}/${ammoDiv} diff ${difficulty} DT ${dt} DR ${dr} -> ${want}`, () => {
      expect(r({ roll, rangedBonus, ammoMult, ammoDiv, difficulty, dt, dr })).toBe(want);
    });
});

describe('modyfikatory DT/DR', () => {
  it('flaga omijania pancerza (0x800) mnozy DT i DR przez 20/100', () => {
    // d=50, DT 10 -> 2, d=48, DR 50 -> 10 -> 48-4=44... DR 50*20/100=10: 48*10/100=4 -> 44
    expect(r({ roll: 100, dt: 10, dr: 50, bypassArmor: true })).toBe(44);
  });
  it('flaga omijania nie dziala dla EMP (typ 5)', () => {
    expect(r({ roll: 100, dt: 10, dr: 50, bypassArmor: true, damageType: DamageType.Emp })).toBe(
      20,
    );
  });
  it('perk broni 0x3c / tryby 0xc,0xd,0x12,0x13: tylko DT razy 20/100', () => {
    // d=50, DT 10->2 => 48, DR 50 => 24
    expect(r({ roll: 100, dt: 10, dr: 50, weaponDtReduced: true })).toBe(24);
  });
  it('Finesse celu gracza: DR +30; korekta DR amunicji; przyciecie 0..100', () => {
    // d=50, DR 20+30=50 => 25
    expect(r({ roll: 100, dr: 20, targetFinesse: true })).toBe(25);
    // ammo -50 => DR 0
    expect(r({ roll: 100, dr: 20, ammoDrMod: -50 })).toBe(50);
    // DR przycieta do 100 => 0
    expect(r({ roll: 100, dr: 90, ammoDrMod: 50 })).toBe(0);
  });
  it('dzielenie calkowite: ammoDiv 0 traktowane jako 1', () => {
    expect(r({ roll: 10, ammoDiv: 0 })).toBe(5);
  });
});

describe('trudnosc i suma', () => {
  it('trudnosc dotyczy tylko atakujacego NPC', () => {
    expect(difficultyPercent(true, 'easy')).toBe(100);
    expect(difficultyPercent(true, 'hard')).toBe(100);
    expect(difficultyPercent(false, 'easy')).toBe(75);
    expect(difficultyPercent(false, 'normal')).toBe(100);
    expect(difficultyPercent(false, 'hard')).toBe(125);
  });
  it('suma rund i bonusy gracza po petli', () => {
    expect(totalDamage([5, 3, 0], {})).toBe(8);
    expect(totalDamage([5], { attackerIsPlayer: true, livingAnatomy: true, killType: 0 })).toBe(10);
    // Living Anatomy nie dziala na killtype 10 i 0x10
    expect(totalDamage([5], { attackerIsPlayer: true, livingAnatomy: true, killType: 10 })).toBe(5);
    expect(totalDamage([5], { attackerIsPlayer: true, livingAnatomy: true, killType: 16 })).toBe(5);
    // Pyromaniac tylko dla ognia
    const py = { attackerIsPlayer: true, pyromaniac: true };
    expect(totalDamage([5], { ...py, damageType: DamageType.Fire })).toBe(10);
    expect(totalDamage([5], { ...py, damageType: DamageType.Normal })).toBe(5);
    expect(totalDamage([5], { pyromaniac: true, damageType: DamageType.Fire })).toBe(5);
  });
  it('odrzut dmg/10, z perkiem broni 0x3d dmg/5', () => {
    expect(knockbackDamage(47, false)).toBe(4);
    expect(knockbackDamage(47, true)).toBe(9);
  });
});

describe('applyDamage', () => {
  it('hp nie spada ponizej 0, died tylko przy przejsciu >0 -> <=0', () => {
    expect(applyDamage(3, 10)).toEqual({ hp: 0, died: true });
    expect(applyDamage(0, 10)).toEqual({ hp: 0, died: false });
    expect(applyDamage(-2, 10)).toEqual({ hp: 0, died: false });
    expect(applyDamage(10, 4)).toEqual({ hp: 6, died: false });
    expect(applyDamage(10, 0)).toEqual({ hp: 10, died: false });
  });
});
