import { type Action, type ActionBus, type ActionType, type ScreenPt } from './action-bus.js';

const PAN_STEP_PX = 48;
const ZOOM_STEP = 1.1;

export const DEFAULT_BINDINGS: Record<string, ActionType> = {
  w: 'pan',
  a: 'pan',
  s: 'pan',
  d: 'pan',
  arrowup: 'pan',
  arrowdown: 'pan',
  arrowleft: 'pan',
  arrowright: 'pan',
  '+': 'zoom',
  '=': 'zoom',
  '-': 'zoom',
  '0': 'zoomReset',
  pageup: 'elevation',
  pagedown: 'elevation',
  r: 'toggleRun',
  escape: 'pause',
};

/** Kierunek przesuniecia kamery: klawisz "w" przesuwa widok w gore itd. */
const PAN_VEC: Record<string, [number, number]> = {
  w: [0, -1],
  s: [0, 1],
  a: [-1, 0],
  d: [1, 0],
  arrowup: [0, -1],
  arrowdown: [0, 1],
  arrowleft: [-1, 0],
  arrowright: [1, 0],
};

export interface KeyLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  preventDefault?: () => void;
}

export class KeyboardMap {
  bindings: Record<string, ActionType> = { ...DEFAULT_BINDINGS };
  /** True, gdy Shift jest wcisniety (modyfikator biegu). */
  runModifier = false;
  private detach: (() => void) | null = null;

  constructor(
    private readonly bus: ActionBus,
    private readonly center: () => ScreenPt = () => ({ x: 0, y: 0 }),
  ) {}

  attach(el: HTMLElement): void {
    this.detach?.();
    const down = (e: Event): void => this.handleKeyDown(e as unknown as KeyLike);
    const up = (e: Event): void => this.handleKeyUp(e as unknown as KeyLike);
    el.addEventListener('keydown', down);
    el.addEventListener('keyup', up);
    this.detach = () => {
      el.removeEventListener('keydown', down);
      el.removeEventListener('keyup', up);
      this.runModifier = false;
    };
  }

  dispose(): void {
    this.detach?.();
    this.detach = null;
  }

  rebind(key: string, type: ActionType): void {
    this.bindings[key.toLowerCase()] = type;
  }

  handleKeyUp(e: KeyLike): void {
    if (e.key === 'Shift') this.runModifier = false;
  }

  handleKeyDown(e: KeyLike): void {
    if (e.key === 'Shift') {
      this.runModifier = true;
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    const type = this.bindings[k];
    if (!type) return;
    const a = this.build(k, type);
    if (!a) return;
    e.preventDefault?.();
    this.bus.emit(a);
  }

  private build(k: string, type: ActionType): Action | null {
    switch (type) {
      case 'pan': {
        const v = PAN_VEC[k];
        return v ? { type: 'pan', dx: v[0] * PAN_STEP_PX, dy: v[1] * PAN_STEP_PX } : null;
      }
      case 'zoom':
        return { type: 'zoom', factor: k === '-' ? 1 / ZOOM_STEP : ZOOM_STEP, at: this.center() };
      case 'elevation':
        return { type: 'elevation', delta: k === 'pagedown' ? -1 : 1 };
      case 'zoomReset':
      case 'toggleRun':
      case 'pause':
        return { type };
      default:
        return null; // moveTo/interact/look/contextMenu wymagaja wskaznika
    }
  }
}
