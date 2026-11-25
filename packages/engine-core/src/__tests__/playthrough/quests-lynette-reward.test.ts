/**
 * Headless playthrough, Vault City (VCTYCOCL): nagroda Lynette za dostarczenie holodysku (pid 0x152 = 338),
 * wezel GET_LYNETTE_REWARD. Trasa dialogu: "holo disk" -> "delivered the disk" -> "Postman" -> "good news".
 * Nagroda 1500 XP (GVAR_VAULT_GET_LYNETTE_REWARD=1, RAIDERS=7, reputacja +5, dysk znika) lub 2500 XP gdy
 * CH>7 i zmienna lokalna 8 > 10 (obywatelstwo: CITIZEN=5, CITIZENSHIP=1, reputacja +10 poza +5 za dysk).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { boot, GAME_DIR, type Playthrough } from './harness.js';

const LYNETTE = 18;
const DISK = 338;
const ROUTE = [
  /another question|holo disk/,
  /holo disk|delivered the disk/,
  /delivered the disk|Postman/,
  /Postman|good news/,
  /good news/,
];

describe.skipIf(!GAME_DIR)('playthrough: Vault City, nagroda Lynette (headless)', () => {
  let p: Playthrough;
  beforeEach(async () => {
    p = await boot();
    await p.enter('VCTYCOCL');
    const npc = p.world.map.objects.find((x) => x.id === LYNETTE)!;
    p.talk(npc, [/don.t have time/]);
    p.setGvar('GVAR_VAULT_CITIZENSHIP', 1);
    p.setGvar('GVAR_VAULT_CITIZEN', 4);
    p.setGvar('GVAR_VAULT_DELIVER_HOLODISK', 3);
    await p.give(DISK);
  }, 120_000);
  afterEach(async () => {
    await p?.close();
  });
  const npc = () => p.world.map.objects.find((x) => x.id === LYNETTE)!;
  /**
   * Reakcja Lynette jest losowana przy kazdej rozmowie (wezel "What is it?!" vs "Yes? What is it?"), a rng
   * harnessu jest wspolny i zalezy od liczby wczesniejszych losowan (np. critter_p_proc innych NPC). Powtarzamy
   * rozmowe, az dojdzie do nagrody (max 12 prob), zamiast polegac na szczesliwym ziarnie.
   */
  const claim = () => {
    let r = p.talk(npc(), ROUTE);
    for (let i = 0; i < 12 && p.gvar('GVAR_VAULT_GET_LYNETTE_REWARD') !== 1; i++) {
      r = p.talk(npc(), ROUTE);
    }
    return r;
  };

  it('podstawowa nagroda: +1500 XP, dysk znika, reputacja +5', () => {
    const mark = p.logMark();
    const rep0 = p.gvar('GVAR_TOWN_REP_VAULT_CITY');
    const x0 = p.xp();
    expect(p.count(DISK)).toBe(1);
    const r = claim();
    expect(r.started).toBe(true);
    expect(p.xp() - x0).toBe(1500);
    expect(p.count(DISK)).toBe(0);
    expect(p.gvar('GVAR_VAULT_GET_LYNETTE_REWARD')).toBe(1);
    expect(p.gvar('GVAR_VAULT_RAIDERS')).toBe(7);
    expect(p.gvar('GVAR_TOWN_REP_VAULT_CITY')).toBe(rep0 + 5);
    expect(p.problems(mark)).toEqual([]);
  });

  it('podwojna nagroda: CH>7 i zmienna lokalna 8 > 10 daje 2500 XP i obywatelstwo', () => {
    const mark = p.logMark();
    p.setStat(3, 9);
    const e = p.rt.scheduler.all().find((x) => x.ownerObjectId === LYNETTE)!;
    e.localVars[8] = 12;
    const rep0 = p.gvar('GVAR_TOWN_REP_VAULT_CITY');
    const x0 = p.xp();
    claim();
    expect(p.xp() - x0).toBe(2500);
    expect(p.count(DISK)).toBe(0);
    expect(p.gvar('GVAR_VAULT_CITIZEN')).toBe(5);
    expect(p.gvar('GVAR_VAULT_CITIZENSHIP')).toBe(1);
    expect(p.gvar('GVAR_TOWN_REP_VAULT_CITY')).toBe(rep0 + 15); // +5 za dysk i +10 za obywatelstwo
    expect(p.problems(mark)).toEqual([]);
  });

  it('bez dostarczenia (DELIVER_HOLODISK != 3) rozmowa nie daje nagrody', () => {
    p.setGvar('GVAR_VAULT_DELIVER_HOLODISK', 0);
    const x0 = p.xp();
    p.talk(npc(), ROUTE);
    expect(p.xp() - x0).toBe(0);
    expect(p.count(DISK)).toBe(1);
  });
});
