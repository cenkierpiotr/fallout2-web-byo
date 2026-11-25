/** Czysty rozpoznawacz gestow (bez DOM): zdarzenia wskaznikow z czasem -> Gesture. */
export interface GestureOptions {
  tapSlopPx: number;
  longPressMs: number;
  doubleTapMs: number;
}

export const DEFAULT_GESTURE_OPTIONS: GestureOptions = {
  tapSlopPx: 12,
  longPressMs: 350,
  doubleTapMs: 300,
};

export interface PointerEv {
  type: 'down' | 'move' | 'up' | 'cancel';
  id: number;
  x: number;
  y: number;
  t: number;
}

export type GestureKind =
  | 'tap'
  | 'doubleTap'
  | 'longPress'
  | 'holdDrag'
  | 'holdDragEnd'
  | 'pan'
  | 'pinch'
  | 'twoFingerTap'
  | 'threeFingerTap';

export interface Gesture {
  kind: GestureKind;
  x: number;
  y: number;
  dx?: number;
  dy?: number;
  scale?: number;
}

interface Track {
  sx: number;
  sy: number;
  x: number;
  y: number;
}

export class GestureRecognizer {
  private readonly pts = new Map<number, Track>();
  private downT = 0;
  private maxPts = 0;
  private moved = false;
  private panning = false;
  /** Po long press palec nadal przytrzymany i przesuniety poza prog: marsz za palcem. */
  private holding = false;
  private fired = false;
  private panX = 0;
  private panY = 0;
  private lastTap: { x: number; y: number; t: number } | null = null;
  private readonly o: GestureOptions;

  constructor(opts: GestureOptions = DEFAULT_GESTURE_OPTIONS) {
    this.o = opts;
  }

  feed(ev: PointerEv): Gesture | null {
    switch (ev.type) {
      case 'down':
        return this.onDown(ev);
      case 'move':
        return this.onMove(ev);
      case 'up':
        return this.onUp(ev);
      default:
        this.pts.delete(ev.id);
        if (this.pts.size === 0) this.reset();
        return null;
    }
  }

  /** Wywolywane z timera podczas przytrzymania: zwraca longPress, gdy minal prog. */
  poll(t: number): Gesture | null {
    if (this.pts.size !== 1 || this.maxPts !== 1 || this.moved || this.fired) return null;
    if (t - this.downT < this.o.longPressMs) return null;
    const p = [...this.pts.values()][0];
    if (!p) return null;
    this.fired = true;
    return { kind: 'longPress', x: p.x, y: p.y };
  }

  private reset(): void {
    this.maxPts = 0;
    this.moved = false;
    this.panning = false;
    this.holding = false;
    this.fired = false;
  }

  private onDown(ev: PointerEv): Gesture | null {
    if (this.pts.size === 0) {
      this.reset();
      this.downT = ev.t;
    }
    this.pts.set(ev.id, { sx: ev.x, sy: ev.y, x: ev.x, y: ev.y });
    this.maxPts = Math.max(this.maxPts, this.pts.size);
    if (this.pts.size === 1) {
      this.panX = ev.x;
      this.panY = ev.y;
    } else {
      this.panning = false;
    }
    return null;
  }

  private centroid(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    for (const p of this.pts.values()) {
      x += p.x;
      y += p.y;
    }
    const n = this.pts.size || 1;
    return { x: x / n, y: y / n };
  }

  private spread(): number {
    const [a, b] = [...this.pts.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  private onMove(ev: PointerEv): Gesture | null {
    const p = this.pts.get(ev.id);
    if (!p) return null;
    if (this.pts.size === 1 && this.maxPts === 1) {
      p.x = ev.x;
      p.y = ev.y;
      if (this.fired) {
        // long press juz odpalil (menu otwarte): przeciagniecie = long-press-drag (marsz)
        if (!this.holding) {
          if (Math.hypot(ev.x - p.sx, ev.y - p.sy) < this.o.tapSlopPx) return null;
          this.holding = true;
          this.moved = true;
        }
        return { kind: 'holdDrag', x: ev.x, y: ev.y };
      }
      if (!this.panning) {
        if (Math.hypot(ev.x - p.sx, ev.y - p.sy) < this.o.tapSlopPx) return null;
        this.panning = true;
        this.moved = true;
      }
      const g: Gesture = {
        kind: 'pan',
        x: ev.x,
        y: ev.y,
        dx: ev.x - this.panX,
        dy: ev.y - this.panY,
      };
      this.panX = ev.x;
      this.panY = ev.y;
      return g;
    }
    if (this.pts.size === 2) {
      const before = this.centroid();
      const d0 = this.spread();
      p.x = ev.x;
      p.y = ev.y;
      const after = this.centroid();
      const d1 = this.spread();
      if (Math.hypot(ev.x - p.sx, ev.y - p.sy) >= this.o.tapSlopPx) this.moved = true;
      if (!this.moved || d0 <= 0 || d1 <= 0) return null;
      return {
        kind: 'pinch',
        x: after.x,
        y: after.y,
        dx: after.x - before.x,
        dy: after.y - before.y,
        scale: d1 / d0,
      };
    }
    p.x = ev.x;
    p.y = ev.y;
    if (Math.hypot(ev.x - p.sx, ev.y - p.sy) >= this.o.tapSlopPx) this.moved = true;
    return null;
  }

  private onUp(ev: PointerEv): Gesture | null {
    const p = this.pts.get(ev.id);
    if (!p) return null;
    const dur = ev.t - this.downT;
    const quick = dur < this.o.longPressMs && !this.moved && !this.fired;
    const wasMax = this.maxPts;
    const sizeBefore = this.pts.size;
    const c = this.centroid();
    this.pts.delete(ev.id);
    let out: Gesture | null = null;

    if (wasMax === 1) {
      if (this.holding) {
        out = { kind: 'holdDragEnd', x: ev.x, y: ev.y };
      } else if (this.fired || this.panning) {
        out = null;
      } else if (Math.hypot(ev.x - p.sx, ev.y - p.sy) < this.o.tapSlopPx) {
        if (dur >= this.o.longPressMs) {
          out = { kind: 'longPress', x: ev.x, y: ev.y };
          this.lastTap = null;
        } else {
          const lt = this.lastTap;
          if (
            lt &&
            ev.t - lt.t <= this.o.doubleTapMs &&
            Math.hypot(ev.x - lt.x, ev.y - lt.y) < this.o.tapSlopPx * 2
          ) {
            out = { kind: 'doubleTap', x: ev.x, y: ev.y };
            this.lastTap = null;
          } else {
            out = { kind: 'tap', x: ev.x, y: ev.y };
            this.lastTap = { x: ev.x, y: ev.y, t: ev.t };
          }
        }
      }
    } else if (sizeBefore === wasMax && quick && wasMax === 2) {
      out = { kind: 'twoFingerTap', x: c.x, y: c.y };
    } else if (sizeBefore === wasMax && quick && wasMax === 3) {
      out = { kind: 'threeFingerTap', x: c.x, y: c.y };
    }
    if (out && wasMax > 1) this.fired = true;
    if (this.pts.size === 0) this.reset();
    return out;
  }
}
