import { Anim } from '@f2/engine-core';
import type { CombatEvent } from './combat';

export interface AnimCue {
  /** Id obiektu, ktory ma zagrac klip. */
  id: number;
  anim: number;
  /** Dolacz po biezacym klipie (reakcja po ataku) zamiast zastepowac. */
  queue?: boolean;
}

/**
 * Zdarzenie walki -> klipy krytterow: atakujacy (pchniecie/uderzenie bez broni), cel: unik przy
 * pudle, trafienie z przodu przy obrazeniach; smierc gra wariant z zdarzenia (zostaje na ostatniej klatce).
 * Chodzenie w walce obsluguje ruch (movement), nie to mapowanie.
 */
export function animCuesFor(e: CombatEvent): AnimCue[] {
  switch (e.kind) {
    case 'attack': {
      const cues: AnimCue[] = [{ id: e.attacker, anim: Anim.ThrowPunch }];
      if (!e.hit) cues.push({ id: e.target, anim: Anim.Dodge });
      else if (e.damage > 0) cues.push({ id: e.target, anim: Anim.HitFromFront });
      return cues;
    }
    case 'death':
      return [{ id: e.id, anim: e.anim, queue: true }];
    default:
      return [];
  }
}
