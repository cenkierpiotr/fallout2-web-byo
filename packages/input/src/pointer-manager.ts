import { type ActionBus, type Hex, type ScreenPt } from './action-bus.js';
import { GestureRecognizer, DEFAULT_GESTURE_OPTIONS, type Gesture } from './gesture-recognizer.js';
import type { ProfileName } from './input-profile.js';

/** Minimalny kontrakt kamery (IsoCamera.screenToHex); pozycje w CSS px, null = poza mapa. */
export interface HexPicker {
  screenToHex(x: number, y: number): Hex | null;
}

interface PtrEvent {
  pointerId: number;
  pointerType: string;
  button: number;
  clientX: number;
  clientY: number;
  shiftKey: boolean;
  timeStamp: number;
  preventDefault(): void;
}
interface WheelEv extends PtrEvent {
  deltaY: number;
}

const WHEEL_SENSITIVITY = 0.0015;

export class PointerManager {
  private readonly rec = new GestureRecognizer(DEFAULT_GESTURE_OPTIONS);
  private cleanup: (() => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastTwoFingerTap = -Infinity;
  private midPan: number | null = null;
  private readonly touchIds = new Set<number>();

  constructor(
    private readonly el: HTMLElement,
    private readonly bus: ActionBus,
    private profile: ProfileName,
    private readonly cam: HexPicker,
  ) {}

  setProfile(p: ProfileName): void {
    this.profile = p;
  }

  attach(): void {
    this.detach();
    const on = (type: string, fn: (e: never) => void): void => {
      this.el.addEventListener(type, fn as unknown as EventListener);
      prev.push(() => this.el.removeEventListener(type, fn as unknown as EventListener));
    };
    const prev: Array<() => void> = [];
    on('pointerdown', (e: PtrEvent) => this.down(e));
    on('pointermove', (e: PtrEvent) => this.move(e));
    on('pointerup', (e: PtrEvent) => this.up(e));
    on('pointercancel', (e: PtrEvent) => this.cancel(e));
    on('wheel', (e: WheelEv) => this.wheel(e));
    on('contextmenu', (e: PtrEvent) => e.preventDefault());
    this.cleanup = () => {
      for (const f of prev) f();
    };
  }

  detach(): void {
    this.cleanup?.();
    this.cleanup = null;
    this.clearTimer();
    this.touchIds.clear();
    this.midPan = null;
  }

  private allows(type: string): boolean {
    const touch = type === 'touch';
    if (this.profile === 'hybrid') return true;
    return this.profile === 'touch' ? touch : !touch;
  }

  private pos(e: PtrEvent): ScreenPt {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private moveTo(p: ScreenPt, run: boolean): void {
    const hex = this.cam.screenToHex(p.x, p.y);
    if (hex === null) return; // poza mapa: brak akcji, bez wyjatku
    this.bus.emit({ type: 'moveTo', hex, run });
  }

  private down(e: PtrEvent): void {
    if (!this.allows(e.pointerType)) return;
    const p = this.pos(e);
    if (e.pointerType === 'touch') {
      this.touchIds.add(e.pointerId);
      this.rec.feed({ type: 'down', id: e.pointerId, x: p.x, y: p.y, t: e.timeStamp });
      this.armTimer(e.timeStamp);
      return;
    }
    if (e.button === 0) this.moveTo(p, e.shiftKey);
    else if (e.button === 2) this.bus.emit({ type: 'contextMenu', screen: p });
    else if (e.button === 1) {
      e.preventDefault();
      this.midPan = e.pointerId;
      this.lastMouse = p;
    }
  }

  private lastMouse: ScreenPt = { x: 0, y: 0 };

  private move(e: PtrEvent): void {
    if (e.pointerType === 'touch') {
      if (!this.touchIds.has(e.pointerId)) return;
      const p = this.pos(e);
      this.handle(this.rec.feed({ type: 'move', id: e.pointerId, x: p.x, y: p.y, t: e.timeStamp }));
      return;
    }
    if (this.midPan === e.pointerId) {
      const p = this.pos(e);
      this.bus.emit({ type: 'pan', dx: p.x - this.lastMouse.x, dy: p.y - this.lastMouse.y });
      this.lastMouse = p;
    }
  }

  private up(e: PtrEvent): void {
    if (e.pointerType === 'touch') {
      if (!this.touchIds.delete(e.pointerId)) return;
      const p = this.pos(e);
      this.handle(
        this.rec.feed({ type: 'up', id: e.pointerId, x: p.x, y: p.y, t: e.timeStamp }),
        e.timeStamp,
      );
      if (this.touchIds.size === 0) this.clearTimer();
      return;
    }
    if (this.midPan === e.pointerId) this.midPan = null;
  }

  private cancel(e: PtrEvent): void {
    if (e.pointerType === 'touch' && this.touchIds.delete(e.pointerId)) {
      this.rec.feed({ type: 'cancel', id: e.pointerId, x: 0, y: 0, t: e.timeStamp });
      if (this.touchIds.size === 0) this.clearTimer();
    }
    if (this.midPan === e.pointerId) this.midPan = null;
  }

  private wheel(e: WheelEv): void {
    if (!this.allows('mouse')) return;
    e.preventDefault();
    this.bus.emit({
      type: 'zoom',
      factor: Math.exp(-e.deltaY * WHEEL_SENSITIVITY),
      at: this.pos(e),
    });
  }

  private armTimer(t: number): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      // Zablokowany glowny watek (ciezka klatka): zdarzenie `up` moze juz czekac w kolejce, a timer
      // dojrzal pierwszy. Wtedy nie wolno uznac krotkiego stuku za dlugi dotyk: odczekaj na kolejke.
      if (this.inputPending()) {
        this.armRecheck(t);
        return;
      }
      this.handle(this.rec.poll(t + DEFAULT_GESTURE_OPTIONS.longPressMs));
    }, DEFAULT_GESTURE_OPTIONS.longPressMs);
  }

  private armRecheck(t: number): void {
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.inputPending()) {
        this.armRecheck(t);
        return;
      }
      this.handle(this.rec.poll(t + DEFAULT_GESTURE_OPTIONS.longPressMs));
    }, 0);
  }

  /** Chromium: `navigator.scheduling.isInputPending()`; gdzie brak API, zachowanie bez zmian. */
  private inputPending(): boolean {
    const nav = (typeof navigator === 'undefined' ? undefined : navigator) as
      { scheduling?: { isInputPending?: () => boolean } } | undefined;
    return nav?.scheduling?.isInputPending?.() ?? false;
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private handle(g: Gesture | null, t = 0): void {
    if (!g) return;
    const at = { x: g.x, y: g.y };
    switch (g.kind) {
      case 'tap':
        this.moveTo(at, true);
        break;
      case 'longPress':
        this.bus.emit({ type: 'contextMenu', screen: at });
        break;
      case 'holdDrag':
        this.bus.emit({ type: 'walkDrag', screen: at, phase: 'move' });
        break;
      case 'holdDragEnd':
        this.bus.emit({ type: 'walkDrag', screen: at, phase: 'end' });
        break;
      case 'doubleTap':
        this.bus.emit({ type: 'look', screen: at });
        break;
      case 'pan':
        this.bus.emit({ type: 'pan', dx: g.dx ?? 0, dy: g.dy ?? 0 });
        break;
      case 'pinch':
        if (g.dx || g.dy) this.bus.emit({ type: 'pan', dx: g.dx ?? 0, dy: g.dy ?? 0 });
        if (g.scale !== undefined && g.scale !== 1)
          this.bus.emit({ type: 'zoom', factor: g.scale, at });
        break;
      case 'twoFingerTap':
        // podwojne stukniecie dwoma palcami = zoomReset
        if (t - this.lastTwoFingerTap <= DEFAULT_GESTURE_OPTIONS.doubleTapMs) {
          this.bus.emit({ type: 'zoomReset' });
          this.lastTwoFingerTap = -Infinity;
        } else this.lastTwoFingerTap = t;
        break;
      case 'threeFingerTap':
        this.bus.emit({ type: 'pause' });
        break;
    }
  }
}
