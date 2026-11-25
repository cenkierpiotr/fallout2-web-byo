import type { EventQueue, GameEvent } from './event-queue.js';

/**
 * Efekt czasowy w ksztalcie zgodnym strukturalnie z `TimedEffect` z @f2/rules
 * (engine-core nie zalezy od packages/rules; wiaze je typowanie strukturalne).
 */
export interface TimedEffectData {
  seq: number;
  targetId: number;
  atTick: number;
  kind: 'drug-stage' | 'withdrawal' | 'withdrawal-end';
  deltas: { stat: number; amount: number }[];
  drugPid: number;
  useId: number;
  addictionIndex: number;
  withdrawalEffect: number;
}

export type TimedEffectDataInput = Omit<TimedEffectData, 'seq'>;

const KIND_TO_EVENT = {
  'drug-stage': 'drug-revert',
  withdrawal: 'withdrawal',
  'withdrawal-end': 'withdrawal-end',
} as const;

function isTimedEvent(e: GameEvent): boolean {
  return e.kind === 'drug-revert' || e.kind === 'withdrawal' || e.kind === 'withdrawal-end';
}

function copy(e: TimedEffectData): TimedEffectData {
  return { ...e, deltas: e.deltas.map((d) => ({ ...d })) };
}

/**
 * Adapter: implementuje port `TimedEffectPort` (rules) nad wspolna `EventQueue` (time.md).
 * Efekty to zdarzenia `drug-revert` (etap leku), `withdrawal` (odstawienie) i `withdrawal-end` (koniec odstawienia, typ 0); payload = pelny
 * `TimedEffectData`, wiec zapis kolejki (`EventQueue.serialize`) zachowuje je 1:1.
 */
export class EventQueueEffectPort {
  private nextSeq = 1;
  private nextUse = 1;

  constructor(private readonly queue: EventQueue) {
    this.resyncCounters();
  }

  /** Przelicza liczniki seq/useId z kolejki (po wczytaniu zapisu). */
  resyncCounters(): void {
    for (const e of this.queue.peek(isTimedEvent)) {
      const d = e.payload as TimedEffectData;
      this.nextSeq = Math.max(this.nextSeq, d.seq + 1);
      this.nextUse = Math.max(this.nextUse, d.useId + 1);
    }
  }

  schedule(e: TimedEffectDataInput): TimedEffectData {
    const full: TimedEffectData = { ...copy({ ...e, seq: 0 }), seq: this.nextSeq++ };
    this.queue.add({
      atTick: full.atTick,
      kind: KIND_TO_EVENT[full.kind],
      objId: full.targetId,
      payload: full,
    });
    return full;
  }

  newUseId(): number {
    return this.nextUse++;
  }

  pending(): readonly TimedEffectData[] {
    return this.queue.peek(isTimedEvent).map((e) => copy(e.payload as TimedEffectData));
  }

  cancel(pred: (e: TimedEffectData) => boolean): number {
    return this.queue.removeWhere((e) => isTimedEvent(e) && pred(e.payload as TimedEffectData));
  }

  /**
   * Obsluga zdarzenia z kolejki: dla zdarzen efektow wola `apply`, dla innych zwraca `undefined`
   * (wolajacy obsluguje je dalej). Wynik `apply` (0 = kontynuuj) idzie do `processUntil`.
   */
  handle(e: GameEvent, apply: (fx: TimedEffectData) => number | void): number | undefined {
    if (!isTimedEvent(e)) return undefined;
    return apply(copy(e.payload as TimedEffectData)) ?? 0;
  }
}

/**
 * Po wczytaniu zapisu (`deserializeWorld`) kolejka jest nowa instancja; stary adapter trzyma
 * nieaktualna. Zwraca swiezy adapter nad `queue` z przeliczonymi licznikami seq/useId.
 */
export function rebindEffectPort(queue: EventQueue): EventQueueEffectPort {
  return new EventQueueEffectPort(queue);
}
