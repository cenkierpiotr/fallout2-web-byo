/**
 * Headless playthrough, Broken Hills: zlecenie Zaiusa (broken2, hcZaius) na naprawe oczyszczacza powietrza w kopalni.
 * GVAR_BH_MINE: 1 pierwsza rozmowa, 3 = zlecenie za $500 (zaliczka $250), 4 = zlecenie za darmo, 5/6 = czesci od
 * Renesco (New Reno, ncRenesc, INT wysokie), 7/8 = oczyszczacz naprawiony (broken2 elev 2, hspurify, 1500 XP),
 * 9 = nagroda odebrana. Opis: dokumentacja techniczna czesc 9.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { boot, GAME_DIR, type Playthrough } from './harness.js';

const ZAIUS = 151;
const PURIFIER = 18;
const RENESCO = 292;
const PARTS = 0x1a3;
const COMBAT_SHOTGUN = 0xf2;

describe.skipIf(!GAME_DIR)('playthrough: Broken Hills, kopalnia Zaiusa (headless)', () => {
  let p: Playthrough;
  let mark: number;
  beforeEach(async () => {
    p = await boot();
    await p.enter('broken2');
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

  it('pierwsza rozmowa z Zaiusem: oferta pracy ustawia BH_MINE=1, bez XP', () => {
    const r = p.talk(byId(ZAIUS), [0]);
    expect(r.history.join('\n')).toMatch(/air purifier/);
    expect(p.gvar('GVAR_BH_MINE')).toBe(1);
    expect(p.xp()).toBe(0);
    expect(p.problems(mark)).toEqual([]);
  });

  it('zlecenie za darmo: BH_MINE=4, wskazuje Renesco, bez zaliczki', () => {
    p.setGvar('GVAR_BH_MINE', 1);
    const r = p.talk(byId(ZAIUS), [/trouble/, /all right/, /Sure, I.ll do it/, 0]);
    expect(r.history.join('\n')).toMatch(/Renesco/);
    expect(p.gvar('GVAR_BH_MINE')).toBe(4);
    expect(caps()).toBe(0);
  });

  it('zlecenie za $500: negocjacja do limitu, BH_MINE=3, zaliczka $250', () => {
    p.setGvar('GVAR_BH_MINE', 1);
    const r = p.talk(byId(ZAIUS), [
      /trouble/,
      /all right/,
      /in it for me/,
      /more/,
      /I.ll take it/,
      0,
    ]);
    expect(r.history.join('\n')).toMatch(/\$500/);
    expect(p.gvar('GVAR_BH_MINE')).toBe(3);
    expect(caps()).toBe(250);
  });

  it('Renesco (INT 9, haslo "canary"): czesci 0x1a3 za darmo, BH_MINE 4 -> 6', async () => {
    await p.enter('newr3');
    p.setStat(4, 9);
    p.setGvar('GVAR_BH_MINE', 4);
    const m = p.logMark();
    p.talk(byId(RENESCO), [
      /Who are you/,
      /let your comment slide/,
      /mine parts/,
      /canary/,
      /And\?/,
      /Second part/,
      0,
    ]);
    expect(p.count(PARTS)).toBe(1);
    expect(p.gvar('GVAR_BH_MINE')).toBe(6);
    expect(p.problems(m)).toEqual([]);
  });

  it('naprawa oczyszczacza czesciami: 1500 XP, rep miasta +10, czesci zuzyte, BH_MINE=8', async () => {
    p.setGvar('GVAR_BH_MINE', 6);
    await p.give(PARTS);
    const rep0 = p.gvar('GVAR_TOWN_REP_BROKEN_HILLS');
    const r = p.useOn(PARTS, byId(PURIFIER));
    expect(r.error).toBe(false);
    expect(p.xp()).toBe(1500);
    expect(p.gvar('GVAR_TOWN_REP_BROKEN_HILLS') - rep0).toBe(10);
    expect(p.count(PARTS)).toBe(0);
    expect(p.gvar('GVAR_BH_MINE')).toBe(8);
    expect(p.problems(mark)).toEqual([]);
  });

  it('nagroda Zaiusa po naprawie: combat shotgun, BH_MINE=9, reputacja +20', async () => {
    p.setGvar('GVAR_BH_MINE', 6);
    await p.give(PARTS);
    p.useOn(PARTS, byId(PURIFIER));
    const rep0 = p.gvar('GVAR_PLAYER_REPUTATION');
    const r = p.talk(byId(ZAIUS), [0]);
    expect(r.history.join('\n')).toMatch(/combat shotgun/);
    expect(p.count(COMBAT_SHOTGUN)).toBe(1);
    expect(p.gvar('GVAR_BH_MINE')).toBe(9);
    expect(p.gvar('GVAR_PLAYER_REPUTATION') - rep0).toBe(20);
    expect(p.xp()).toBe(1500);
  });

  it('zlecenie platne: po naprawie Zaius doplaca druga polowe ($250), bez strzelby', async () => {
    p.setGvar('GVAR_BH_MINE', 3);
    await p.give(PARTS);
    await p.give(0x29, 250);
    p.useOn(PARTS, byId(PURIFIER));
    expect(p.gvar('GVAR_BH_MINE')).toBe(7);
    const c0 = caps();
    const r = p.talk(byId(ZAIUS), [0]);
    expect(r.history.join('\n')).toMatch(/remainder/);
    expect(caps() - c0).toBe(250);
    expect(p.count(COMBAT_SHOTGUN)).toBe(0);
    expect(p.xp()).toBe(1500);
  });
});
