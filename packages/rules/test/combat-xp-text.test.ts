import { describe, expect, it } from 'vitest';
import { combatXpPrefixMsg } from '../src/index.js';

const seq = (...v: number[]) => {
  let i = 0;
  return { int: () => v[i++] as number };
};

describe('tekst XP po walce (0x4221b4, D)', () => {
  it('przedrostek 622 + rand(0..3), ranny gracz nie losuje 626', () => {
    expect(combatXpPrefixMsg(10, 30, seq(0))).toBe(622);
    expect(combatXpPrefixMsg(10, 30, seq(3))).toBe(625);
  });
  it('pelne HP i rzut > 65: 626', () => {
    expect(combatXpPrefixMsg(30, 30, seq(1, 66))).toBe(626);
    expect(combatXpPrefixMsg(30, 30, seq(1, 65))).toBe(623);
  });
});
