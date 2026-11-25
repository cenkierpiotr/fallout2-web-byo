import { describe, expect, it } from 'vitest';
import {
  BEST_WEAPON_ROWS,
  PARTY_TXT_FIELDS,
  chooseBestWeapon,
  generalReputationTitle,
  partyTxtOffset,
  shiftAiPacketByDisposition,
  type WeaponCandidate,
} from '../src/index.js';

const w = (cls: number, dmg: number, extra: Partial<WeaponCandidate> = {}): WeaponCandidate => ({
  cls,
  damage: dmg,
  cost: 0,
  pid: 1,
  ...extra,
});

describe('R17-U5: party.txt klucz -> offset rekordu (0x493bc0)', () => {
  it('offsety i rozmiary tabel enum', () => {
    expect(PARTY_TXT_FIELDS.map((f) => [f.key, f.offset, f.entries])).toEqual([
      ['area_attack_mode', 0x00, 5],
      ['run_away_mode', 0x14, 7],
      ['best_weapon', 0x30, 8],
      ['distance', 0x50, 5],
      ['attack_who', 0x64, 5],
      ['chem_use', 0x78, 6],
      ['disposition', 0x90, 6],
    ]);
  });
  it('flaga int32 = 1 pod offset + 4*indeks', () => {
    expect(partyTxtOffset('best_weapon', 3)).toBe(0x30 + 12);
    expect(partyTxtOffset('disposition', 5)).toBe(0x90 + 20);
    expect(() => partyTxtOffset('best_weapon', 8)).toThrow();
  });
});

describe('R14-U3: wybor broni 0x4293bc', () => {
  it('tabela wierszy', () => {
    expect(BEST_WEAPON_ROWS[0]).toEqual([4, 3, 2, 1, 0]);
    expect(BEST_WEAPON_ROWS[5]).toEqual([4, 0, 0, 0, 0]);
  });
  it('ranged: dystans (klasa 4) wygrywa z melee (klasa 2)', () => {
    const gun = w(4, 10);
    const bat = w(2, 10);
    expect(chooseBestWeapon(4, bat, gun, () => 1)).toBe(gun);
    expect(chooseBestWeapon(4, gun, bat, () => 1)).toBe(gun);
  });
  it('melee preferuje melee', () => {
    const gun = w(4, 10);
    const bat = w(2, 10);
    expect(chooseBestWeapon(1, gun, bat, () => 1)).toBe(bat);
  });
  it('best_weapon -1 i roznica obrazen >5 przebija indeks', () => {
    const gun = w(4, 5);
    const bat = w(2, 20);
    expect(chooseBestWeapon(-1, gun, bat, () => 1)).toBe(bat);
    expect(chooseBestWeapon(-1, gun, w(2, 8), () => 1)).toEqual(gun);
  });
  it('ten sam indeks: wieksze obrazenia przy roznicy >5, inaczej koszt', () => {
    const a = w(4, 10, { cost: 5 });
    const b = w(4, 20, { cost: 1 });
    expect(chooseBestWeapon(4, a, b, () => 1)).toBe(b);
    const c = w(4, 12, { cost: 100 });
    expect(chooseBestWeapon(4, a, c, () => 1)).toBe(c);
    const d = w(4, 12, { cost: 2 });
    expect(chooseBestWeapon(4, a, d, () => 1)).toBe(a);
  });
  it('klasa spoza wiersza = 999, obie -> brak', () => {
    expect(chooseBestWeapon(5, w(2, 1), w(3, 1), () => 1)).toBeNull();
  });
  it('pid 0x4f: przeciwna bron wygrywa', () => {
    const odd = w(4, 10, { pid: 0x4f });
    const bat = w(2, 10);
    expect(chooseBestWeapon(4, odd, bat, () => 1)).toBe(bat);
    expect(chooseBestWeapon(4, bat, odd, () => 1)).toBe(bat);
  });
  it('random (7): rand<=50 -> A, inaczej B', () => {
    const a = w(4, 1);
    const b = w(2, 1);
    expect(chooseBestWeapon(7, a, b, () => 50)).toBe(a);
    expect(chooseBestWeapon(7, a, b, () => 51)).toBe(b);
  });
  it('bron natychmiastowa (flaga 0x478244) zwracana od razu, A pierwsza', () => {
    const a = w(2, 1, { instant: true });
    const b = w(4, 1, { instant: true });
    expect(chooseBestWeapon(4, a, b, () => 1)).toBe(a);
  });
  it('null wejscie = piesc (klasa 1) w zasiegu, 0 gdy brak', () => {
    const gun = w(4, 1);
    expect(chooseBestWeapon(6, null, gun, () => 1, { unarmedInRange: true })).toBeNull();
  });
});

describe('R14-U4: dyspozycja przesuwa packet_num', () => {
  it('delta wg 0x428354', () => {
    // berserk(4) pakiet 53 -> aggressive(3): 53 - (3-4) = 54
    expect(shiftAiPacketByDisposition(53, 4, 3)).toBe(54);
    expect(shiftAiPacketByDisposition(54, 3, 0)).toBe(57);
    expect(shiftAiPacketByDisposition(57, 0, 4)).toBe(53);
  });
  it('v>=5 -> -1 (blad), v==-1 -> bez zmian (null)', () => {
    expect(shiftAiPacketByDisposition(53, 4, 5)).toBe(-1);
    expect(shiftAiPacketByDisposition(53, 4, -1)).toBeNull();
  });
});

describe('R17-U3: tytul reputacji wg kolejnosci pliku (0x4390d0)', () => {
  const genrep = [
    { threshold: 1000, nameMsg: 3000 },
    { threshold: 750, nameMsg: 3001 },
    { threshold: 250, nameMsg: 3003 },
  ];
  it('pierwszy wpis w kolejnosci pliku z threshold <= karma', () => {
    expect(generalReputationTitle(1000, genrep)).toBe(3000);
    expect(generalReputationTitle(800, genrep)).toBe(3001);
    expect(generalReputationTitle(250, genrep)).toBe(3003);
  });
  it('ponizej wszystkich progow -> brak tytulu', () => {
    expect(generalReputationTitle(249, genrep)).toBeNull();
  });
  it('nie sortuje: wazna kolejnosc pliku', () => {
    const odd = [
      { threshold: 250, nameMsg: 1 },
      { threshold: 1000, nameMsg: 2 },
    ];
    expect(generalReputationTitle(1000, odd)).toBe(1);
  });
});
