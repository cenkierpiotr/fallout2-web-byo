/** Tekst unoszacy sie nad obiektem (float_msg). `expiresAtTick` w tickach GameClock. */
export interface FloatingText {
  objId: number;
  text: string;
  color: number;
  expiresAtTick: number;
}

/** Domyslny czas wyswietlania: 5 s gry (Z: oryginal zalezy od dlugosci tekstu). */
export const DEFAULT_FLOAT_TICKS = 50;

/** Kolekcja tekstow; jeden tekst na obiekt (nowy zastepuje poprzedni). */
export class FloatingTexts {
  private items: FloatingText[] = [];

  add(
    objId: number,
    text: string,
    color: number,
    nowTick: number,
    duration = DEFAULT_FLOAT_TICKS,
  ): FloatingText {
    const item: FloatingText = { objId, text, color, expiresAtTick: nowTick + duration };
    this.items = this.items.filter((t) => t.objId !== objId);
    this.items.push(item);
    return item;
  }

  /** Usuwa wygasle; zwraca true gdy lista sie zmienila. */
  prune(nowTick: number): boolean {
    const next = this.items.filter((t) => t.expiresAtTick > nowTick);
    const changed = next.length !== this.items.length;
    this.items = next;
    return changed;
  }

  clear(): void {
    this.items = [];
  }

  list(): FloatingText[] {
    return [...this.items];
  }
}
