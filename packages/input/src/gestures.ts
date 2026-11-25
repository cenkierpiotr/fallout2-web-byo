export interface GestureHandlers {
  onTap?(x: number, y: number): void;
  onPan?(dx: number, dy: number): void;
  onPinch?(scale: number, cx: number, cy: number): void;
  onPanEnd?(): void;
}

interface Pt {
  x: number;
  y: number;
}

export class GestureRecognizer {
  private readonly pts = new Map<number, Pt>();
  private start: Pt | null = null;
  private last: Pt | null = null;
  private panning = false;
  private multi = false;

  constructor(
    private readonly h: GestureHandlers,
    private readonly tapThresholdPx = 12,
  ) {}

  down(id: number, x: number, y: number, t = 0): void {
    void t;
    this.pts.set(id, { x, y });
    if (this.pts.size === 1) {
      this.start = { x, y };
      this.last = { x, y };
      this.panning = false;
      this.multi = false;
    } else {
      this.multi = true;
      this.endPan();
    }
  }

  move(id: number, x: number, y: number, t = 0): void {
    void t;
    const p = this.pts.get(id);
    if (!p) return;
    if (this.pts.size >= 2) {
      const [a, b] = [...this.pts.values()] as [Pt, Pt];
      const prev = Math.hypot(a.x - b.x, a.y - b.y);
      p.x = x;
      p.y = y;
      const cur = Math.hypot(a.x - b.x, a.y - b.y);
      if (prev > 0 && cur > 0) this.h.onPinch?.(cur / prev, (a.x + b.x) / 2, (a.y + b.y) / 2);
      return;
    }
    p.x = x;
    p.y = y;
    if (this.multi || !this.start || !this.last) return;
    if (!this.panning) {
      if (Math.hypot(x - this.start.x, y - this.start.y) < this.tapThresholdPx) return;
      this.panning = true;
    }
    this.h.onPan?.(x - this.last.x, y - this.last.y);
    this.last = { x, y };
  }

  up(id: number, x: number, y: number, t = 0): void {
    void t;
    if (!this.pts.delete(id)) return;
    if (this.multi) {
      if (this.pts.size === 0) this.multi = false;
      return;
    }
    if (this.panning) this.endPan();
    else if (this.start && Math.hypot(x - this.start.x, y - this.start.y) < this.tapThresholdPx) {
      this.h.onTap?.(x, y);
    }
    this.start = this.last = null;
  }

  cancel(id: number): void {
    this.pts.delete(id);
    this.endPan();
    if (this.pts.size === 0) {
      this.multi = false;
      this.start = this.last = null;
    }
  }

  private endPan(): void {
    if (this.panning) {
      this.panning = false;
      this.h.onPanEnd?.();
    }
  }
}
