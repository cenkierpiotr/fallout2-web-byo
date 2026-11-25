import { describe, expect, it } from 'vitest';
import {
  critterHeal,
  critterHp,
  critterInjure,
  critterIsFleeing,
  critterSetFlee,
  critterState,
} from '../critter-model.js';
import { fake } from './helpers.js';

const crit = (raw: number[] = []) =>
  fake(1, 100, 0, { kind: 'critter', flags: 0, raw: Int32Array.from(raw) });

describe('critter-model', () => {
  it('zdrowy krytter ma stan 0, nie-krytter -1', () => {
    expect(critterState(crit())).toBe(0);
    expect(critterState(fake(0, 100))).toBe(-1);
  });
  it('martwy (bit 0x80) = 1, nieprzytomny (0x01) = 2', () => {
    expect(critterState(crit([0, 0, 0x80]))).toBe(1);
    expect(critterState(crit([0, 0, 0x01]))).toBe(2);
  });
  it('okaleczenia widac w stanie (maska 0x7c)', () => {
    const c = crit();
    critterInjure(c, 0x30, false);
    expect(critterState(c)).toBe(0x30);
    critterInjure(c, 0x10, true);
    expect(critterState(c)).toBe(0x20);
  });
  it('animacja lezenia (kody 0x30, 0x31) daje bit 2', () => {
    const c = crit();
    c.fid = 0x00300000;
    expect(critterState(c)).toBe(2);
    c.fid = 0x00310000;
    expect(critterState(c)).toBe(2);
    c.fid = 0x00320000;
    expect(critterState(c)).toBe(0);
  });
  it('ucieczka: flaga ustawiana i zdejmowana', () => {
    const c = crit();
    expect(critterIsFleeing(c)).toBe(0);
    critterSetFlee(c, true);
    expect(critterIsFleeing(c)).toBe(1);
    critterSetFlee(c, false);
    expect(critterIsFleeing(c)).toBe(0);
  });
  it('leczenie nie przekracza maksimum', () => {
    const c = crit([0, 0, 0, 0, 0, 0, 0, 10]); // hp = raw[7] = 10
    critterHeal(c, 5, 30);
    expect(critterHp(c, 30)).toBe(15);
    expect(critterHeal(c, 100, 30)).toBe(0);
    expect(critterHp(c, 30)).toBe(30);
  });
  it('krytter z HP <= 0 jest martwy', () => {
    expect(critterState(crit([0, 0, 0, 0, 0, 0, 0, 0]))).toBe(1);
  });
});
