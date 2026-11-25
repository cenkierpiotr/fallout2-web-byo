import { describe, expect, it } from 'vitest';
import { townReputationLabel } from '../src/index.js';

describe('townReputationLabel', () => {
  it.each([
    [100, 2000],
    [30, 2000],
    [29, 2001],
    [15, 2001],
    [14, 2002],
    [1, 2002],
    [0, 2003],
    [-1, 2004],
    [-15, 2004],
    [-16, 2005],
    [-30, 2005],
    [-31, 2006],
    [-500, 2006],
    [Number.NaN, 2003],
  ])('%d -> %d', (v, id) => expect(townReputationLabel(v)).toBe(id));
});
