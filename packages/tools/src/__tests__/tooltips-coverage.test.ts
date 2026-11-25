import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  computeCoverage,
  formatCoverage,
  loadRuleData,
  type CoverageInput,
} from '../tooltips-coverage.js';

const repo = resolve(__dirname, '../../../..');

function base(): CoverageInput {
  return {
    perks: [{ index: 0, msgId: 101, descMsgId: 1101 }],
    traits: [{ index: 0, msgId: 100, descMsgId: 200 }],
    statCount: 1,
    skillCount: 1,
    perkMsg: new Map([
      [101, 'P'],
      [1101, 'opis'],
    ]),
    traitMsg: new Map([
      [100, 'T'],
      [200, 'opis'],
    ]),
    statMsg: new Map([
      [100, 'S'],
      [200, 'opis'],
    ]),
    skillMsg: new Map([
      [100, 'K'],
      [200, 'opis'],
    ]),
  };
}

describe('computeCoverage', () => {
  it('pelne pokrycie: ok', () => {
    const r = computeCoverage(base());
    expect(r.ok).toBe(true);
    expect(formatCoverage(r)).toContain('perk: 1/1 z opisem');
  });
  it('brak opisu perka i spacje = brak', () => {
    const i = base();
    i.perkMsg = new Map([
      [101, 'P'],
      [1101, '   '],
    ]);
    const r = computeCoverage(i);
    expect(r.ok).toBe(false);
    expect(r.categories[0]!.missing).toEqual(['0']);
  });
  it('przedmioty: prog 98%, wyjatki sie nie licza', () => {
    const i = base();
    i.itemMsg = new Map([
      [10, 'x'],
      [11, 'opis'],
    ]);
    i.items = [
      { pid: 1, textId: 10, key: 'a.pro' },
      { pid: 2, textId: 20, key: 'b.pro' },
    ];
    expect(computeCoverage(i).ok).toBe(false);
    i.exceptions = new Set(['item:b.pro']);
    expect(computeCoverage(i).ok).toBe(true);
  });
  it('przedmioty: 1 brak na 50 mieści sie w progu 98%', () => {
    const i = base();
    const m = new Map<number, string>();
    i.items = Array.from({ length: 50 }, (_, n) => ({ pid: n, textId: n * 10, key: `${n}.pro` }));
    for (let n = 1; n < 50; n++) {
      m.set(n * 10, 'x');
      m.set(n * 10 + 1, 'y');
    }
    i.itemMsg = m;
    expect(computeCoverage(i).ok).toBe(true);
  });
});

describe('loadRuleData', () => {
  it('czyta perki, cechy, staty i skille z repo', () => {
    const d = loadRuleData(repo);
    expect(d.perks.length).toBeGreaterThan(100);
    expect(d.traits).toHaveLength(16);
    expect(d.skillCount).toBe(18);
    expect(d.statCount).toBeGreaterThan(30);
  });
});
