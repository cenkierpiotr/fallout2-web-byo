import { describe, expect, it } from 'vitest';
import { classPreferred } from '../src/combat/weapon-choice.js';

// 0x42938c nad tablica 0x518158 (wiersz = best_weapon + 1, 5 x int32).
describe('classPreferred (0x42938c)', () => {
  it('best_weapon 7 (wiersz 8, zera): preferowana tylko klasa 0', () => {
    expect(classPreferred(7, 0)).toBe(true);
    expect(classPreferred(7, 4)).toBe(false);
  });
  it('wiersz -1 (best_weapon -1) zawiera wszystkie klasy 0..4', () => {
    for (const c of [0, 1, 2, 3, 4]) expect(classPreferred(-1, c)).toBe(true);
  });
  it('best_weapon 2: klasy {4, 2}', () => {
    expect(classPreferred(2, 4)).toBe(true);
    expect(classPreferred(2, 2)).toBe(true);
    expect(classPreferred(2, 3)).toBe(false);
  });
});

import { isInstantWeapon, weaponUsableByAi } from '../src/combat/weapon-choice.js';

describe('0x478244 / 0x4298ec', () => {
  it('isInstantWeapon: bit 0x08000000 tylko dla przedmiotow', () => {
    expect(isInstantWeapon(0, 0x08000000)).toBe(true);
    expect(isInstantWeapon(0, 0x1)).toBe(false);
    expect(isInstantWeapon(1, 0x08000000)).toBe(false);
  });
  const base = {
    damageFlags: 0,
    needsBothHands: false,
    weaponValue: 50,
    packetThreshold: 20,
    cls: 4,
    bestWeapon: 4,
  };
  it('weaponUsableByAi: obie rece uszkodzone -> nie', () => {
    expect(weaponUsableByAi(base)).toBe(true);
    expect(weaponUsableByAi({ ...base, damageFlags: 0x30 })).toBe(false);
  });
  it('jedna reka uszkodzona + bron dwureczna -> nie; prog i klasa', () => {
    expect(weaponUsableByAi({ ...base, damageFlags: 0x10, needsBothHands: true })).toBe(false);
    expect(weaponUsableByAi({ ...base, damageFlags: 0x10 })).toBe(true);
    expect(weaponUsableByAi({ ...base, weaponValue: 10 })).toBe(false);
    expect(weaponUsableByAi({ ...base, cls: 2 })).toBe(false);
  });
});
