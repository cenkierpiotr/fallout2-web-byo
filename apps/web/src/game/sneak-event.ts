import type { GameEvent } from '@f2/engine-core';
import { sneakCheck, type SkillObject, type SkillUseContext } from '@f2/rules';
import type { PlayerSheet } from './save-world';
import type { EventQueue } from '@f2/engine-core';

/**
 * Zdarzenie okresowe skradania 0x42e32c (time.md typ 10, D): rzut skilla 8 gracza (sukces >= 2) zapisuje wynik
 * w [0x56d77c] (`sheet.sneakRollOk`) i kolejkuje sie ponownie (600/120/100 tickow wg progow skilla).
 * Wlaczenie skradania ustawia flage (`sheet.sneaking`) i kolejkuje pierwsze zdarzenie; wylaczenie czysci kolejke.
 */
export interface SneakEnv {
  sheet: PlayerSheet;
  queue: EventQueue;
  ticks(): number;
  ctx(): SkillUseContext;
  user(): SkillObject;
}

export function startSneak(env: SneakEnv): void {
  env.sheet.sneaking = true;
  env.queue.removeByKind('sneak');
  env.queue.add({ atTick: env.ticks(), kind: 'sneak', objId: 0, payload: null });
}

export function stopSneak(env: SneakEnv): void {
  env.sheet.sneaking = false;
  env.sheet.sneakRollOk = false;
  env.queue.removeByKind('sneak');
}

/** Zwraca undefined dla zdarzen obcych. Po wylaczeniu skradania zdarzenie wygasa bez ponownego kolejkowania. */
export function handleSneakEvent(env: SneakEnv, e: GameEvent): number | undefined {
  if (e.kind !== 'sneak') return undefined;
  if (!env.sheet.sneaking) return 0;
  const r = sneakCheck(env.user(), env.ctx());
  env.sheet.sneakRollOk = r.ok;
  env.queue.add({ atTick: e.atTick + r.nextCheckTicks, kind: 'sneak', objId: 0, payload: null });
  return 0;
}
