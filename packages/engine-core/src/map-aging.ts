import type { MapStateJSON, SaveMapObject } from './save/schema.js';

/** Stare mapy (dokumentacja techniczna, "Algorytm po powrocie na mape"): leczenie, sprzatanie. */
export const HOURS_DAILY = 24;
const DMG_DEAD = 0x80;
const DEFAULT_HEAL_PER_3H = 14;
const PID_BLOOD = 0x05000004;
const PID_MISC = 0x0500000b;

const isCritter = (o: SaveMapObject): boolean => o.pid >>> 24 === 1;
const isDead = (o: SaveMapObject): boolean =>
  ((o.dmgFlags ?? 0) & DMG_DEAD) !== 0 || (o.maxHp !== undefined && o.hp <= 0);

export function elapsedHours(nowTicks: number, lastTick: number): number {
  if (nowTicks < lastTick) return 0;
  return (nowTicks - lastTick) / 36000;
}

export function isDailyReset(hours: number): boolean {
  return hours >= HOURS_DAILY;
}

/** Czysta: zwraca kopie stanu mapy po `hours` godzinach nieobecnosci gracza. */
export function ageMapState(
  state: MapStateJSON,
  hours: number,
  opts: { playerId?: number } = {},
): MapStateJSON {
  const out = structuredClone(state);
  if (!Number.isFinite(hours) || hours < 0) return out;
  const steps = Math.floor(hours / 3);
  for (const el of out.elevations) {
    for (const o of el.objects) {
      if (!isCritter(o) || o.objId === opts.playerId || isDead(o)) continue;
      if (o.maxHp !== undefined && o.hp < o.maxHp) {
        o.hp = Math.min(o.maxHp, o.hp + Math.floor(o.healPer3h ?? DEFAULT_HEAL_PER_3H) * steps);
      }
    }
    el.objects = el.objects.filter((o) => {
      if (hours > 144 && isCritter(o) && o.objId !== opts.playerId && isDead(o)) return false;
      if (hours > 336 && (o.pid === PID_BLOOD || o.pid === PID_MISC)) return false;
      return true;
    });
  }
  return out;
}
