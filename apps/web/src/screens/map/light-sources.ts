import { HEX_COUNT, hexToWorld } from '@f2/engine-core';
import { MAX_POINT_LIGHTS, type MapLightSource, type PointLight } from '@f2/render';

/** Obiekt mapy w zakresie potrzebnym do wyznaczenia zrodla swiatla (GameObject spelnia ten ksztalt). */
export interface EmitterLike {
  hex: number;
  elevation: number;
  flags: number;
  hidden?: boolean;
  lightRadius?: number;
  lightIntensity?: number;
}

const FLAG_HIDDEN = 0x1;
const FLAG_LIGHT_SOURCE = 0x20;
const MAX_RADIUS = 8;
const MAX_INTENSITY = 0x10000;
/** Promien swiatla w pikselach swiata na 1 heks promienia (jak LightField.pointLights). */
export const LIGHT_PX_PER_HEX = 16;
/**
 * Wysokosc swiatla nad podloga jako ulamek promienia w pikselach (Z). Poprzednie 0.3 px dawalo
 * lambert ~0 (plaskie normalne), swiatlo bylo niewidoczne; 0.4*promien daje miekka plame.
 */
export const LIGHT_Z = 0.4;

/**
 * Zrodla swiatla poziomu: obiekty z flaga 0x20, nieukryte, o promieniu 1..8 i intensywnosci > 0
 * (te same kryteria co LightMap.rebuildStatic). Wynik w kolejnosci obiektow.
 */
export function collectLightSources(
  objects: readonly EmitterLike[],
  elevation: number,
): MapLightSource[] {
  const out: MapLightSource[] = [];
  for (const o of objects) {
    if (o.elevation !== elevation) continue;
    if ((o.flags & FLAG_LIGHT_SOURCE) === 0 || (o.flags & FLAG_HIDDEN) !== 0 || o.hidden) continue;
    if (!Number.isInteger(o.hex) || o.hex < 0 || o.hex >= HEX_COUNT) continue;
    const radius = Math.min(MAX_RADIUS, o.lightRadius ?? 0);
    const intensity = Math.min(MAX_INTENSITY, o.lightIntensity ?? 0);
    if (!(radius > 0) || !(intensity > 0)) continue;
    out.push({ hex: o.hex, elevation, intensity, radius });
  }
  return out;
}

/** Zrodlo -> swiatlo punktowe w pikselach swiata (hex -> piksele przez hexToWorld). */
export function toPointLight(s: MapLightSource): PointLight {
  const w = hexToWorld(s.hex);
  const c = s.color ?? [255, 255, 255];
  const radius = s.radius * LIGHT_PX_PER_HEX;
  return {
    x: w.x,
    y: w.y,
    z: LIGHT_Z * radius,
    color: [c[0] / 255, c[1] / 255, c[2] / 255],
    radius,
    intensity: s.intensity / MAX_INTENSITY,
  };
}

/**
 * Do `max` swiatel, ktorych krag dotyka widoku (srodek kamery + polowa widoku w pikselach swiata),
 * najblizszych srodka; remis rozstrzyga nizszy hex.
 */
export function pickVisibleLights(
  sources: readonly MapLightSource[],
  camX: number,
  camY: number,
  halfW: number,
  halfH: number,
  max: number = MAX_POINT_LIGHTS,
): PointLight[] {
  if (max <= 0) return [];
  const cand: { d: number; hex: number; light: PointLight }[] = [];
  for (const s of sources) {
    const light = toPointLight(s);
    const dx = Math.abs(light.x - camX);
    const dy = Math.abs(light.y - camY);
    if (dx > halfW + light.radius || dy > halfH + light.radius) continue;
    cand.push({ d: Math.hypot(dx, dy), hex: s.hex, light });
  }
  cand.sort((a, b) => a.d - b.d || a.hex - b.hex);
  return cand.slice(0, max).map((c) => c.light);
}
