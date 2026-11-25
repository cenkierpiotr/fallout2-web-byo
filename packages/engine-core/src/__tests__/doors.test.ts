import { describe, expect, it } from 'vitest';
import { exitGridAt, isDoor, isDoorLocked, isDoorOpen, toggleDoor } from '../index.js';
import { door, emptyMap, fake, put } from './helpers.js';

describe('doors', () => {
  it('test_toggleDoor_locked_returns_blocked', () => {
    const m = emptyMap();
    const d = put(m, door(100, 0x2));
    expect(isDoorLocked(d)).toBe(true);
    expect(toggleDoor(m, d)).toEqual({ ok: false, reason: 'blocked' });
    expect(isDoorOpen(d)).toBe(false);
  });

  it('toggleDoor otwiera i zamyka: frame, NoBlock', () => {
    const m = emptyMap();
    const d = put(m, door(100));
    expect(isDoor(d)).toBe(true);
    expect(toggleDoor(m, d)).toEqual({ ok: true });
    expect(isDoorOpen(d)).toBe(true);
    expect(d.frame).toBe(1);
    expect(d.flags & 0x10).toBe(0x10);
    toggleDoor(m, d);
    expect(isDoorOpen(d)).toBe(false);
    expect(d.frame).toBe(0);
    expect(d.flags & 0x10).toBe(0);
  });

  it('nie-drzwi', () => {
    const m = emptyMap();
    expect(isDoor(fake(3, 5))).toBe(false);
    expect(toggleDoor(m, fake(3, 5)).ok).toBe(false);
  });

  it('exitGridAt', () => {
    const m = emptyMap();
    m.exitGrids.push({
      hex: 5,
      elevation: 1,
      destMap: 3,
      destHex: 9,
      destElevation: 0,
      destOrientation: 0,
    });
    expect(exitGridAt(m, 1, 5)?.destMap).toBe(3);
    expect(exitGridAt(m, 0, 5)).toBeUndefined();
    expect(exitGridAt(m, 1, 6)).toBeUndefined();
  });
});
