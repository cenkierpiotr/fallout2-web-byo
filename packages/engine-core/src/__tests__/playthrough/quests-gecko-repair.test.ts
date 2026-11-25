/**
 * Headless playthrough, Gecko: naprawa reaktora (przedmiot 0x12f uzyty na terminalu GsTerm.int) oraz awaria
 * (GVAR_GECKO_MELTDOWN).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, GAME_DIR, type Playthrough } from './harness.js';

const TERMINAL = 268435461;

describe.skipIf(!GAME_DIR)('playthrough: Gecko, naprawa reaktora (headless)', () => {
  let p: Playthrough;
  beforeAll(async () => {
    p = await boot();
    await p.enter('GECKPWPL');
  }, 120_000);
  afterAll(async () => {
    await p?.close();
  });
  const term = () => p.world.map.objects.find((x) => x.id === TERMINAL)!;

  it('przedmiot 0x12f na terminalu przy PLANT>=13: quest=2, +2500 XP, bez bledow VM', async () => {
    const mark = p.logMark();
    await p.give(0x12f, 1);
    p.setGvar('GVAR_VAULT_GECKO_PLANT', 13);
    const xp0 = p.xp();
    const r = p.useOn(0x12f, term(), [0, 0, 0]);
    expect(r.ran).toBe(true);
    expect(p.gvar('GVAR_QUEST_OPTIMIZE_POWER_PLANT')).toBe(2);
    expect(p.xp() - xp0).toBe(2500);
    expect(p.gvar('GVAR_VAULT_GECKO_PLANT')).toBe(15);
    expect(p.problems(mark)).toEqual([]);
  });

  it('awaria: zawor (ST 10, wiele prob) ustawia MELTDOWN, wyjscie z mapy niszczy elektrownie (+2500 XP)', async () => {
    const q = await boot();
    try {
      await q.enter('GECKPWPL');
      const mark = q.logMark();
      q.setStat(0, 10);
      const valve = q.world.map.objects.find((x) => x.id === 268435458)!;
      for (let i = 0; i < 12 && q.gvar('GVAR_GECKO_MELTDOWN') !== 1; i++) q.use(valve, [0, 0, 0]);
      expect(q.gvar('GVAR_GECKO_MELTDOWN')).toBe(1);
      q.tick(300);
      const xp0 = q.xp();
      await q.enter('GECKSETL');
      expect(q.gvar('GVAR_GECKO_MELTDOWN')).toBeGreaterThanOrEqual(1);
      expect(q.gvar('GVAR_VAULT_GECKO_PLANT')).toBe(8);
      expect(q.xp() - xp0).toBe(2500);
      expect(q.problems(mark)).toEqual([]);
    } finally {
      await q.close();
    }
  }, 180_000);
});
