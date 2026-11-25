/**
 * Headless playthrough, Tanker (San Francisco): lancuch zlecenia "spleen" (Chip na tankowcu -> Lao Chou w Chinatown),
 * a w Steel Palace Ken Lee i test na vertibird (Shi). Opis: dokumentacja techniczna czesc 15.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { boot, GAME_DIR, type Playthrough } from './harness.js';

const CHIP = 132;
const LAO_CHOU = 22;

describe.skipIf(!GAME_DIR)('playthrough: Tanker, spleen (headless)', () => {
  let p: Playthrough;
  afterEach(async () => {
    await p?.close();
  });
  const byId = (id: number) => {
    const o = p.world.map.objects.find((x) => x.id === id);
    expect(o, `brak obiektu ${id}`).toBeDefined();
    return o!;
  };

  it('Chip: opowiesc o sprzedanej nerce (SPLEEN=1, SPLEEN_TIME=302400)', async () => {
    p = await boot();
    p.setStat(4, 8);
    await p.enter('sftanker');
    const mark = p.logMark();
    expect(p.gvar('GVAR_SAN_FRAN_SPLEEN')).toBe(0);
    const r = p.talk(byId(CHIP), [
      /What.s the matter with you/,
      /You SOLD your spleen/,
      /take a look for it/,
    ]);
    expect(r.history.join('\n')).toMatch(/spleen/i);
    expect(p.gvar('GVAR_SAN_FRAN_SPLEEN')).toBe(1);
    expect(p.gvar('GVAR_SAN_FRAN_SPLEEN_TIME')).toBe(302400);
    expect(p.problems(mark)).toEqual([]);
  }, 120_000);

  it('Lao Chou: przy SPLEEN=1 wskazuje Dr. Wonga w Steel Palace (SPLEEN=2)', async () => {
    p = await boot();
    p.setStat(4, 8);
    await p.enter('sfchina');
    p.setGvar('GVAR_SAN_FRAN_SPLEEN', 1);
    const mark = p.logMark();
    const r = p.talk(byId(LAO_CHOU), [2, 0, 1, 0]);
    expect(r.history.join('\n')).toMatch(/Dr\. Wong/);
    expect(p.gvar('GVAR_SAN_FRAN_SPLEEN')).toBe(2);
    expect(p.problems(mark)).toEqual([]);
  }, 120_000);

  it('Lao Chou: bez zlecenia (SPLEEN=0) nie przesuwa stanu zlecenia', async () => {
    p = await boot();
    p.setStat(4, 8);
    await p.enter('sfchina');
    const mark = p.logMark();
    p.talk(byId(LAO_CHOU), [2, 0, 1]);
    expect(p.gvar('GVAR_SAN_FRAN_SPLEEN')).toBe(0);
    expect(p.problems(mark)).toEqual([]);
  }, 120_000);
});
