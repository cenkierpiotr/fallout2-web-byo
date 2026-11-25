/**
 * Headless playthrough, Klamath: nagroda za uratowanie Smileya od Ardin Buckner (skrypt kcardin): 100 kapsli albo
 * darowanie dlugu Sulika (GVAR_ARDIN_FREEDOM), potem Maida uwalnia Sulika (GVAR_SULIK_FREE) i
 * Sulik dolacza. Opis: dokumentacja techniczna czesc 10.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { boot, GAME_DIR, type Playthrough } from './harness.js';

const ARDIN = 728;
/** Maida (kontakt w lazni/hotelu): jej skrypt ustawia SULIK_FREE po darowaniu dlugu przez Ardin. */
const MAIDA = 88;
const SULIK = 268435482;
const CAPS = 0x29;
/** Pierwsza rozmowa: Ardin prosi o odnalezienie Smileya (lokalna zmienna "zadanie przyjete" + status 1). */
const ACCEPT = [0, 0, 0, 0, 0, 0];

describe.skipIf(!GAME_DIR)('playthrough: Klamath, nagroda Ardin za Smileya (headless)', () => {
  let p: Playthrough;
  beforeEach(async () => {
    p = await boot();
    await p.enter('KLADWTWN');
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
  /** Przyjecie questa od Ardin, potem "Smiley uratowany" (status 3 ustawia skrypt Toxic Caves/powrot do Klamath). */
  const rescued = () => {
    p.talk(byId(ARDIN), ACCEPT);
    expect(p.gvar('GVAR_SMILEY_STATUS')).toBe(1);
    p.setGvar('GVAR_SMILEY_STATUS', 3);
  };

  it('bez przyjetego questa Ardin nie wyplaca nagrody mimo statusu 3 (zaczyna od prosby o Smileya)', () => {
    p.setGvar('GVAR_SMILEY_STATUS', 3);
    const mark = p.logMark();
    const r = p.talk(byId(ARDIN), [0]);
    expect(text(r)).toMatch(/Hello there. My name.s Ardin/);
    expect(text(r)).not.toMatch(/found my Smiley/);
    expect(p.gvar('GVAR_ARDIN_FREEDOM')).toBe(0);
    expect(p.problems(mark)).toEqual([]);
  }, 120_000);

  it('nagroda pieniezna: +$100, bez darowania dlugu, nie powtarza sie przy kolejnej rozmowie', () => {
    rescued();
    const mark = p.logMark();
    const c0 = p.count(CAPS);
    const xp0 = p.xp();
    const r = p.talk(byId(ARDIN), [0, /money is always/, /Thanks Ms. Buckner/]);
    expect(text(r)).toMatch(/found my Smiley/);
    expect(text(r)).toMatch(/here.s \$100/);
    expect(p.count(CAPS) - c0).toBe(100);
    expect(p.xp()).toBe(xp0);
    expect(p.gvar('GVAR_ARDIN_FREEDOM')).toBe(0);
    expect(p.problems(mark)).toEqual([]);
    const again = p.talk(byId(ARDIN), [0]);
    expect(text(again)).not.toMatch(/found my Smiley|\$100/);
    expect(p.count(CAPS) - c0).toBe(100);
    expect(p.gvar('GVAR_SMILEY_STATUS')).toBe(3);
  }, 120_000);

  it('nagroda dlug Sulika: ARDIN_FREEDOM=1, bez kapsli; Maida uwalnia Sulika (SULIK_FREE=1)', () => {
    rescued();
    const mark = p.logMark();
    const c0 = p.count(CAPS);
    expect(p.gvar('GVAR_SULIK_FREE')).toBe(0);
    const r = p.talk(byId(ARDIN), [0, /debt paid/, /Thank-you/]);
    expect(text(r)).toMatch(/talk to Maida/);
    expect(p.gvar('GVAR_ARDIN_FREEDOM')).toBe(1);
    expect(p.count(CAPS)).toBe(c0);
    // sam Ardin jeszcze nie uwalnia Sulika, robi to dopiero rozmowa z Maida
    expect(p.gvar('GVAR_SULIK_FREE')).toBe(0);
    const m = p.talk(byId(MAIDA), [0, 0, 0, 0, 0, 0]);
    expect(m.started).toBe(true);
    expect(p.gvar('GVAR_SULIK_FREE')).toBe(1);
    expect(p.problems(mark)).toEqual([]);
  }, 120_000);

  it('Maida bez darowania dlugu nie uwalnia Sulika', () => {
    const mark = p.logMark();
    p.talk(byId(MAIDA), [0, 0, 0, 0, 0, 0]);
    expect(p.gvar('GVAR_SULIK_FREE')).toBe(0);
    expect(p.problems(mark)).toEqual([]);
  }, 120_000);

  it('po calej sciezce Sulik dolacza do druzyny', () => {
    rescued();
    p.talk(byId(ARDIN), [0, /debt paid/, /Thank-you/]);
    p.talk(byId(MAIDA), [0, 0, 0, 0, 0, 0]);
    const mark = p.logMark();
    const before = p.rt.inventory.party.size;
    p.talk(byId(SULIK), [
      /Tell me about yourself/,
      /come with me/,
      /nice to travel with you/,
      /OK, Sulik/,
    ]);
    expect(p.rt.inventory.party.size).toBe(before + 1);
    expect(p.problems(mark)).toEqual([]);
  }, 120_000);
});
