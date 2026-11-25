import { describe, expect, it } from 'vitest';
import { countCritters, renderStats } from './stats.js';

describe('map-stats', () => {
  it('liczy tylko krytery, wystapienia i liczbe map', () => {
    const perMap = new Map([
      ['a', [0x01000010, 0x01000010, 0x01000011, 0x02000001]],
      ['b', [0x01000010]],
    ]);
    const s = countCritters(perMap);
    expect(s).toEqual([
      { pid: 0x01000010, occurrences: 3, maps: 2 },
      { pid: 0x01000011, occurrences: 1, maps: 1 },
    ]);
    const md = renderStats(s, new Map([[0x01000010, '00000016.pro']]), {
      maps: 2,
      top: 20,
      date: '2026-11-10',
    });
    expect(md).toContain('| 1 | 0x01000010 | 00000016.pro | 3 | 2 |');
    expect(md).toContain('| 2 | 0x01000011 | ? | 1 | 1 |');
  });
});
