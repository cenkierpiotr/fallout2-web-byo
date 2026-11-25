/**
 * Swiatlo otoczenia wg godziny. UWAGA: oryginalny silnik nie ma krzywej dzien/noc
 * (dokumentacja techniczna, R15b Z1: swiatlo ustawiaja skrypty map przez set_light_level),
 * wiec to nasza aproksymacja dla map bez skryptowego swiatla. Zwraca 0.25..1.
 * Punkty: 05:00 i 21:00 = min, 08:00..18:00 = max, liniowo pomiedzy.
 */
export const AMBIENT_MIN = 0.25;
export const AMBIENT_MAX = 1;
const DAWN_START = 5 * 60;
const DAWN_END = 8 * 60;
const DUSK_START = 18 * 60;
const DUSK_END = 21 * 60;

export function ambientLightForHour(hour: number, minute: number): number {
  const t = (((hour * 60 + minute) % 1440) + 1440) % 1440;
  if (t <= DAWN_START || t >= DUSK_END) return AMBIENT_MIN;
  if (t >= DAWN_END && t <= DUSK_START) return AMBIENT_MAX;
  const f =
    t < DAWN_END
      ? (t - DAWN_START) / (DAWN_END - DAWN_START)
      : (DUSK_END - t) / (DUSK_END - DUSK_START);
  return AMBIENT_MIN + f * (AMBIENT_MAX - AMBIENT_MIN);
}

/** Skala swiatla otoczenia silnika (0x51923c): 0x4000..0x10000 (0x47a908). */
export const AMBIENT_LIGHT_SCALE = 0x10000;

/** PID Solar Scorchera: bron ladowana swiatlem (0x478874). */
export const SOLAR_SCORCHER_PID = 0x186;

/** Prog swiatla (0xf333, ok. 95% skali), powyzej ktorego Solar Scorcher moze strzelac / jest naladowany (0x478874). */
export const SOLAR_SCORCHER_LIGHT_THRESHOLD = 0xf333;

/** Czy Solar Scorcher jest gotowy do strzalu przy danym swietle otoczenia (skala 0x4000..0x10000). */
export function solarScorcherReady(ambientLight: number): boolean {
  return ambientLight > SOLAR_SCORCHER_LIGHT_THRESHOLD;
}
