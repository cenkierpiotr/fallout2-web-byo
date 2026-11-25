// Wybor broni AI (silnik gry 0x4293bc, R14-U3). D, patrz dokumentacja techniczna
// best_weapon = surowy indeks enum z AI.TXT (-1 brak, 0 no_preference ... 7 random).

/** Tabela 0x518158: wiersz = best_weapon + 1, kolumna = priorytet klasy broni (0 = najlepsza). */
export const BEST_WEAPON_ROWS: readonly (readonly number[])[] = [
  [4, 3, 2, 1, 0], // -1 (brak)
  [4, 3, 2, 1, 0], // no_preference
  [2, 0, 0, 0, 0], // melee
  [2, 4, 0, 0, 0], // melee_over_ranged
  [4, 2, 0, 0, 0], // ranged_over_melee
  [4, 0, 0, 0, 0], // ranged
  [1, 0, 0, 0, 0], // unarmed
  [1, 3, 0, 0, 0], // unarmed_over_thrown
];

/**
 * 0x42938c(packet, klasa) (D): wiersz tablicy 0x518158 = packet+0x9c (best_weapon) + 1, stride 0x14, 5 pozycji int32;
 * 1 gdy ktoras pozycja == klasa, inaczej 0. Dla best_weapon 7 (random) wiersz 8 (0x5181f8..0x51820b) to same zera
 * (odczyt z exe), czyli pasuje tylko klasa 0. Dalsze wiersze (best_weapon > 7) leza poza tablica (dane 0x518208..: 5, 7, 7, 7,
 * 0xc350, niepewne), loader AI.TXT takich wartosci nie produkuje (enum 0..7), wiec tu false.
 * Pozycje 0 w krotszych wierszach to wypelnienie, a nie klasa: klasa 0 pasuje do kazdego z nich (jak w exe).
 */
export function classPreferred(bestWeapon: number, cls: number): boolean {
  if (bestWeapon === 7) return cls === 0;
  const row = BEST_WEAPON_ROWS[bestWeapon + 1];
  if (!row) return false;
  return row.includes(cls);
}

/** Tabela 0x5191a8: tryb ataku (nibble proto+0x18) -> klasa (0 brak, 1 piesc, 2 melee, 3 rzut, 4 dystans). */
export const ATTACK_MODE_CLASS: readonly number[] = [
  0, 1, 1, 2, 2, 3, 4, 4, 4, 0x6a, 0x15, 0, 0x57, 0x16, 4, 0x35,
];

export interface WeaponCandidate {
  /** Klasa 0x478280(W, 2). */
  cls: number;
  /** |max - min| / 2 po modyfikatorach serii (x(burst+1)) i x5 (0x478d58 != -1), liczone przez wywolujacego. */
  damage: number;
  /** Koszt 0x477cac (z amunicja). */
  cost: number;
  /** pid obiektu (obj+0x64). */
  pid: number;
  /** 0x478244(W) != 0 (proto.flags & 0x08000000, D): zwracana od razu (A sprawdzana pierwsza). */
  instant?: boolean;
  /** 0x4213e8 != 0 (D, ally-fire-check.ts) i ECX != 0: pomija tabele (indeks 999). */
  skipTable?: boolean;
}

export interface ChooseOptions {
  /** Dla broni null: dystans <= zasieg piesci (0x478a1c(critter,4)) -> klasa 1. */
  unarmedInRange?: boolean;
}

const NONE = 999;
const PID_SPECIAL = 0x4f; // D: pid 0x4f = pro 79 "Flare" (pro_item.msg 7900)

