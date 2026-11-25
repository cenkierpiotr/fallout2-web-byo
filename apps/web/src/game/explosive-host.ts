import { signal } from '@preact/signals';
import { DEMOLITION_EXPERT_PERK, TRAPS_SKILL, DYNAMITE_PID, PLASTIC_PID } from '@f2/rules';
import {
  handleExplosiveEvent,
  plantExplosive,
  type GameEvent,
  type GameObject,
  type PlantResult,
} from '@f2/engine-core';
import type { GameSession } from './game-session';

/**
 * Zakres czasu zapalnika w dialogu (sekundy). Z: dokumentacja techniczna podaje tylko, ze czas
 * pochodzi z dialogu 0x477074 i ze 10 tickow = 1 s; sam zakres dialogu nie jest ustalony,
 * przyjeto 1..180 s, domyslnie 10 s.
 */
export const FUSE_MIN_SECONDS = 1;
export const FUSE_MAX_SECONDS = 180;
export const FUSE_DEFAULT_SECONDS = 10;

export function clampFuseSeconds(n: number): number {
  if (!Number.isFinite(n)) return FUSE_DEFAULT_SECONDS;
  return Math.min(FUSE_MAX_SECONDS, Math.max(FUSE_MIN_SECONDS, Math.round(n)));
}

/** Nieustawiony ladunek (dynamit 0x33 / plastik 0x55), czyli taki, ktory pokazuje dialog czasu. */
export function isUnarmedExplosive(o: GameObject): boolean {
  return o.pid === DYNAMITE_PID || o.pid === PLASTIC_PID;
}

/** Zapytanie o czas zapalnika, pokazywane przez `ExplosiveTimerDialog`. */
export interface FusePrompt {
  itemId: number;
  onConfirm(seconds: number): void;
}
export const fusePrompt = signal<FusePrompt | null>(null);

/**
 * Widok runtime'u skryptow, w ktorym przedmioty z ekwipunku gracza tez sa "znane" (rt.objects zawiera
 * tylko obiekty mapy). Prototypowe dziedziczenie zachowuje reszte metod runtime'u.
 */
function withInventory(session: GameSession): NonNullable<GameSession['world']['scripts']> | null {
  const rt = session.world.scripts;
  if (!rt) return null;
  const player = session.world.player;
  return Object.create(rt, {
    getObject: {
      value: (id: number) => rt.getObject(id) ?? player.inventory.find((o) => o.id === id),
    },
  });
}

/** Ustawia ladunek: rzut Traps, zmiana pid i zdarzenie w kolejce sesji. */
export function plantFromHost(session: GameSession, itemId: number, seconds: number): PlantResult {
  const rt = withInventory(session);
  if (!rt) return { ok: false, reason: 'missing' };
  const player = session.world.player;
  const demolitionExpert = (session.state.sheet.perks[DEMOLITION_EXPERT_PERK] ?? 0) > 0;
  const rollResult = demolitionExpert ? 3 : rt.rollVsSkill(player.id, TRAPS_SKILL, 0).degree;
  return plantExplosive(rt, session.state.queue, {
    playerId: player.id,
    itemId,
    seconds: clampFuseSeconds(seconds),
    rollResult,
    demolitionExpert,
    nowTick: session.world.clock.ticks,
  });
}

/**
 * Handler zdarzen wybuchu/niewypalu dla kolejki sesji. Zwraca undefined dla zdarzen obcych.
 * Po wybuchu przedmiot znika tez z tablicy ekwipunku wlasciciela (runtime zna tylko obiekty mapy).
 */
export function handleExplosionQueueEvent(
  session: GameSession,
  e: GameEvent,
  busy: () => boolean = () => false,
): number | undefined {
  if (e.kind !== 'explosion' && e.kind !== 'misfire') return undefined;
  const rt = withInventory(session);
  if (!rt) return 0;
  const item = rt.getObject(e.objId);
  const owner = item ? rt.ownerOfItem(item) : undefined;
  const isBusy = busy();
  const r = handleExplosiveEvent(
    rt,
    session.state.queue,
    e,
    session.world.clock.ticks,
    () => isBusy,
  );
  if (item && owner && !isBusy) {
    const i = owner.inventory.indexOf(item);
    if (i >= 0) owner.inventory.splice(i, 1);
  }
  return r;
}
