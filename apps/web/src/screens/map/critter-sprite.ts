import type { SpriteHandle } from '@f2/assets';
import { Anim, type AnimClipInfo, type AnimView } from '@f2/engine-core';
import { ambientLightForHour } from '@f2/rules';
import { isOutdoorMap, resolveAmbient } from '@f2/render';

/** Parametry klipu z naglowka FRM (liczba klatek w kierunku, fps, klatka akcji). */
export function clipInfoOf(
  h: Pick<SpriteHandle, 'framesPerDirection' | 'fps' | 'actionFrame'>,
): AnimClipInfo {
  return { frames: h.framesPerDirection, fps: h.fps, actionFrame: h.actionFrame };
}

/** FID krytera z bazowym indeksem (z listy) i animacja/bronia z widoku AnimDirector. */
export function animatedFid(baseFid: number, view: Pick<AnimView, 'anim' | 'weapon'>): number {
  const index = baseFid & 0xfff;
  return ((1 << 24) | (view.anim << 16) | (view.weapon << 12) | index) >>> 0;
}

/** Animacja chodu/biegu dla stanu ruchu ('AT' = bieg, 'AB' = chod). */
export function moveAnimOf(code: 'AA' | 'AB' | 'AT'): number {
  return code === 'AT' ? Anim.Running : code === 'AB' ? Anim.Walk : Anim.Stand;
}

/**
 * Swiatlo otoczenia mapy: skrypt (set_light_level) ma pierwszenstwo, inaczej krzywa zegara
 * (godzina:minuta gry) dla map zewnetrznych (malo dachow), wnetrza zostaja jasne.
 */
export function mapAmbient(
  scriptLevel: number | undefined,
  hour: number,
  minute: number,
  roof: ArrayLike<number>,
): number {
  return resolveAmbient(scriptLevel, ambientLightForHour(hour, minute), isOutdoorMap(roof));
}
