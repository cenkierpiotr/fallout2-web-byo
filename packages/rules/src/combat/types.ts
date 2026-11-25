/**
 * Typy walki (dokumentacja techniczna, criticals.md). Tylko to, co jest dowiedzione (D);
 * czesci Z (burst, eksplozje, pelna formula dystansu toHit, animacje smierci, XP) sa w
 * `pending.ts` jako TODO z odwolaniem do speca.
 */

/** Czesci ciala w kolejnosci tablic krytykow (9) i tablicy toHit (indeksy 0..9). */
export enum BodyPart {
  Head = 0,
  LeftArm = 1,
  RightArm = 2,
  Torso = 3,
  RightLeg = 4,
  LeftLeg = 5,
  Eyes = 6,
  Groin = 7,
  Uncalled = 8,
}

/** Typy obrazen; kolejnosc = offset statow DT (17+typ) i DR (24+typ). */
export enum DamageType {
  Normal = 0,
  Laser = 1,
  Fire = 2,
  Plasma = 3,
  Electrical = 4,
  Emp = 5,
  Explosion = 6,
}

/** Uczestnik kolejki inicjatywy (stat 13 Sequence, stat 6 w binarce = Agility). */
export interface Initiative {
  id: number;
  sequence: number;
  agility: number;
}
