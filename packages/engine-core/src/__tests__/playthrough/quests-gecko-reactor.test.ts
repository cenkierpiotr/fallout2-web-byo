/**
 * Headless playthrough, Gecko: terminal robota przy reaktorze (kod, menu, program polecen, ruch robota).
 * Pelna sciezka naprawy/awarii (GVAR_GECKO_MELTDOWN) poza zakresem, patrz dokumentacja techniczna
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, GAME_DIR, type Playthrough } from './harness.js';

const TERMINAL = 268435461;
const ROBOT = 268435460;

describe.skipIf(!GAME_DIR)('playthrough: Gecko, terminal robota (headless)', () => {
  let p: Playthrough;
  beforeAll(async () => {
    p = await boot();
    await p.enter('GECKPWPL');
  }, 120_000);
  afterAll(async () => {
    await p?.close();
  });
  const byId = (id: number) => {
    const o = p.world.map.objects.find((x) => x.id === id);
    expect(o, `brak obiektu ${id}`).toBeDefined();
    return o!;
  };

  it('kod dostepu, program polecen i wykonanie przesuwaja robota bez bledow VM', () => {
    const mark = p.logMark();
    const bot = byId(ROBOT);
    const hex0 = bot.hex;
    const r = p.talk(byId(TERMINAL), [
      /Initialize/,
      /A1546761/,
      /5B576005/,
      /35C76863/,
      /Coolant/,
      /lot easier/,
      /more of it works/,
      /ready to get started/,
      /Add a command/,
      /Calibrate/,
      /END PROGRAM/,
      /Execute program/,
    ]);
    expect(r.started).toBe(true);
    p.tick(3000);
    expect(bot.hex).not.toBe(hex0);
    expect(p.problems(mark)).toEqual([]);
  });
});
