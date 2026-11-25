import { isOverloaded, nightVisionLight } from '@f2/rules';

/**
 * Swiatlo otoczenia kafli z uwzglednieniem Night Vision (D 0x47a908): `ambient` w skali 0..1,
 * ranga 0 = bez zmian (bez przycinania do 0x4000), ranga > 0 = clamp(swiatlo + ranga*0x3333).
 */
export function ambientWithNightVision(ambient: number, nightVisionRank: number): number {
  return nightVisionRank > 0
    ? nightVisionLight(ambient * 0x10000, nightVisionRank) / 0x10000
    : ambient;
}

/** Przeciazenie (D 0x42e66c): gracz ponad udzwigiem nie biega, tylko idzie. Brak sesji = bez ograniczenia. */
export function runAllowedUnderLoad(
  run: boolean,
  load: { carryMax: number; carried: number } | undefined,
): boolean {
  return run && !(load && isOverloaded(load.carryMax, load.carried));
}
