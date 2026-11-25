import { describe, expect, it } from 'vitest';
import { setObjHidden, setObjLocked, setObjOpen, objIsLocked, objIsOpen } from '../misc-model.js';
import { fake } from './helpers.js';

const door = () => fake(2, 100, 0, { kind: 'door', flags: 0, raw: new Int32Array(0) } as never);

describe('misc-model', () => {
  it('ukrywanie krytera ustawia Hidden i NoBlock, odkrycie je zdejmuje', () => {
    const c = fake(1, 100, 0, { kind: 'critter', flags: 0, raw: new Int32Array(0) });
    c.flags = 0;
    setObjHidden(c, true);
    expect(c.flags & 0x11).toBe(0x11);
    setObjHidden(c, false);
    expect(c.flags & 0x11).toBe(0);
  });
  it('blokada i otwarcie drzwi', () => {
    const d = door();
    expect(objIsLocked(d)).toBe(0);
    setObjLocked(d, true);
    expect(objIsLocked(d)).toBe(1);
    setObjLocked(d, false);
    expect(objIsLocked(d)).toBe(0);
    setObjOpen(d, true);
    expect(objIsOpen(d)).toBe(1);
    expect(d.flags & 0x10).toBe(0x10);
    setObjOpen(d, false);
    expect(objIsOpen(d)).toBe(0);
  });
  it('nie-drzwi: blokada to no-op', () => {
    const c = fake(1, 100, 0, { kind: 'critter', flags: 0, raw: new Int32Array(0) });
    setObjLocked(c, true);
    expect(objIsLocked(c)).toBe(0);
  });
});
