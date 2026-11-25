import { describe, expect, it } from 'vitest';
import {
  barterAccept,
  barterPrice,
  partyBestSkill,
  splitCaps,
  type BarterPriceInput,
} from '../src/index.js';

const base: BarterPriceInput = {
  value: 100,
  caps: 0,
  merchantBarter: 60,
  partyBestBarter: 50,
  barterMod: 0,
  masterTrader: false,
};

describe('barterPrice (spec barter.md)', () => {
  it('#1 standard', () => expect(barterPrice(base)).toBe(209));
  it('#2 Master Trader', () => expect(barterPrice({ ...base, masterTrader: true })).toBe(157));
  it('#3 kapsle dodane po, mod 20', () =>
    expect(
      barterPrice({ ...base, caps: 50, merchantBarter: 100, partyBestBarter: 100, barterMod: 20 }),
    ).toBe(290));
  it('#4 mod ujemny -> 0.01', () =>
    expect(
      barterPrice({ ...base, merchantBarter: 100, partyBestBarter: 100, barterMod: -150 }),
    ).toBe(2));
  it('kapsle nie sa mnozone', () =>
    expect(barterPrice({ ...base, value: 0, caps: 77, barterMod: 50 })).toBe(77));
});

describe('splitCaps', () => {
  it('oddziela kapsle pid 0x29', () =>
    expect(
      splitCaps([
        { pid: 41, count: 30, value: 1 },
        { pid: 7, count: 2, value: 50 },
      ]),
    ).toEqual({ value: 100, caps: 30 }));
});

describe('barterAccept', () => {
  const ok = {
    offer: 100,
    merchantTableValue: 100,
    merchantTableEmpty: false,
    playerBlocked: false,
    playerFreeCarry: 50,
    merchantGoodsWeight: 10,
  };
  it('ok przy rownowartosci', () => expect(barterAccept(ok)).toBe('ok'));
  it('oferta za niska', () => expect(barterAccept({ ...ok, offer: 99 })).toBe('offer-too-low'));
  it('pusty stol kupca', () =>
    expect(barterAccept({ ...ok, merchantTableEmpty: true })).toBe('offer-too-low'));
  it('gracz nie unosi', () =>
    expect(barterAccept({ ...ok, playerFreeCarry: 5 })).toBe('player-cannot-carry'));
  it('zablokowany przedmiot', () =>
    expect(barterAccept({ ...ok, playerBlocked: true })).toBe('not-tradeable'));
  it('kupiec nie unosi (pojemnik)', () =>
    expect(
      barterAccept({ ...ok, containerMode: true, merchantFreeCarry: 1, playerGoodsWeight: 5 }),
    ).toBe('merchant-cannot-carry'));
});

describe('partyBestSkill (0x4955c8)', () => {
  it('maksimum po druzynie, start od 0 (nigdy ujemny)', () => {
    expect(partyBestSkill([20, 55, 31])).toBe(55);
    expect(partyBestSkill([])).toBe(0);
    expect(partyBestSkill([-5, -1])).toBe(0);
  });
});
