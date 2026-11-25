/**
 * Headless playthrough, NCR: lancuch zlecenia Tandi. Deputy Karl (NCR1) kieruje do prezydent Tandi (NCR2),
 * ktora zleca odzyskanie czesci z Vault 15 (GVAR_NCR_TANDI_WORK 0->1, GVAR_NCR_TANDI_JOB_ACCEPT 0->1).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, GAME_DIR, type Playthrough } from './harness.js';

const KARL = 297;
const TANDI = 268435456;

describe.skipIf(!GAME_DIR)('playthrough: NCR, zlecenie Tandi (headless)', () => {
  let p: Playthrough;
  beforeAll(async () => {
    p = await boot();
  }, 120_000);
  afterAll(async () => {
    await p?.close();
  });
  const byId = (id: number) => {
    const o = p.world.map.objects.find((x) => x.id === id);
    expect(o, `brak obiektu ${id}`).toBeDefined();
    return o!;
  };

  it('Deputy Karl odsyla do Tandi i ustawia GVAR_NCR_TANDI_WORK', async () => {
    await p.enter('NCR1');
    const mark = p.logMark();
    expect(p.gvar('GVAR_NCR_TANDI_WORK')).toBe(0);
    const r = p.talk(byId(KARL), [/honest work/]);
    expect(r.history.join('\n')).toMatch(/Tandi/);
    expect(p.gvar('GVAR_NCR_TANDI_WORK')).toBe(1);
    expect(p.problems(mark)).toEqual([]);
  }, 120_000);

  it('Tandi: przyjecie zlecenia na czesci z Vault 15 ustawia GVAR_NCR_TANDI_JOB_ACCEPT', async () => {
    await p.enter('NCR2');
    const mark = p.logMark();
    expect(p.gvar('GVAR_NCR_TANDI_JOB_ACCEPT')).toBe(0);
    const r = p.talk(byId(TANDI), [
      /many talents/,
      /depends on the job/,
      /happy to help/,
      /All right/,
    ]);
    expect(r.history.join('\n')).toMatch(/Vault 15/);
    expect(p.gvar('GVAR_NCR_TANDI_JOB_ACCEPT')).toBe(1);
    expect(p.problems(mark)).toEqual([]);
  }, 120_000);

  it('Tandi: umowa z Darionem (V15) konczy sie rozliczeniem, GVAR_V15_NCR_DEAL=2', async () => {
    const q = await boot();
    try {
      await q.enter('NCR2');
      const mark = q.logMark();
      q.setGvar('GVAR_NCR_TANDI_JOB_ACCEPT', 1);
      q.setGvar('GVAR_NCR_V15_DARION_DEAL', 1);
      const tandi = q.world.map.objects.find((x) => x.id === TANDI)!;
      const r = q.talk(tandi, [/squatters/, /^./, /^./, /^./, /^./]);
      expect(r.started).toBe(true);
      expect(r.history.join('\n')).toMatch(/fair pay/);
      expect(q.gvar('GVAR_V15_NCR_DEAL')).toBe(2);
      expect(q.problems(mark)).toEqual([]);
    } finally {
      await q.close();
    }
  }, 120_000);

  it('Tandi po rozliczeniu: kolejna rozmowa przechodzi bez bledow VM, bez XP, GVAR_V15_NCR_DEAL zostaje 2', async () => {
    const q = await boot();
    try {
      await q.enter('NCR2');
      q.setGvar('GVAR_NCR_TANDI_JOB_ACCEPT', 1);
      q.setGvar('GVAR_NCR_V15_DARION_DEAL', 1);
      const tandi = q.world.map.objects.find((x) => x.id === TANDI)!;
      q.talk(tandi, [/squatters/, /^./, /^./, /^./, /^./]);
      expect(q.gvar('GVAR_V15_NCR_DEAL')).toBe(2);
      const mark = q.logMark();
      const x0 = q.xp();
      const r = q.talk(tandi, [/^./, /^./, /^./]);
      expect(r.started).toBe(true);
      expect(q.gvar('GVAR_V15_NCR_DEAL')).toBe(2);
      expect(q.xp() - x0).toBe(0);
      expect(q.problems(mark)).toEqual([]);
    } finally {
      await q.close();
    }
  }, 120_000);
});