/** `rand` zwraca 1..100 (0x4a30c0). Zwraca wybrana bron lub null (brak/piesc). */
export function chooseBestWeapon(
  bestWeapon: number,
  a: WeaponCandidate | null,
  b: WeaponCandidate | null,
  rand: () => number,
  opts: ChooseOptions = {},
): WeaponCandidate | null {
  if (bestWeapon === 7) return rand() <= 50 ? a : b;
  const row = BEST_WEAPON_ROWS[Math.min(7, Math.max(0, bestWeapon + 1))] ?? BEST_WEAPON_ROWS[0]!;
  const idxOf = (wp: WeaponCandidate | null): { idx: number; dmg: number; cost: number } => {
    if (!wp) {
      const idx = opts.unarmedInRange ? row.indexOf(1) : -1;
      return { idx: idx < 0 ? NONE : idx, dmg: 0, cost: 0 };
    }
    if (wp.skipTable) return { idx: NONE, dmg: wp.damage, cost: wp.cost };
    const idx = row.indexOf(wp.cls);
    return { idx: idx < 0 ? NONE : idx, dmg: wp.damage, cost: wp.cost };
  };
  if (a?.instant) return a;
  if (b?.instant) return b;
  const ia = idxOf(a);
  const ib = idxOf(b);
  if (ia.idx !== ib.idx) {
    if (a && a.pid === PID_SPECIAL && b) return b;
    if (b && b.pid === PID_SPECIAL && a) return a;
    if ((bestWeapon === -1 || bestWeapon >= 6) && Math.abs(ib.dmg - ia.dmg) > 5)
      return ia.dmg >= ib.dmg ? a : b;
    return ia.idx > ib.idx ? b : a;
  }
  if (ia.idx === NONE) return null;
  if (Math.abs(ib.dmg - ia.dmg) > 5) return ia.dmg >= ib.dmg ? a : b;
  return ib.cost > ia.cost ? b : a;
}

/**
 * Setter dyspozycji 0x428354: nowy packet_num = packet_num - (v - biezaca).
 * v >= 5 -> -1 (blad); v == -1 -> null (bez zmian).
 */
export function shiftAiPacketByDisposition(
  packetNum: number,
  current: number,
  v: number,
): number | null {
  if (v >= 5) return -1;
  if (v === -1) return null;
  return packetNum - (v - current);
}

/** Bit proto+0x18 przedmiotu testowany przez 0x478244 (D): ustawiony -> 0x4293bc zwraca te bron od razu. */
export const PROTO_FLAG_INSTANT_WEAPON = 0x08000000;

/** 0x478244(obj): 0 dla nie-przedmiotow (typ pid != 0), inaczej `proto.flags & 0x08000000` (D). */
export function isInstantWeapon(pidType: number, protoFlags: number): boolean {
  if (pidType !== 0) return false;
  return (protoFlags & PROTO_FLAG_INSTANT_WEAPON) !== 0;
}

export interface WeaponUsableInput {
  /** Stan krytera (+0x44): 0x10 i 0x20 = uszkodzone rece. */
  damageFlags: number;
  /** Wynik 0x478598 (bron wymaga obu rak), liczony gdy ktoras reka uszkodzona. */
  needsBothHands: boolean;
  /** Wartosc 0x4aa558 dla broni (porownywana z polem +0xc pakietu). */
  weaponValue: number;
  /** Pole +0xc pakietu (0x4280b4). */
  packetThreshold: number;
  /** Klasa broni 0x478280(W, 2). */
  cls: number;
  bestWeapon: number;
}

/** 0x4298ec (D): czy bron z ekwipunku nadaje sie do uzycia przez AI. */
export function weaponUsableByAi(i: WeaponUsableInput): boolean {
  const both = (i.damageFlags & 0x10) !== 0 && (i.damageFlags & 0x20) !== 0;
  if (both) return false;
  if ((i.damageFlags & 0x30) !== 0 && i.needsBothHands) return false;
  if (i.weaponValue < i.packetThreshold) return false;
  return classPreferred(i.bestWeapon, i.cls);
}

/** pid Dogmeat (0x1000098): wyjatek w bramce 0x4299a0 i w kolejnosci tur 0x421a34/0x421efc (D). */
export const PID_DOGMEAT = 0x1000098;

/**
 * Bramka poczatku 0x4299a0 (D): AI przeglada ekwipunek pod bron tylko gdy `body_type` krytera
 * (proto+0x184, 0x42ddc4) to 0 (biped) lub 2 (robot), albo pid == Dogmeat.
 */
export function aiMayPickInventoryWeapon(bodyType: number, pid: number): boolean {
  return bodyType === 0 || bodyType === 2 || pid === PID_DOGMEAT;
}
