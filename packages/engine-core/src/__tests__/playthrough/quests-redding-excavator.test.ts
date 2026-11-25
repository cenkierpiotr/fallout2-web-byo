/**
 * Headless playthrough, Redding: Marge LeBarge (redment) zleca przyniesienie Excavator Chip (pid 0x1a6) z Great
 * Wanamingo Mine (GVAR_REDDING_EXCAVATOR_CHIP 1). Sprzedaz Marge: CHIP=2, 2500 XP, $1000 i chip znika z ekwipunku.
 * McGrew (Morningstar) kupuje ten sam chip za $1000 i tez daje 2500 XP, ale ustawia CHIP=3 (wrog Marge). Opis: dokumentacja techniczna
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { boot, GAME_DIR, type Playthrough } from './harness.js';

const MARGE = 84;
const MCGREW = 74;
const CHIP = 0x1a6;

describe.skipIf(!GAME_DIR)('playthrough: Redding, Excavator Chip (headless)', () => {
  let p: Playthrough;
  let mark: number;
  beforeEach(async () => {
    p = await boot();
    await p.enter('redment');
    mark = p.logMark();
  }, 120_000);
  afterEach(async () => {
    await p?.close();
  });
  const byId = (id: number) => {
    const o = p.world.map.objects.find((x) => x.id === id);
    expect(o, `brak obiektu ${id}`).toBeDefined();
    return o!;
  };
  const caps = () => p.rt.inventory.itemCapsTotal(p.player.id);
  const accept = () =>
    p.talk(byId(MARGE), [
      3,
      /What.s that/,
      /how do I fit/,
      /How come/,
      /So, you want/,
      /We.ll see/,
      /Yeah. I.m interested/,
      1,
    ]);

  it('Marge zleca chip: CHIP=1', () => {
    const r = accept();
    expect(r.history.join('\n')).toMatch(/Great Wanamingo Mine/);
    expect(p.gvar('GVAR_REDDING_EXCAVATOR_CHIP')).toBe(1);
    expect(p.xp()).toBe(0);
    expect(p.problems(mark)).toEqual([]);
  });

  it('sprzedaz chipu Marge (CHIP=1, chip w ekwipunku): CHIP=2, 2500 XP, $1000, chip zabrany', async () => {
    p.setGvar('GVAR_REDDING_EXCAVATOR_CHIP', 1);
    await p.give(CHIP);
    const caps0 = caps();
    const x0 = p.xp();
    p.talk(byId(MARGE), [/How much/, /take it/, 1]);
    expect(p.gvar('GVAR_REDDING_EXCAVATOR_CHIP')).toBe(2);
    expect(p.xp() - x0).toBe(2500);
    expect(caps() - caps0).toBe(1000);
    expect(p.count(CHIP)).toBe(0);
  });

  it('sprzedaz chipu McGrew (CHIP=1, chip w ekwipunku): CHIP=3, 2500 XP, $1000, chip zabrany', async () => {
    p.setGvar('GVAR_REDDING_EXCAVATOR_CHIP', 1);
    await p.give(CHIP);
    const caps0 = caps();
    const x0 = p.xp();
    p.talk(byId(MCGREW), [/going on/, /Excavator Chip/, /How much/, /Here.s your chip/, 1]);
    expect(p.count(CHIP)).toBe(0);
    expect(caps() - caps0).toBe(1000);
    expect(p.xp() - x0).toBe(2500);
    expect(p.gvar('GVAR_REDDING_EXCAVATOR_CHIP')).toBe(3);
  });
});
