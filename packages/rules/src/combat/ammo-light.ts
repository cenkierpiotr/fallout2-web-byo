import { lightToHitPenalty } from './to-hit.js';

/**
 * Modyfikatory amunicji z proto (podtyp 4, 6 u32 w `Proto.data`): [0] kaliber, [1] ilosc, [2] mod
 * pancerza AC, [3] mod DR, [4] mnoznik obrazen, [5] dzielnik obrazen. D: 0x479190 czyta [2],
 * 0x4791e0 czyta [3]; kolejnosc [4]/[5] wg specs/pro.md i uzycia w computeRoundDamage.
 */
export interface AmmoMods {
  acMod: number;
  drMod: number;
  dmgMult: number;
  dmgDiv: number;
}

export const NO_AMMO_MODS: AmmoMods = { acMod: 0, drMod: 0, dmgMult: 1, dmgDiv: 1 };

/** Indeks proto amunicji (obj+0x40 broni); -1 / brak proto = bez modyfikatorow (D: 0x479190 zwraca 0). */
export function ammoModsOf(
  ammoPid: number,
  protoData: (pid: number) => readonly number[] | undefined,
): AmmoMods {
  if (ammoPid === -1 || ammoPid === undefined) return NO_AMMO_MODS;
  const d = protoData(ammoPid);
  if (!d) return NO_AMMO_MODS;
  return {
    acMod: d[2] ?? 0,
    drMod: d[3] ?? 0,
    dmgMult: d[4] || 1,
    dmgDiv: d[5] || 1,
  };
}

export const LIGHT_MAX = 0x10000;

/**
 * 0x48ad04: swiatlo na kaflu obiektu. `gridLight` to surowa wartosc siatki swiatla (0x47a9c4),
 * `ambient` swiatlo otoczenia (0x47a8f8). Dla gracza odejmuje wlasne swiatlo (obj+0x70). Wynik
 * ograniczony do [ambient, 0x10000] (ponizej otoczenia -> otoczenie).
 */
export function tileLight(gridLight: number, ambient: number, ownLight = 0): number {
  const v = gridLight - ownLight;
  if (v < ambient) return ambient;
  return v > LIGHT_MAX ? LIGHT_MAX : v;
}

/**
 * Krok 11 (D), tylko gracz jako atakujacy: swiatlo celu; bron z perkiem broni 0x42 (WeaponNightSight; 0x478d58 czyta pole proto broni +0x50, nie perk gracza) wymusza 0x10000,
 * brak celu daje 0. Zwraca kare do trafienia (<= 0).
 */
export function playerLightPenalty(
  targetLight: number | undefined,
  weaponNightSight: boolean,
): number {
  const light = targetLight === undefined ? 0 : weaponNightSight ? LIGHT_MAX : targetLight;
  return lightToHitPenalty(light);
}
