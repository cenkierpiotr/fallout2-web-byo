import {
  findPath,
  hexDistance,
  hexNeighbors,
  isPassableFor,
  type GameMap,
  type GameObject,
} from '@f2/engine-core';
import { REACH_RANGE } from './inventory-world';

/** Wynik planu podejscia do obiektu przed akcja. */
export type ApproachPlan =
  { kind: 'here' } | { kind: 'walk'; hex: number } | { kind: 'none'; reason: 'tooFar' | 'noPath' };

/** Czy gracz stoi na tyle blisko obiektu, by wykonac akcje (ta sama kondygnacja, zasieg REACH_RANGE). */
export function inReach(player: GameObject, target: GameObject, reach = REACH_RANGE): boolean {
  return target.elevation === player.elevation && hexDistance(player.hex, target.hex) <= reach;
}

/**
 * Plan podejscia: jesli gracz jest w zasiegu, akcja od razu; inaczej najkrotsza sciezka A* do heksa
 * celu albo jednego z sasiednich (obiekty blokujace, np. drzwi, skrzynie i krytery, nie sa przechodnie,
 * wiec cel chodu to sasiad). Zwraca heks, do ktorego trzeba isc.
 */
export function planApproach(
  map: GameMap,
  player: GameObject,
  target: GameObject,
  reach = REACH_RANGE,
): ApproachPlan {
  if (target.hex < 0 || target.elevation !== player.elevation)
    return { kind: 'none', reason: 'tooFar' };
  if (inReach(player, target, reach)) return { kind: 'here' };
  let best: { hex: number; len: number } | undefined;
  for (const c of [target.hex, ...hexNeighbors(target.hex)]) {
    if (c === player.hex || !isPassableFor(map, player.elevation, c, player)) continue;
    const path = findPath(map, player.elevation, player.hex, c, player);
    if (!path || path.length === 0) continue;
    if (!best || path.length < best.len) best = { hex: c, len: path.length };
  }
  return best ? { kind: 'walk', hex: best.hex } : { kind: 'none', reason: 'noPath' };
}
