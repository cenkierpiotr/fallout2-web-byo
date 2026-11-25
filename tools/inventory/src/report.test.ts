import { describe, expect, it } from 'vitest';
import { renderReport } from './report.js';

describe('renderReport', () => {
  it('renderuje wiersz kategorii i wiersz Razem', () => {
    const md = renderReport(
      [
        {
          category: 'art/tiles',
          files: 2,
          frames: 2,
          pixels: 5760,
          maxWidth: 80,
          maxHeight: 36,
          animated: 0,
        },
      ],
      { date: '2026-11-09', sources: ['MASTER.DAT'] },
    );
    expect(md).toContain('| art/tiles | 2 | 2 |');
    expect(md).toContain('| Razem |');
  });

  it('sortuje po pikselach malejaco', () => {
    const base = { files: 1, frames: 1, maxWidth: 1, maxHeight: 1, animated: 0 };
    const md = renderReport(
      [
        { ...base, category: 'a', pixels: 1 },
        { ...base, category: 'b', pixels: 9 },
      ],
      { date: 'd', sources: [] },
    );
    expect(md.indexOf('| b |')).toBeLessThan(md.indexOf('| a |'));
  });
});
