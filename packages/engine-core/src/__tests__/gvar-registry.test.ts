import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GvarRegistry, parseGamText as parseGam } from '../index.js';

const GAM = [
  '',
  ' // Comments',
  '//MAP_GLOBAL_VARS:',
  'GAME_GLOBAL_VARS:',
  '//GLOBAL   NUMBER',
  '',
  'GVAR_A                :=0;    //  (0)',
  'GVAR_B\t\t\t:=5;    //  (1)',
  'GVAR_C := -3 ; x',
  'GVAR_NOEQ;',
  '',
].join('\r\n');

describe('parseGam', () => {
  it('indeks = kolejnosc wystapienia, komentarze i naglowki pominiete', () => {
    const g = parseGam(GAM);
    expect(g.names).toEqual(['GVAR_A', 'GVAR_B', 'GVAR_C', 'GVAR_NOEQ']);
    expect(g.values).toEqual([0, 5, -3, 0]);
  });
  it('brak naglowka sekcji: czyta od poczatku', () => {
    const g = parseGam('X:=1;\nY:=2;');
    expect(g.values).toEqual([1, 2]);
  });
  it('smieci w wartosci daje 0 i ostrzezenie', () => {
    const g = parseGam('X:=abc;');
    expect(g.values).toEqual([0]);
    expect(g.warnings.length).toBe(1);
  });
});

describe('GvarRegistry', () => {
  it('test_missing_gvar_treated_as_zero', () => {
    const r = GvarRegistry.fromGam(parseGam(GAM));
    expect(r.size).toBe(4);
    expect(r.get(99)).toBe(0);
    expect(r.get(-1)).toBe(0);
    expect(r.get(1)).toBe(5);
  });
  it('set poza zakresem jest ignorowane', () => {
    const r = GvarRegistry.fromGam(parseGam(GAM));
    r.set(1, 9);
    r.set(50, 1);
    expect(r.get(1)).toBe(9);
    expect(r.get(50)).toBe(0);
    expect(r.idOf('GVAR_C')).toBe(2);
    expect(r.idOf('NOPE')).toBe(-1);
  });
  it('snapshot/restore round-trip', () => {
    const r = GvarRegistry.fromGam(parseGam(GAM));
    r.set(0, 7);
    const snap = r.snapshot();
    const r2 = GvarRegistry.fromGam(parseGam(GAM));
    r2.restore(snap);
    expect(r2.get(0)).toBe(7);
    expect(r2.get(2)).toBe(-3);
  });
});

const GAME = process.env['F2_PATCH_DIR'];
const gamPath = GAME ? join(GAME, 'DATA', 'Data', 'VAULT13.GAM') : '';
describe.skipIf(!GAME || !existsSync(gamPath))('VAULT13.GAM golden', () => {
  it('708 globali, 491 Modoc, 700 film Elder', () => {
    const g = parseGam(readFileSync(gamPath, 'latin1'));
    expect(g.names.length).toBe(708);
    expect(g.names[491]).toBe('GVAR_MODOC_SHITTY_DEATH');
    expect(g.names[700]).toBe('GVAR_ENDGAME_MOVIE_ELDER');
    expect(g.values.filter((v) => v !== 0).length).toBe(12);
  });
});
