/**
 * Headless playthrough, Modoc: floatery Bess (brahmin, obca lista komunikatow skryptu) i Rzeznika (mcbutchr, 300-312)
 * oraz warunki: Bess rozmawia tylko gdy GVAR_MODOC_TOOL_FLAG != 0 i GVAR_MODOC_GENERIC_FLAG_1 bez bitu 0x100
 * (rozmowa ustawia ten bit). Opis: dokumentacja techniczna czesc 10.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { boot, GAME_DIR, type Playthrough } from './harness.js';

const BESS = 268435476;
const BUTCHER = 268435470;
const BESS_RESCUED_BIT = 0x100;

const BUTCHER_LINES = [
  'Jerky is good for the bones.',
  'Jerky is good for the hair.',
  'Jerky is good for the lungs.',
  'Jerky is good for the stomach.',
  'Jerky is good for the loins.',
  'Jerky tastes good.',
  'Christ, did a brahmin shit in here?',
  'I think I stained my coat. HA! HA! HA!',
  'Watch your step. This place is full of nasty things on the ground.',
  'You like jerky?',
  'I even like jerky for breakfast.',
  'Milk, ice-cream, all makes my stomach nuts. But JERKY!!!',
  'Hey! Listen here, JERKY!!! HA! HA! HA!',
];
const BESS_LINES = ['Mooo...', 'Moooooo...', 'Mooooooooo...', 'Mooo Mooo Mooo...', ':: GRUNT ::'];

describe.skipIf(!GAME_DIR)('playthrough: Modoc, floatery Bess i Rzeznika (headless)', () => {
  let p: Playthrough;
  beforeEach(async () => {
    p = await boot();
    await p.enter('MODMAIN');
  }, 120_000);
  afterEach(async () => {
    await p?.close();
  });
  const byId = (id: number) => {
    const o = p.world.map.objects.find((x) => x.id === id);
    expect(o, `brak obiektu ${id}`).toBeDefined();
    return o!;
  };
  /** Zbiera wszystkie floatery z `n` interakcji (floatery sa mapowe: moga pochodzic tez od sasiednich NPC). */
  const collect = (id: number, n: number) => {
    const seen = new Set<string>();
    const starts: boolean[] = [];
    for (let i = 0; i < n; i++) {
      p.view.floatingTexts.value = [];
      starts.push(p.talk(byId(id), []).started);
      for (const f of p.view.floatingTexts.value) seen.add(f.text);
      p.tick(3);
    }
    return { seen, starts };
  };

  it('Bess (domyslnie): brak dialogu, floatery z obcej listy komunikatow ("Mooo...", GRUNT), bez bledow VM', () => {
    const mark = p.logMark();
    const { seen, starts } = collect(BESS, 40);
    expect(starts.some(Boolean)).toBe(false);
    const own = BESS_LINES.filter((l) => seen.has(l));
    expect(own.length).toBeGreaterThanOrEqual(4);
    expect(seen.has('Mooo...')).toBe(true);
    for (const f of seen) expect(f.trim()).not.toBe('');
    expect(p.problems(mark)).toEqual([]);
  });

  it('Bess z TOOL_FLAG=1 (bez bitu 0x100): zaczyna rozmowe zamiast floatera', () => {
    p.setGvar('GVAR_MODOC_TOOL_FLAG', 1);
    p.setGvar('GVAR_MODOC_GENERIC_FLAG_1', 0);
    const mark = p.logMark();
    p.view.floatingTexts.value = [];
    const r = p.talk(byId(BESS), []);
    expect(r.started).toBe(true);
    expect(r.history.join('\n')).toMatch(/Mooooooooo\./);
    expect(r.history.join('\n')).toMatch(/shouldn.t have sold you for jerky/);
    expect(p.problems(mark)).toEqual([]);
  });

  it('Bess: wybor "Poor girl, wyjdziemy stad?" ustawia bit 0x100, potem rozmowa juz sie nie zaczyna', () => {
    p.setGvar('GVAR_MODOC_TOOL_FLAG', 1);
    p.setGvar('GVAR_MODOC_GENERIC_FLAG_1', 0);
    const mark = p.logMark();
    const r = p.talk(byId(BESS), [/Poor girl/, /get out of here/, 0]);
    expect(r.history.join('\n')).toMatch(/Mooooooo\./);
    expect(p.gvar('GVAR_MODOC_GENERIC_FLAG_1') & BESS_RESCUED_BIT).toBe(BESS_RESCUED_BIT);
    const { starts } = collect(BESS, 5);
    expect(starts.some(Boolean)).toBe(false);
    expect(p.problems(mark)).toEqual([]);
  });

  it('Bess z bitem 0x100 mimo TOOL_FLAG=1: tylko floatery, bez dialogu', () => {
    p.setGvar('GVAR_MODOC_TOOL_FLAG', 1);
    p.setGvar('GVAR_MODOC_GENERIC_FLAG_1', BESS_RESCUED_BIT);
    const { seen, starts } = collect(BESS, 20);
    expect(starts.some(Boolean)).toBe(false);
    expect(seen.has('Mooo...')).toBe(true);
  });

  it('Rzeznik: losowe floatery o jerky (lista 300-312), bez dialogu i bledow VM', () => {
    const mark = p.logMark();
    const { seen, starts } = collect(BUTCHER, 60);
    expect(starts.some(Boolean)).toBe(false);
    const own = BUTCHER_LINES.filter((l) => seen.has(l));
    expect(own.length).toBeGreaterThanOrEqual(10);
    expect(seen.has('Jerky is good for the loins.')).toBe(true);
    expect(p.problems(mark)).toEqual([]);
  });

  it('Rzeznik: warunek GENERIC_FLAG_1 (0x80 / 0x100) nie zmienia puli floaterow', () => {
    for (const gf of [0x80, 0x100]) {
      p.setGvar('GVAR_MODOC_GENERIC_FLAG_1', gf);
      const mark = p.logMark();
      const { seen } = collect(BUTCHER, 40);
      expect(BUTCHER_LINES.filter((l) => seen.has(l)).length).toBeGreaterThanOrEqual(8);
      // migate.int wola critter_state na nieustawionej globalnej 0x13: oryginal zwraca 1 bez bledu (0x4585e8).
      expect(p.problems(mark)).toEqual([]);
    }
  });
});
