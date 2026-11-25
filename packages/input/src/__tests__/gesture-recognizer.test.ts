import { describe, expect, it } from 'vitest';
import { GestureRecognizer, type PointerEv } from '../gesture-recognizer.js';

const mk = () => new GestureRecognizer({ tapSlopPx: 12, longPressMs: 350, doubleTapMs: 300 });
const ev = (type: PointerEv['type'], id: number, x: number, y: number, t: number): PointerEv => ({
  type,
  id,
  x,
  y,
  t,
});

describe('GestureRecognizer', () => {
  it('test_gesture_tap_within_slop_12px', () => {
    const g = mk();
    g.feed(ev('down', 1, 100, 100, 0));
    expect(g.feed(ev('move', 1, 105, 108, 20))).toBeNull();
    expect(g.feed(ev('up', 1, 105, 108, 60))?.kind).toBe('tap');
  });
  it('test_gesture_pan_beyond_slop_emits_pan_not_tap', () => {
    const g = mk();
    g.feed(ev('down', 1, 100, 100, 0));
    const p = g.feed(ev('move', 1, 120, 100, 20));
    expect(p).toMatchObject({ kind: 'pan', dx: 20, dy: 0 });
    expect(g.feed(ev('move', 1, 125, 103, 30))).toMatchObject({ kind: 'pan', dx: 5, dy: 3 });
    expect(g.feed(ev('up', 1, 125, 103, 40))).toBeNull();
  });
  it('test_gesture_longPress_350ms', () => {
    const g = mk();
    g.feed(ev('down', 1, 50, 50, 0));
    expect(g.poll(349)).toBeNull();
    expect(g.poll(350)?.kind).toBe('longPress');
    expect(g.feed(ev('up', 1, 50, 50, 500))).toBeNull();
    const h = mk();
    h.feed(ev('down', 1, 50, 50, 0));
    expect(h.feed(ev('up', 1, 50, 50, 400))?.kind).toBe('longPress');
  });
  it('test_gesture_long_press_drag_emits_holdDrag_then_end', () => {
    const g = mk();
    g.feed(ev('down', 1, 50, 50, 0));
    expect(g.poll(350)?.kind).toBe('longPress');
    // w obrebie slopu nic
    expect(g.feed(ev('move', 1, 55, 52, 400))).toBeNull();
    // poza slopem: marsz za palcem, nie pan
    expect(g.feed(ev('move', 1, 80, 50, 420))).toMatchObject({ kind: 'holdDrag', x: 80, y: 50 });
    expect(g.feed(ev('move', 1, 90, 60, 440))).toMatchObject({ kind: 'holdDrag', x: 90, y: 60 });
    expect(g.feed(ev('up', 1, 95, 65, 460))).toMatchObject({ kind: 'holdDragEnd', x: 95, y: 65 });
  });
  it('test_gesture_pan_przed_long_press_nie_daje_holdDrag', () => {
    const g = mk();
    g.feed(ev('down', 1, 50, 50, 0));
    expect(g.feed(ev('move', 1, 80, 50, 100))?.kind).toBe('pan');
    expect(g.poll(400)).toBeNull();
    expect(g.feed(ev('up', 1, 80, 50, 450))).toBeNull();
  });
  it('test_gesture_pinch_scale_two_pointers', () => {
    const g = mk();
    g.feed(ev('down', 1, 100, 100, 0));
    g.feed(ev('down', 2, 200, 100, 0));
    const r = g.feed(ev('move', 2, 300, 100, 10));
    expect(r?.kind).toBe('pinch');
    expect(r?.scale).toBe(2);
    expect(r?.x).toBe(200);
    expect(r?.dx).toBe(50);
    // po pinchu zwolnienie palcow nie daje tapa
    expect(g.feed(ev('up', 2, 300, 100, 20))).toBeNull();
    expect(g.feed(ev('up', 1, 100, 100, 30))).toBeNull();
  });
  it('test_gesture_doubleTap_300ms', () => {
    const g = mk();
    g.feed(ev('down', 1, 10, 10, 0));
    expect(g.feed(ev('up', 1, 10, 10, 40))?.kind).toBe('tap');
    g.feed(ev('down', 1, 12, 10, 150));
    expect(g.feed(ev('up', 1, 12, 10, 190))?.kind).toBe('doubleTap');
  });
  it('drugi tap po 300 ms to znowu tap', () => {
    const g = mk();
    g.feed(ev('down', 1, 10, 10, 0));
    g.feed(ev('up', 1, 10, 10, 40));
    g.feed(ev('down', 1, 10, 10, 500));
    expect(g.feed(ev('up', 1, 10, 10, 540))?.kind).toBe('tap');
  });
  it('twoFingerTap i threeFingerTap', () => {
    const g = mk();
    g.feed(ev('down', 1, 100, 100, 0));
    g.feed(ev('down', 2, 160, 100, 5));
    expect(g.feed(ev('up', 1, 100, 100, 80))?.kind).toBe('twoFingerTap');
    expect(g.feed(ev('up', 2, 160, 100, 90))).toBeNull();
    g.feed(ev('down', 1, 100, 100, 1000));
    g.feed(ev('down', 2, 160, 100, 1000));
    g.feed(ev('down', 3, 220, 100, 1005));
    expect(g.feed(ev('up', 3, 220, 100, 1080))?.kind).toBe('threeFingerTap');
    g.feed(ev('up', 1, 100, 100, 1090));
    expect(g.feed(ev('up', 2, 160, 100, 1095))).toBeNull();
  });
  it('cancel czysci stan', () => {
    const g = mk();
    g.feed(ev('down', 1, 0, 0, 0));
    g.feed(ev('cancel', 1, 0, 0, 5));
    g.feed(ev('down', 1, 0, 0, 1000));
    expect(g.feed(ev('up', 1, 0, 0, 1050))?.kind).toBe('tap');
  });
});
