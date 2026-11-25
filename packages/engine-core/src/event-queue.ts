/** Kolejka zdarzen gry (dokumentacja techniczna): posortowana po czasie, FIFO dla rownych czasow. */
export type GameEventKind =
  | 'drug-revert'
  | 'withdrawal'
  /** typ 0 (0x47a558): koniec odstawienia */
  | 'withdrawal-end'
  | 'script-timer'
  | 'skill-daily-reset'
  | 'knockout'
  | 'poison'
  | 'radiation'
  | 'map-update'
  | 'ambient-sfx'
  /** typ 4 (D): polnoc / dzienne */
  | 'midnight'
  /** typy 7-11 (W, nazwy wnioskowane z adresow handlerow) */
  | 'flare'
  | 'explosion'
  | 'item-trickle'
  | 'sneak'
  | 'misfire';

export interface GameEvent {
  atTick: number;
  kind: GameEventKind;
  objId: number;
  payload: unknown;
}
export type GameEventJSON = GameEvent;

/** Gleboka kopia (payload jest danymi zapisywalnymi; funkcji/klas nie obslugujemy). */
function cloneEvent(e: GameEvent): GameEvent {
  return { ...e, payload: structuredClone(e.payload) };
}

/** Zwraca 0 aby kontynuowac; niezerowa wartosc przerywa przetwarzanie. */
export type EventHandler = (e: GameEvent) => number;

export class EventQueue {
  private items: GameEvent[] = [];

  get size(): number {
    return this.items.length;
  }

  add(e: GameEvent): void {
    if (!Number.isFinite(e.atTick))
      throw new RangeError(`EventQueue.add: nieprawidlowy atTick ${e.atTick}`);
    // wstawia za ostatnim zdarzeniem o czasie <= e.atTick (FIFO)
    let i = this.items.length;
    while (i > 0 && this.items[i - 1]!.atTick > e.atTick) i--;
    this.items.splice(i, 0, cloneEvent(e));
  }

  nextTime(): number | null {
    return this.items.length ? this.items[0]!.atTick : null;
  }

  /**
   * Przetwarza zdarzenia z atTick <= ticks; zdarzenie jest zdejmowane przed wywolaniem handlera.
   * Gdy handler rzuci wyjatek, zdarzenie wraca do kolejki (przed rownymi czasami) i wyjatek leci dalej.
   */
  processUntil(ticks: number, handler: EventHandler): number {
    while (this.items.length && this.items[0]!.atTick <= ticks) {
      const e = this.items.shift()!;
      let r: number;
      try {
        r = handler(cloneEvent(e));
      } catch (err) {
        let i = 0;
        while (i < this.items.length && this.items[i]!.atTick < e.atTick) i++;
        this.items.splice(i, 0, e);
        throw err;
      }
      if (r !== 0) return r;
    }
    return 0;
  }

  removeByKind(kind: GameEventKind): void {
    this.items = this.items.filter((e) => e.kind !== kind);
  }

  /** Kopie oczekujacych zdarzen spelniajacych warunek (kolejnosc wykonania). */
  peek(pred: (e: GameEvent) => boolean = () => true): GameEvent[] {
    return this.items.filter(pred).map(cloneEvent);
  }

  /** Usuwa zdarzenia spelniajace warunek; zwraca ich liczbe. */
  removeWhere(pred: (e: GameEvent) => boolean): number {
    const before = this.items.length;
    this.items = this.items.filter((e) => !pred(e));
    return before - this.items.length;
  }

  serialize(): GameEventJSON[] {
    return this.items.map(cloneEvent);
  }

  static restore(json: GameEventJSON[]): EventQueue {
    const q = new EventQueue();
    for (const e of json) q.add(e);
    return q;
  }
}
