import { describe, expect, it } from 'vitest';
import { critterAnimChars, decodeFid, FID_TYPE_DIRS } from './index.js';

describe('decodeFid', () => {
  it('rozbija pola wg masek 0x419428', () => {
    expect(decodeFid(0x1123_4567)).toEqual({
      index: 0x567,
      weapon: 4,
      anim: 0x23,
      type: 1,
      orientation: 1,
    });
  });
  it('bit 31 nie jest czytany', () => {
    expect(decodeFid(0x8000_0000)).toEqual({
      index: 0,
      weapon: 0,
      anim: 0,
      type: 0,
      orientation: 0,
    });
  });
  it('11 katalogow typow', () => {
    expect(FID_TYPE_DIRS.length).toBe(11);
    expect(FID_TYPE_DIRS[1]).toBe('critters');
  });
});

describe('critterAnimChars', () => {
  it('weapon poza 0..10 daje null', () => {
    expect(critterAnimChars(0, 11)).toBeNull();
    expect(critterAnimChars(0, -1)).toBeNull();
  });
  it('0x26..0x2f wymaga broni', () => {
    expect(critterAnimChars(0x26, 0)).toBeNull();
    expect(critterAnimChars(0x26, 1)).toEqual({ first: 'd', second: 'c' });
  });
  it('przypadki szczegolne', () => {
    expect(critterAnimChars(0x24, 3)).toEqual({ first: 'c', second: 'h' });
    expect(critterAnimChars(0x25, 3)).toEqual({ first: 'c', second: 'j' });
    expect(critterAnimChars(0x40, 0)).toEqual({ first: 'n', second: 'a' });
    expect(critterAnimChars(0x12, 1)).toEqual({ first: 'd', second: 'm' });
    expect(critterAnimChars(0x12, 4)).toEqual({ first: 'g', second: 'm' });
    expect(critterAnimChars(0x12, 2)).toEqual({ first: 'a', second: 's' });
    expect(critterAnimChars(0xd, 0)).toEqual({ first: 'a', second: 'n' });
    expect(critterAnimChars(0xd, 2)).toEqual({ first: 'e', second: 'e' });
  });
  it('wartosci domyslne', () => {
    expect(critterAnimChars(0, 0)).toEqual({ first: 'a', second: 'a' });
    expect(critterAnimChars(1, 1)).toEqual({ first: 'd', second: 'b' });
    expect(critterAnimChars(5, 1)).toEqual({ first: 'a', second: 'f' });
    expect(critterAnimChars(0x14, 0)).toEqual({ first: 'b', second: 'a' });
    expect(critterAnimChars(0x30, 0)).toEqual({ first: 'r', second: 'a' });
  });
});
