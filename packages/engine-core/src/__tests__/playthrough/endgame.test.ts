/**
 * Headless playthrough: Enclave (Horrigan, reaktor platformy), warunki konca gry i slajdy.
 * Ten sam harness co playthrough.test.ts (F2_GAME_DIR). Dowody z exe: dokumentacja techniczna
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseEndgameTable, parseEnddeathTable } from '@f2/formats';
import { selectDeath, selectEndgameSlides } from '../../index.js';
import { boot, GAME_DIR, type Playthrough } from './harness.js';

describe.skipIf(!GAME_DIR)('playthrough Enclave: Horrigan i koniec gry (headless)', () => {
  let p: Playthrough;
  beforeAll(async () => {
    p = await boot();
  }, 120_000);
  afterAll(async () => {
    await p?.close();
  });

  it('Horrigan (ENCFITE): zabity w walce wola destroy_p_proc i ustawia GVAR_ENCLAVE_FRANK_DEAD', async () => {
    await p.enter('ENCFITE');
    const frank = p.byPid(0x1000120)[0];
    expect(frank).toBeDefined();
    expect(p.gvar('GVAR_ENCLAVE_FRANK_DEAD')).toBe(0);
    const mark = p.logMark();
    p.rt.applyCombatDamage(frank!.id, p.player.id, 100000);
    expect(p.gvar('GVAR_ENCLAVE_FRANK_DEAD')).toBe(1);
    expect(p.problems(mark)).toEqual([]);
  }, 120_000);

  it('reaktor (ENCRCTR): wybuch zaczyna odliczanie, po 10 min gry map_update konczy gre (derrick + SIGNAL_END_GAME)', async () => {
    await p.enter('ENCRCTR');
    const reactor = p.byPid(0x20000b6).find((o) => p.rt.hasObjectProc(o.id, 'damage_p_proc'));
    expect(reactor).toBeDefined();
    expect(p.gvar('GVAR_ENCLAVE_COUNTDOWN')).toBe(0);
    const mark = p.logMark();
    // trafienie typem 6 (wybuch) = metarule(49) == 6 w damage_p_proc; cel = bron w skrypcie (0x424c04)
    p.rt.applyWeaponHit(reactor!.id, p.player.id, p.player.id, 6);
    expect(p.gvar('GVAR_ENCLAVE_COUNTDOWN')).toBeGreaterThan(0);
    expect(p.gvar('GVAR_ENCLAVE_REACTOR')).toBe(1);
    // odliczanie sprawdza map_update_p_proc map Enclave z qcfrank/encpres (ENCPRES = platforma); stan GVAR przechodzi miedzy mapami
    await p.enter('ENCPRES');
    // przed uplywem 10 minut (6000 tickow) koniec gry nie jest zgloszony
    p.world.clock.advance(5000);
    p.rt.scheduler.runMapUpdateAll();
    expect(p.rt.endGameRequested).toBe(false);
    p.world.clock.advance(1100);
    p.rt.scheduler.runMapUpdateAll();
    expect(p.rt.endGameRequested).toBe(true);
    expect(p.problems(mark)).toEqual([]);
  }, 120_000);

  it('slajdy konca: stan GVAR po Horriganie i reaktorze wybiera slajdy z prawdziwego endgame.txt (kolejnosc pliku)', async () => {
    const text = async (f: string) => Buffer.from(await p.vfs.open(f)).toString('latin1');
    const slides = parseEndgameTable(await text('data/endgame.txt')).items;
    const sel = selectEndgameSlides(slides, p.vars);
    expect(sel).toEqual(slides.filter((s) => p.vars.get(s.gvar) === s.value));
    expect(sel.length).toBeGreaterThan(0);
    const lines = sel.map((s) => s.line);
    expect([...lines].sort((a, b) => a - b)).toEqual(lines);
    // slajdy zalezne od stanu Enclave: gdyby tabela miala wpis na GVAR_ENCLAVE_FRANK_DEAD == 1, musi byc wybrany
    const frank = p.gvarIndex.get('GVAR_ENCLAVE_FRANK_DEAD')!;
    for (const s of slides.filter((x) => x.gvar === frank && x.value === 1))
      expect(sel).toContain(s);
  }, 120_000);

  it('smierc gracza (kill_critter) zglasza playerDeathRequested; selectDeath wybiera wiersz z prawdziwego enddeath.txt', async () => {
    const text = async (f: string) => Buffer.from(await p.vfs.open(f)).toString('latin1');
    const rows = parseEnddeathTable(await text('data/enddeath.txt')).items;
    expect(rows.length).toBe(18);
    p.rt.clearEndSignals();
    p.rt.unsupported('kill_critter', [
      { t: 'obj', v: p.player.id },
      { t: 'int', v: 0 },
    ]);
    expect(p.rt.playerDeathRequested).toBe(true);
    const row = selectDeath(rows, {
      gvars: p.vars,
      areaKnown: () => false,
      level: 1,
      reason: 0,
      rng: { int: (min) => min },
    });
    expect(row).toBeDefined();
  }, 120_000);
});
