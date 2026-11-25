import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActionBus, type Action } from '../action-bus.js';
import { KeyboardMap } from '../keyboard-map.js';
import { PointerManager } from '../pointer-manager.js';

class FakeEl extends EventTarget {
  getBoundingClientRect() {
    return { left: 10, top: 20 };
  }
  fire(type: string, props: Record<string, unknown>) {
    const e = new Event(type, { cancelable: true });
    for (const [k, v] of Object.entries(props)) Object.defineProperty(e, k, { value: v });
    this.dispatchEvent(e);
    return e;
  }
}
const ptr = (o: Record<string, unknown>) => ({
  pointerId: 1,
  pointerType: 'mouse',
  button: 0,
  clientX: 110,
  clientY: 120,
  shiftKey: false,
  timeStamp: 0,
  ...o,
});
const cam = { screenToHex: (x: number, y: number) => (x < 0 ? null : x * 1000 + y) };

function setup(profile: 'desktop' | 'touch' | 'hybrid') {
  const el = new FakeEl();
  const bus = new ActionBus();
  const out: Action[] = [];
  bus.on((a) => out.push(a));
  const pm = new PointerManager(el as unknown as HTMLElement, bus, profile, cam);
  pm.attach();
  return { el, out, pm };
}

afterEach(() => vi.useRealTimers());

describe('PointerManager', () => {
  it('test_pointerManager_desktop_left_click_emits_moveTo', () => {
    const { el, out } = setup('desktop');
    el.fire('pointerdown', ptr({}));
    el.fire('pointerdown', ptr({ shiftKey: true }));
    expect(out).toEqual([
      { type: 'moveTo', hex: 100100, run: false },
      { type: 'moveTo', hex: 100100, run: true },
    ]);
  });
  it('klik poza mapa: brak akcji, brak wyjatku', () => {
    const { el, out } = setup('desktop');
    el.fire('pointerdown', ptr({ clientX: 0 }));
    expect(out).toEqual([]);
  });
  it('PPM = contextMenu, kolko = zoom, srodkowy drag = pan', () => {
    const { el, out } = setup('desktop');
    el.fire('pointerdown', ptr({ button: 2 }));
    el.fire('wheel', ptr({ deltaY: -100 }));
    el.fire('pointerdown', ptr({ button: 1 }));
    el.fire('pointermove', ptr({ clientX: 115, clientY: 118 }));
    el.fire('pointerup', ptr({ button: 1 }));
    el.fire('pointermove', ptr({ clientX: 200, clientY: 200 }));
    expect(out[0]).toEqual({ type: 'contextMenu', screen: { x: 100, y: 100 } });
    expect(out[1]).toMatchObject({ type: 'zoom', at: { x: 100, y: 100 } });
    expect((out[1] as Extract<Action, { type: 'zoom' }>).factor).toBeGreaterThan(1);
    expect(out[2]).toEqual({ type: 'pan', dx: 5, dy: -2 });
    expect(out).toHaveLength(3);
  });
  it('desktop ignoruje dotyk', () => {
    const { el, out } = setup('desktop');
    el.fire('pointerdown', ptr({ pointerType: 'touch' }));
    el.fire('pointerup', ptr({ pointerType: 'touch', timeStamp: 50 }));
    expect(out).toEqual([]);
  });
  it('test_pointerManager_touch_tap_emits_moveTo_run_true', () => {
    const { el, out } = setup('touch');
    el.fire('pointerdown', ptr({ pointerType: 'touch' }));
    el.fire('pointerup', ptr({ pointerType: 'touch', timeStamp: 50 }));
    expect(out).toEqual([{ type: 'moveTo', hex: 100100, run: true }]);
  });
  it('touch: long press = contextMenu (timer)', () => {
    vi.useFakeTimers();
    const { el, out } = setup('touch');
    el.fire('pointerdown', ptr({ pointerType: 'touch' }));
    vi.advanceTimersByTime(351);
    expect(out).toEqual([{ type: 'contextMenu', screen: { x: 100, y: 100 } }]);
    el.fire('pointerup', ptr({ pointerType: 'touch', timeStamp: 500 }));
    expect(out).toHaveLength(1);
  });
  it('touch: long-press-drag = contextMenu, potem walkDrag move/end (bez pan)', () => {
    vi.useFakeTimers();
    const { el, out } = setup('touch');
    const t = { pointerType: 'touch' };
    el.fire('pointerdown', ptr({ ...t }));
    vi.advanceTimersByTime(351);
    el.fire('pointermove', ptr({ ...t, clientX: 150, clientY: 120, timeStamp: 400 }));
    el.fire('pointerup', ptr({ ...t, clientX: 150, clientY: 120, timeStamp: 450 }));
    expect(out).toEqual([
      { type: 'contextMenu', screen: { x: 100, y: 100 } },
      { type: 'walkDrag', screen: { x: 140, y: 100 }, phase: 'move' },
      { type: 'walkDrag', screen: { x: 140, y: 100 }, phase: 'end' },
    ]);
  });
  it('touch: double tap = look, pan jednym palcem, pinch', () => {
    const { el, out } = setup('touch');
    const t = { pointerType: 'touch' };
    el.fire('pointerdown', ptr({ ...t, timeStamp: 0 }));
    el.fire('pointerup', ptr({ ...t, timeStamp: 30 }));
    el.fire('pointerdown', ptr({ ...t, timeStamp: 100 }));
    el.fire('pointerup', ptr({ ...t, timeStamp: 130 }));
    expect(out.map((a) => a.type)).toEqual(['moveTo', 'look']);
    out.length = 0;
    el.fire('pointerdown', ptr({ ...t, timeStamp: 1000 }));
    el.fire('pointermove', ptr({ ...t, clientX: 140, timeStamp: 1010 }));
    expect(out).toEqual([{ type: 'pan', dx: 30, dy: 0 }]);
    el.fire('pointerup', ptr({ ...t, clientX: 140, timeStamp: 1020 }));
    out.length = 0;
    el.fire('pointerdown', ptr({ ...t, pointerId: 1, timeStamp: 2000 }));
    el.fire('pointerdown', ptr({ ...t, pointerId: 2, clientX: 210, timeStamp: 2000 }));
    el.fire('pointermove', ptr({ ...t, pointerId: 2, clientX: 310, timeStamp: 2010 }));
    expect(out.map((a) => a.type)).toEqual(['pan', 'zoom']);
  });
  it('touch: trzy palce = pause, double two-finger tap = zoomReset', () => {
    const { el, out } = setup('touch');
    const t = { pointerType: 'touch' };
    const tap2 = (t0: number) => {
      el.fire('pointerdown', ptr({ ...t, pointerId: 1, timeStamp: t0 }));
      el.fire('pointerdown', ptr({ ...t, pointerId: 2, clientX: 170, timeStamp: t0 }));
      el.fire('pointerup', ptr({ ...t, pointerId: 1, timeStamp: t0 + 40 }));
      el.fire('pointerup', ptr({ ...t, pointerId: 2, clientX: 170, timeStamp: t0 + 45 }));
    };
    tap2(0);
    tap2(150);
    expect(out).toEqual([{ type: 'zoomReset' }]);
    out.length = 0;
    for (const id of [1, 2, 3])
      el.fire('pointerdown', ptr({ ...t, pointerId: id, clientX: 100 + id * 60, timeStamp: 1000 }));
    for (const id of [3, 2, 1])
      el.fire('pointerup', ptr({ ...t, pointerId: id, clientX: 100 + id * 60, timeStamp: 1050 }));
    expect(out).toEqual([{ type: 'pause' }]);
  });
  it('setProfile i detach', () => {
    const { el, out, pm } = setup('touch');
    el.fire('pointerdown', ptr({}));
    expect(out).toEqual([]);
    pm.setProfile('hybrid');
    el.fire('pointerdown', ptr({}));
    expect(out).toHaveLength(1);
    pm.detach();
    el.fire('pointerdown', ptr({}));
    expect(out).toHaveLength(1);
  });
});

