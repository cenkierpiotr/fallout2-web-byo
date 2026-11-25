/**
 * Headless playthrough, Vault 15 / Squat (v15ent, v15sent): Chrissy (ucieczka z krypty), Rebecca (nagroda), Zeke, Dalia, Phil.
 * GVAR_V15_SEED_STATUS: 16 = Chrissy zgodzila sie isc z graczem, 20 = Rebecca podziekowala (nagroda).
 * Opis: dokumentacja techniczna czesc 9.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { boot, GAME_DIR, type Playthrough } from './harness.js';

const ZEKE = 984;
const DALIA = 268435456;
const CHRISSY = 59;
const REBECCA = 162;

describe.skipIf(!GAME_DIR)('playthrough: Vault 15, Squat (headless)', () => {
  let p: Playthrough;
  let mark: number;
  beforeEach(async () => {
    p = await boot();
    await p.enter('v15ent');
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

  it('Chrissy: opowiada o sekretnym wejsciu, zgoda na odprowadzenie ustawia SEED_STATUS=16, bez XP', () => {
    const r = p.talk(byId(CHRISSY), [
      /Bow tie/,
      /don.t hurt me/,
      /who you are/,
      0,
      0,
      /take you home/,
      0,
    ]);
    expect(text(r)).toMatch(/secret entrance into Vault 15/);
    expect(text(r)).toMatch(/Will you take me home/);
    expect(p.gvar('GVAR_V15_SEED_STATUS')).toBe(16);
    expect(p.xp()).toBe(0);
    expect(p.problems(mark)).toEqual([]);
  });

  it('Rebecca bez uratowanej corki: prosi o rozmowe w cztery oczy, bez nagrody', () => {
    const r = p.talk(byId(REBECCA), [/not interested/]);
    expect(text(r)).toMatch(/talk privately/);
    expect(p.xp()).toBe(0);
    expect(p.gvar('GVAR_V15_SEED_STATUS')).toBe(0);
    expect(p.problems(mark)).toEqual([]);
  });

  it('Rebecca po ucieczce Chrissy (SEED_STATUS=16): 2500 XP, rep +20, rep Vault 15 +10, SEED_STATUS=20', () => {
    p.setGvar('GVAR_V15_SEED_STATUS', 16);
    const rep0 = p.gvar('GVAR_PLAYER_REPUTATION');
    const r = p.talk(byId(REBECCA), [0, 0]);
    expect(text(r)).toMatch(/saved my daughter/);
    expect(p.xp()).toBe(2500);
    expect(p.gvar('GVAR_PLAYER_REPUTATION') - rep0).toBe(20);
    expect(p.gvar('GVAR_TOWN_REP_VAULT_15')).toBe(10);
    expect(p.gvar('GVAR_V15_SEED_STATUS')).toBe(20);
    expect(p.gvar('GVAR_V15_CRISSY_QUEST')).toBe(2);
    expect(p.problems(mark)).toEqual([]);
  });

  it('nagroda Rebecki tylko raz: kolejna rozmowa nie daje XP', () => {
    p.setGvar('GVAR_V15_SEED_STATUS', 16);
    p.talk(byId(REBECCA), [0, 0]);
    const xp1 = p.xp();
    const rep1 = p.gvar('GVAR_TOWN_REP_VAULT_15');
    p.talk(byId(REBECCA), [0, 0, 0]);
    expect(p.xp()).toBe(xp1);
    expect(p.gvar('GVAR_TOWN_REP_VAULT_15')).toBe(rep1);
    expect(p.problems(mark)).toEqual([]);
  });

  it('Zeke: przed ucieczka Chrissy odsyla gracza, po niej przeprasza i odpowiada na pytania', () => {
    const cold = p.talk(byId(ZEKE), [/leave/]);
    expect(text(cold)).toMatch(/don.t have time to talk to you/);
    p.setGvar('GVAR_V15_SEED_STATUS', 20);
    const warm = p.talk(byId(ZEKE), [/some questions/, /work for Darion/, /I see/]);
    expect(text(warm)).toMatch(/apologize for the treatment/);
    expect(text(warm)).toMatch(/middle man/);
    expect(p.xp()).toBe(0);
    expect(p.problems(mark)).toEqual([]);
  });

  it('Dalia: pierwsza rozmowa ustawia DALIA_STATE=4, prosi o odejscie', () => {
    const r = p.talk(byId(DALIA), [/just saying hello/, /talk to you/, /Who are you/, /leave/]);
    expect(text(r)).toMatch(/I.m Dalia/);
    expect(p.gvar('GVAR_V13_V15_DALIA_STATE')).toBe(4);
    expect(p.xp()).toBe(0);
    expect(p.problems(mark)).toEqual([]);
  });

  it('Phil (v15sent, straznik wejscia): grozi, nie daje XP ani zmian reputacji', async () => {
    await p.enter('v15sent');
    const m = p.logMark();
    const phil = p.world.map.objects.find((o) => o.id === 74)!;
    const r = p.talk(phil, [/wrong trail/, 0]);
    expect(text(r)).toMatch(/feet first, in a box/);
    expect(p.xp()).toBe(0);
    expect(p.problems(m)).toEqual([]);
  });
});
