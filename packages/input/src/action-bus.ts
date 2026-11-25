/** Numer kafla (hex) na siatce mapy; konkretny typ dostarcza engine-core. */
export type Hex = number;
export interface ScreenPt {
  x: number;
  y: number;
}

export type Action =
  | { type: 'moveTo'; hex: Hex; run: boolean }
  | { type: 'interact'; screen: ScreenPt }
  | { type: 'look'; screen: ScreenPt }
  | { type: 'contextMenu'; screen: ScreenPt }
  | { type: 'walkDrag'; screen: ScreenPt; phase: 'move' | 'end' }
  | { type: 'pan'; dx: number; dy: number }
  | { type: 'zoom'; factor: number; at: ScreenPt }
  | { type: 'zoomReset' }
  | { type: 'elevation'; delta: -1 | 1 }
  | { type: 'toggleRun' }
  | { type: 'pause' };

export type ActionType = Action['type'];

export class ActionBus {
  private readonly subs = new Set<(a: Action) => void>();

  on(fn: (a: Action) => void): () => void {
    this.subs.add(fn);
    return () => {
      this.subs.delete(fn);
    };
  }

  emit(a: Action): void {
    for (const fn of [...this.subs]) fn(a);
  }
}
