import {
  activatedExplosivePid,
  explosiveDamageRange,
  explosiveFuse,
  isExplosivePid,
} from '@f2/rules';
import type { EventQueue, GameEvent } from './event-queue.js';
import type { ScriptRuntime } from './script-runtime.js';

/** Wejscie ustawienia ladunku (dynamit/plastik), wartosci z hosta (UI: ekwipunek -> uzyj -> czas). */
export interface PlantExplosiveInput {
  /** Gracz ustawiajacy ladunek (przedmiot musi byc w jego ekwipunku albo lezec na ziemi). */
  playerId: number;
  itemId: number;
  /** Czas z dialogu "ustaw czas" w sekundach (zakres dialogu = Z). */
  seconds: number;
  /** Wynik rzutu Traps: 0 krytyczna porazka, 1 porazka, 2/3 sukces (ignorowany z Demolition Expert). */
  rollResult: number;
  demolitionExpert: boolean;
  nowTick: number;
}

export type PlantResult =
  | { ok: false; reason: 'notExplosive' | 'alreadyArmed' | 'missing' }
  | { ok: true; kind: 'explosion' | 'misfire'; atTick: number };

/** Uzycie ladunku (0x49bcb4, D): zmiana pid 0x33->0xce / 0x55->0xd1 i zdarzenie typu 8 (wybuch) albo 11 (misfire). */
export function plantExplosive(
  rt: ScriptRuntime,
  queue: EventQueue,
  inp: PlantExplosiveInput,
): PlantResult {
  const it = rt.getObject(inp.itemId);
  if (!it || !rt.getObject(inp.playerId)) return { ok: false, reason: 'missing' };
  if (!isExplosivePid(it.pid)) return { ok: false, reason: 'notExplosive' };
  if (activatedExplosivePid(it.pid) === it.pid) return { ok: false, reason: 'alreadyArmed' };
  it.pid = activatedExplosivePid(it.pid);
  const fuse = explosiveFuse(inp.seconds, inp.rollResult, inp.demolitionExpert);
  const atTick = inp.nowTick + fuse.delayTicks;
  queue.add({
    atTick,
    kind: fuse.kind,
    objId: it.id,
    payload: { demolitionExpert: inp.demolitionExpert },
  });
  return { ok: true, kind: fuse.kind, atTick };
}

/**
 * Handler zdarzen typu 8 (0x4a2828) i 11 (0x4a28e4) kolejki, wspolny kod 0x4a2834 (D). Pozycja = wlasciciel
 * przedmiotu (jesli jest) albo sam przedmiot; po wybuchu przedmiot jest niszczony. Zwraca 0 (kontynuuj).
 * Ponowne kolejkowanie za 50 tickow przy zajetej animacji (wynik -2 z 0x412cf4) obsluguje host (`busy`).
 */
export function handleExplosiveEvent(
  rt: ScriptRuntime,
  queue: EventQueue,
  e: GameEvent,
  nowTick: number,
  busy: () => boolean = () => false,
): number {
  if (e.kind !== 'explosion' && e.kind !== 'misfire') return 0;
  const it = rt.getObject(e.objId);
  if (!it) return 0;
  if (busy()) {
    queue.add({ ...e, atTick: nowTick + 50 });
    return 0;
  }
  const owner = rt.ownerOfItem(it);
  const at = owner ?? it;
  const range = explosiveDamageRange(
    it.pid,
    !!(e.payload as { demolitionExpert?: boolean } | null)?.demolitionExpert,
  );
  if (range) {
    const dmg = rt.random(range.min, range.max);
    rt.blastCritters(at.hex, at.elevation, dmg);
  }
  if (owner) rt.inventory.rmObjFromInven(owner.id, it.id);
  rt.destroyObject(it.id);
  return 0;
}
