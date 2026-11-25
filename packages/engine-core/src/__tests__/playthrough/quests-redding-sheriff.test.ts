/**
 * Headless playthrough, Redding: szeryf Earl Marion (reddown, rcmarion) i Widow Rooney (rcrooney).
 * Zlecenia szeryfa wymagaja wysokiego poziomu PC (get_pc_stat 1, wyliczany z XP). GVAR_WIDOW_ROONEY: 1 przyjete,
 * 3 = czynsz zaplacony ($120, +1500 XP, rep +25, TOWN_REP_REDDING +5), potem szeryf placi $100 i daje nastepne
 * zlecenie (GVAR_BAR_BRAWL). Opis: dokumentacja techniczna czesc 9.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { boot, GAME_DIR, type Playthrough } from './harness.js';

const MARION = 268435487;
const ROONEY = 130;
const CAPS = 0x29;
const BADGE = 0x1bd;
const ACCEPT = [
  /As the Sheriff/,
  /hard to do/,
  /need some help/,
  /How can I help/,
  /How much/,
  /I.ll do it/,
  0,
];

describe.skipIf(!GAME_DIR)('playthrough: Redding, szeryf Marion (headless)', () => {
  let p: Playthrough;
  let mark: number;
  beforeEach(async () => {
    p = await boot();
    await p.enter('reddown');
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

  it('poziom 1: szeryf odmawia pracy ("too tough"), bez GVAR i odznaki', () => {
    const r = p.talk(byId(MARION), [/As the Sheriff/, /hard to do/, /need some help/]);
    expect(r.history.join('\n')).toMatch(/too tough for you/);
    expect(p.gvar('GVAR_WIDOW_ROONEY')).toBe(0);
    expect(p.count(BADGE)).toBe(0);
  });

  it('get_pc_stat(poziom) rosnie z XP (regresja: stat byl na stale 1)', () => {
    const batch4 = (p.rt as unknown as { batch4: { pcStat(s: number): number } }).batch4;
    expect(batch4.pcStat(1)).toBe(1);
    p.rt.pcExperience = 999;
    expect(batch4.pcStat(1)).toBe(1);
    p.rt.pcExperience = 1000;
    expect(batch4.pcStat(1)).toBe(2);
    p.rt.pcExperience = 45000;
    expect(batch4.pcStat(1)).toBe(10);
  });

  it('wysoki poziom: zlecenie Rooney przyjete, WIDOW_ROONEY=1 i odznaka szeryfa', () => {
    p.rt.pcExperience = 45000;
    const r = p.talk(byId(MARION), ACCEPT);
    expect(r.history.join('\n')).toMatch(/Widow Rooney is way behind on her rent/);
    expect(p.gvar('GVAR_WIDOW_ROONEY')).toBe(1);
    expect(p.count(BADGE)).toBe(1);
    expect(p.problems(mark)).toEqual([]);
  });

  it('zaplata czynszu Rooney: +1500 XP, rep +25, TOWN_REP +5, $100 od szeryfa i nastepne zlecenie', async () => {
    p.rt.pcExperience = 45000;
    await p.give(CAPS, 120);
    p.talk(byId(MARION), ACCEPT);
    const repBefore = p.gvar('GVAR_PLAYER_REPUTATION');
    const townBefore = p.gvar('GVAR_TOWN_REP_REDDING');
    const xp0 = p.xp();
    const r = p.talk(byId(ROONEY), [
      /bad news/,
      /Ascorti\? Who/,
      /that. Ascorti/,
      /How much do you owe/,
      /pay your back rent/,
      /Here.s the/,
      0,
      0,
    ]);
    expect(r.history.join('\n')).toMatch(/\$120 you need/);
    expect(p.gvar('GVAR_WIDOW_ROONEY')).toBe(3);
    expect(caps()).toBe(0);
    expect(p.xp() - xp0).toBe(1500);
    expect(p.gvar('GVAR_PLAYER_REPUTATION') - repBefore).toBe(25);
    expect(p.gvar('GVAR_TOWN_REP_REDDING') - townBefore).toBe(5);

    const m = p.talk(byId(MARION), [0, 0, 0, 0]);
    expect(m.history.join('\n')).toMatch(/real nice thing for the Widow Rooney/);
    expect(caps()).toBe(100);
    expect(p.gvar('GVAR_BAR_BRAWL')).toBe(1);
    expect(p.problems(mark)).toEqual([]);
  });
});