describe('KeyboardMap', () => {
  it('test_keyboardMap_shift_modifier_run', () => {
    const bus = new ActionBus();
    const km = new KeyboardMap(bus);
    const el = new FakeEl();
    km.attach(el as unknown as HTMLElement);
    expect(km.runModifier).toBe(false);
    el.fire('keydown', { key: 'Shift' });
    expect(km.runModifier).toBe(true);
    el.fire('keyup', { key: 'Shift' });
    expect(km.runModifier).toBe(false);
  });
  it('WASD, strzalki, zoom, elevation, rebind', () => {
    const bus = new ActionBus();
    const out: Action[] = [];
    bus.on((a) => out.push(a));
    const km = new KeyboardMap(bus, () => ({ x: 5, y: 6 }));
    const el = new FakeEl();
    km.attach(el as unknown as HTMLElement);
    for (const key of ['w', 'ArrowRight', '-', 'PageDown', 'Escape', 'x'])
      el.fire('keydown', { key });
    expect(out).toEqual([
      { type: 'pan', dx: 0, dy: -48 },
      { type: 'pan', dx: 48, dy: 0 },
      { type: 'zoom', factor: 1 / 1.1, at: { x: 5, y: 6 } },
      { type: 'elevation', delta: -1 },
      { type: 'pause' },
    ]);
    out.length = 0;
    km.rebind('x', 'toggleRun');
    el.fire('keydown', { key: 'x' });
    el.fire('keydown', { key: 'w', ctrlKey: true });
    expect(out).toEqual([{ type: 'toggleRun' }]);
  });
});
