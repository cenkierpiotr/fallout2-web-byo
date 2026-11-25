import { describe, expect, it } from 'vitest';
import { attackApCost } from './ap.js';
import { aiSecondaryModeChoice, attackModeHand } from './attack-mode.js';

describe('attackModeHand (tablica skokow 0x478b04)', () => {
  it('tryby 0,1,6 -> reka 0x471bbc, 2,3,7 -> reka 0x471b70, reszta brak', () => {
    expect([0, 1, 6].map(attackModeHand)).toEqual(['A', 'A', 'A']);
    expect([2, 3, 7].map(attackModeHand)).toEqual(['B', 'B', 'B']);
    expect([4, 5, 8, 0xb, 0x13].map(attackModeHand)).toEqual([null, null, null, null, null]);
  });
});

describe('attackApCost: przeladowanie (tryby 6/7, 0x478b5e)', () => {
  const base = { mode: 6, hasWeapon: true };
  it('domyslnie 2, perk broni 0x41 -> 1, pid 0x186 -> 0, bez modyfikatorow gracza', () => {
    expect(attackApCost(base)).toBe(2);
    expect(attackApCost({ ...base, weaponPerk: 0x41 })).toBe(1);
    expect(attackApCost({ ...base, mode: 7, weaponPid: 0x186 })).toBe(0);
    expect(attackApCost({ ...base, isPlayer: true, perk5: 1, weaponClass: 4, aimed: true })).toBe(
      2,
    );
  });
});

describe('attackApCost: drugi tryb data[9] = proto+0x48', () => {
  it('tryby 1 i 3 czytaja secondary, 0 i 2 primary', () => {
    const b = { hasWeapon: true, protoPrimaryAp: 4, protoSecondaryAp: 6 };
    expect(attackApCost({ ...b, mode: 0 })).toBe(4);
    expect(attackApCost({ ...b, mode: 2 })).toBe(4);
    expect(attackApCost({ ...b, mode: 1 })).toBe(6);
    expect(attackApCost({ ...b, mode: 3 })).toBe(6);
  });
});

describe('aiSecondaryModeChoice (0x429db4 po wyborze flagi obszaru)', () => {
  const ok = {
    hasWeapon: true,
    isWeaponType: true,
    classOfSecondary: 4,
    usable: true,
    areaFlag: true,
  };
  it('brak broni lub zly typ -> 4 (piesc)', () => {
    expect(aiSecondaryModeChoice({ ...ok, hasWeapon: false })).toBe(4);
    expect(aiSecondaryModeChoice({ ...ok, isWeaponType: false })).toBe(4);
  });
  it('klasa 0, bron nieuzywalna lub brak pakietu -> 2 / 4', () => {
    expect(aiSecondaryModeChoice({ ...ok, classOfSecondary: 0 })).toBe(2);
    expect(aiSecondaryModeChoice({ ...ok, usable: false })).toBe(2);
    expect(aiSecondaryModeChoice({ ...ok, packetMissing: true })).toBe(4);
  });
  it('flaga obszaru i klasa preferowana -> 3; brak flagi lub klasa poza lista -> 2', () => {
    expect(aiSecondaryModeChoice({ ...ok, classPreferred: true })).toBe(3);
    expect(aiSecondaryModeChoice({ ...ok, classPreferred: false })).toBe(2);
    expect(aiSecondaryModeChoice({ ...ok, classPreferred: true, areaFlag: false })).toBe(2);
  });
  it('klasa 3: przy braku innej broni i udanym rzucie IN -> 2', () => {
    const t = { ...ok, classOfSecondary: 3, classPreferred: true };
    expect(aiSecondaryModeChoice({ ...t, noOtherWeapon: true, intRollSuccess: true })).toBe(2);
    expect(aiSecondaryModeChoice({ ...t, noOtherWeapon: true, intRollSuccess: false })).toBe(3);
    expect(aiSecondaryModeChoice({ ...t, noOtherWeapon: false, intRollSuccess: true })).toBe(3);
  });
});
