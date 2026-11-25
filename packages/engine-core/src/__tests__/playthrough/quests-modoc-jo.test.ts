/**
 * Headless playthrough, Modoc: Jo (trading post) i zlecenie "Ghost Farm" (stan rozmowy Jo siedzi w
 * GVAR_MODOC_VERMIN_HUNTER_SEED: 1 = odprawa, 4 = zlecenie przyjete; GVAR_MODOC_GHOST_SEED_PIP=1 = wpis w Pip-Boyu), pies Laddie. Opis: dokumentacja techniczna czesc 9.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { boot, GAME_DIR, type Playthrough } from './harness.js';

const JO = 268435471;
const LADDIE = 72;
const GHOST_PATH = [
  /who says I.m here to trade/,
  /holy GECK/,
  /What do you want for this information/,
  /make it rain/,
  /listening/,
  /overnight/,
  /Go on/,
  /Hmm/,
  /What happened to him/,
];

describe.skipIf(!GAME_DIR)('playthrough: Modoc, Jo i Ghost Farm (headless)', () => {
  let p: Playthrough;
  let mark: number;
  beforeEach(async () => {
    p = await boot();
    await p.enter('modmain');
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
  const text = (r: { history: string[] }) => r.history.join('\n');

  it('Jo: ostra odpowiedz na pytanie o GECK konczy rozmowe (VERMIN_HUNTER_SEED=1), bez XP', () => {
    const r = p.talk(byId(JO), [
      /who says I.m here to trade/,
      /holy GECK/,
      /Just tell me where/,
      0,
    ]);
    expect(text(r)).toMatch(/chip on yer shoulder/);
    expect(p.gvar('GVAR_MODOC_VERMIN_HUNTER_SEED')).toBe(1);
    expect(p.xp()).toBe(0);
    expect(p.problems(mark)).toEqual([]);
  });

  it('Jo: zlecenie Ghost Farm, odmowa wspolnego sluzenia (pinky), przyjecie zlecenia', () => {
    const r = p.talk(byId(JO), [
      ...GHOST_PATH,
      /let me guess/,
      /What do I get out of this/,
      /Cut off your right pinky/,
      /do it anyway/,
      /Bye/,
    ]);
    expect(text(r)).toMatch(/not going to cut my finger off/);
    expect(text(r)).toMatch(/day.s travel northeast/);
    expect(p.xp()).toBe(0);
    expect(p.problems(mark)).toEqual([]);
    expect(p.gvar('GVAR_MODOC_VERMIN_HUNTER_SEED')).toBe(4);
    expect(p.gvar('GVAR_MODOC_GHOST_SEED_PIP')).toBe(1);
  });

  it('Laddie: pies reaguje na glaskanie, bez bledow VM', () => {
    const r = p.talk(byId(LADDIE), [/Nice doggie/, 0]);
    expect(text(r)).toMatch(/starts to lick your face/);
    expect(p.problems(mark)).toEqual([]);
  });
});
