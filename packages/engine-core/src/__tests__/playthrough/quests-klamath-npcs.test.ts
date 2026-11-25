/**
 * Headless playthrough, Klamath: Slim Picket (klucz do polnocnej czesci), Sulik (towarzysz), Smiley (jaskinie
 * toksyczne), Sally Dunton (lazni, platnosc), Sajag (karczma). Opis: dokumentacja techniczna czesc 9.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { boot, GAME_DIR, type Playthrough } from './harness.js';

const CAPS = 0x29;
const KEY = 0x12a;
const SLIM = 92;
const SULIK = 268435482;
const SALLY = 72;
const SAJAG = 80;
const SMILEY = 278;

describe.skipIf(!GAME_DIR)('playthrough: Klamath, NPC-e (headless)', () => {
  let p: Playthrough;
  beforeEach(async () => {
    p = await boot();
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
  const text = (r: { history: string[] }) => r.history.join('\n');

  it('Slim Picket (klamall): klucz 0x12a za "chce zwiedzac", bez XP', async () => {
    await p.enter('klamall');
    const mark = p.logMark();
    const r = p.talk(byId(SLIM), [
      /Why do you call this/,
      /Rats\?/,
      /rat attacks/,
      /do you have a key/,
      /explorer/,
      /Goodbye/,
    ]);
    expect(text(r)).toMatch(/here.s the key/);
    expect(p.count(KEY)).toBe(1);
    expect(p.xp()).toBe(0);
    expect(p.problems(mark)).toEqual([]);
  }, 120_000);

  const SLIM_BASE = [/Why do you call this/, /Rats\?/, /rat attacks/, /do you have a key/];

  it('Slim Picket: klucz tez za deklaracje pomocy przy szczurach', async () => {
    await p.enter('klamall');
    p.talk(byId(SLIM), [...SLIM_BASE, /help you with your rat problem/, /Goodbye/]);
    expect(p.count(KEY)).toBe(1);
  }, 120_000);

  it('Slim Picket: bez klucza gdy gracz rezygnuje', async () => {
    await p.enter('klamall');
    p.talk(byId(SLIM), [...SLIM_BASE, /wouldn.t want a key/, 0]);
    expect(p.count(KEY)).toBe(0);
  }, 120_000);

  it('Sulik (Klamath): gdy uwolniony dolacza do druzyny, bez bledow VM', async () => {
    await p.enter('kladwtwn');
    p.setGvar('GVAR_SULIK_FREE', 1);
    const mark = p.logMark();
    const before = p.rt.inventory.party.size;
    const r = p.talk(byId(SULIK), [
      /Tell me about yourself/,
      /come with me/,
      /nice to travel with you/,
      /OK, Sulik/,
    ]);
    expect(text(r)).toMatch(/Grampy Bone/);
    expect(p.rt.inventory.party.size).toBe(before + 1);
    expect(p.problems(mark)).toEqual([]);
  }, 120_000);

  it('Sally Dunton: Hand Wipe za $25 z ekwipunku', async () => {
    await p.enter('kladwtwn');
    await p.give(CAPS, 100);
    const mark = p.logMark();
    const c0 = caps();
    const r = p.talk(byId(SALLY), [
      /special, attended baths/,
      /live girl/,
      /Hand Wipe/,
      /bargain/,
      0,
    ]);
    expect(text(r)).toMatch(/\$25/);
    expect(c0 - caps()).toBe(25);
    expect(p.problems(mark)).toEqual([]);
  }, 120_000);

  it('Sally Dunton bez pieniedzy: odmowa, kapsle bez zmian', async () => {
    await p.enter('kladwtwn');
    const r = p.talk(byId(SALLY), [
      /special, attended baths/,
      /live girl/,
      /Hand Wipe/,
      /bargain/,
      0,
    ]);
    expect(text(r)).toMatch(/don.t have enough money/);
    expect(caps()).toBe(0);
  }, 120_000);

  it('Sajag (Golden Gecko): bez pieniedzy odmawia drinka', async () => {
    await p.enter('kladwtwn');
    const mark = p.logMark();
    const r = p.talk(byId(SAJAG), [/have a drink/, 0]);
    expect(text(r)).toMatch(/No credit here/);
    expect(p.problems(mark)).toEqual([]);
  }, 120_000);

  it('Smiley (klatoxcv): ranny trapper prosi o eskorte do Klamath, rozmowa bez bledow VM', async () => {
    await p.enter('klatoxcv');
    const mark = p.logMark();
    const r = p.talk(byId(SMILEY), [/doing here/, 0, 0, 0, /join me/]);
    expect(text(r)).toMatch(/golden geckos/);
    expect(text(r)).toMatch(/Ardin/);
    expect(p.problems(mark)).toEqual([]);
  }, 120_000);
});
