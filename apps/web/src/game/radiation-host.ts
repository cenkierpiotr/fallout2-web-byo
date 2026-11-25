import type { EventQueue, GameEvent } from '@f2/engine-core';
import { pendingRadiationLevel } from '@f2/engine-core';
import {
  createRng,
  defaultRulesContext,
  handleRadiationEvent,
  radiationMidnightCheck,
  type CritterData,
  type PendingRadiationEvent,
  type RadiationEvent,
} from '@f2/rules';
import type { MidnightHost } from './midnight-host';

/**
 * Promieniowanie w sesji (0x42d4f4 test o polnocy, 0x42d740 zdarzenie typu 6; dokumentacja techniczna, vitals.md).
 * `rng.seed` jest aktualizowany (wspolny RNG sesji, jak w chemii).
 */
export interface RadiationEnv {
  critter: CritterData;
  queue: EventQueue;
  rng: { seed: number };
  ticks: number;
  playerId: number;
  onEvent?: MidnightHost['radiationEvent'];
}

function rulesCtx(env: RadiationEnv) {
  const rng = createRng(env.rng.seed);
  const ctx = defaultRulesContext();
  ctx.rng = rng;
  ctx.clock = { ticks: env.ticks };
  return { ctx, done: () => void (env.rng.seed = rng.state() & 0x7fffffff) };
}

/**
 * Test o polnocy: gdy `flagWas`, rzut Endurance; nowe zdarzenie typu 6 (faza 0) tylko gdy nowy poziom jest
 * wiekszy od poziomu oczekujacego w kolejce (`pendingRadiationLevel`). Zerowanie flagi robi hook polnocy.
 */
export function radiationMidnight(env: RadiationEnv, flagWas: boolean): void {
  if (!flagWas) return;
  const { ctx, done } = rulesCtx(env);
  const r = radiationMidnightCheck(env.critter, flagWas, pendingRadiationLevel(env.queue), ctx);
  done();
  if (!r.schedule) return;
  env.queue.add({
    atTick: env.ticks + r.schedule.delayTicks,
    kind: 'radiation',
    objId: env.playerId,
    payload: { level: r.schedule.level, phase: r.schedule.phase },
  });
}

const isRadPayload = (p: unknown): p is RadiationEvent =>
  typeof p === 'object' &&
  p !== null &&
  typeof (p as RadiationEvent).level === 'number' &&
  ((p as RadiationEvent).phase === 0 || (p as RadiationEvent).phase === 1);

/** Handler zdarzenia 'radiation' kolejki (zdarzenie jest juz zdjete z kolejki); inne: 0. */
export function handleRadiationQueueEvent(env: RadiationEnv, e: GameEvent): number {
  if (e.kind !== 'radiation' || !isRadPayload(e.payload)) return 0;
  const ev = e.payload;
  const pending: PendingRadiationEvent[] = env.queue
    .peek((x) => x.kind === 'radiation' && isRadPayload(x.payload))
    .map((x) => {
      const p = x.payload as RadiationEvent;
      return { level: p.level, phase: p.phase, atTick: x.atTick };
    });
  const res = handleRadiationEvent(env.critter, ev, env.ticks, pending);
  for (const p of res.remove) {
    env.queue.removeWhere(
      (x) =>
        x.kind === 'radiation' &&
        isRadPayload(x.payload) &&
        x.atTick === p.atTick &&
        x.payload.level === p.level &&
        x.payload.phase === p.phase,
    );
  }
  if (res.schedule) {
    env.queue.add({
      atTick: res.schedule.atTick,
      kind: 'radiation',
      objId: e.objId,
      payload: { level: res.schedule.level, phase: res.schedule.phase },
    });
  }
  env.onEvent?.({
    level: ev.level,
    messages: res.messages,
    interrupt: res.interrupt,
    dead: res.dead,
  });
  return 0;
}
