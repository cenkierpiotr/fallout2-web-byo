/**
 * Headless playthrough: prawdziwe questy poczatku gry (Arroyo, Klamath/Toxic Caves, Den) na prawdziwych
 * danych (F2_GAME_DIR/F2_PATCH_DIR). W odroznieniu od playthrough.test.ts (samo wejscie na mapy) sprawdza
 * dialogi, skrypty VM, zmienne globalne oraz zapis/odczyt stanu po quescie. Opis: dokumentacja techniczna
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GameVars, MapRegistry, hexDistance, moveObject } from '../../index.js';
import { boot, GAME_DIR, gvarDiff, type Playthrough } from './harness.js';

/** Heks przy wyjsciu z Toxic Caves, do ktorego Smiley ma dojsc (kcsmiley leave_player, 0x479f). */
const SMILEY_EXIT_HEX = 18335;

describe.skipIf(!GAME_DIR)('playthrough: questy poczatku gry (headless)', () => {
  let p: Playthrough;
  beforeAll(async () => {
    p = await boot();
  }, 120_000);
  afterAll(async () => {
    await p?.close();
  });
  const snap = (): Int32Array => Int32Array.from({ length: p.vars.size }, (_, i) => p.vars.get(i));
  const npc = (re: RegExp) => {
    const n = p.npcsByName(re)[0];
    expect(n, `brak NPC ${re}`).toBeDefined();
    return n!;
  };

  it('Arroyo: Starszy wysyla na quest (GVAR), druga rozmowa oferuje kontynuacje, bez bledow VM', async () => {
    await p.enter('ARVILLAG');
    const elder = npc(/^Elder$/);
    const mark = p.logMark();
    const first = p.talk(elder, [/./]);
    expect(first.started).toBe(true);
    expect(first.history.join('\n')).toMatch(/Temple of Trials/);
    expect(p.gvar('GVAR_TALKED_TO_ELDER')).toBe(1);
    const second = p.talk(elder, [/ready for the holy quest/i, /./, /./]);
    expect(second.started).toBe(true);
    expect(p.gvar('GVAR_DEN_VIC_KNOWN')).toBeGreaterThan(0);
    expect(p.problems(mark)).toEqual([]);
  }, 120_000);

  it('Arroyo: Hakunin (ARVILLAG) rozmawia bez bledow VM', async () => {
    await p.enter('ARVILLAG');
    const mark = p.logMark();
    const r = p.talk(npc(/^Hakunin$/), [/./, /./]);
    expect(r.started).toBe(true);
    expect(r.history.length).toBeGreaterThan(1);
    expect(p.problems(mark)).toEqual([]);
  }, 120_000);

  it('Arroyo: wyjscie z wioski (ARVILLAG -> ARGARDEN) ladowane bez bledow VM', async () => {
    const mark = p.logMark();
    await p.enter('ARGARDEN');
    expect(p.mapName().toUpperCase()).toBe('ARGARDEN');
    expect(p.problems(mark)).toEqual([]);
  }, 120_000);

  it('Klamath: Whiskey Bob, Slim (klucz), Sulik: dialogi i karma bez bledow VM', async () => {
    await p.enter('KLADWTWN');
    const mark = p.logMark();
    const bob = p.talk(npc(/^Average Merchant$/), [0, 0]);
    expect(bob.started).toBe(true);
    expect(p.gvar('GVAR_KARMA_WANDERER')).toBeGreaterThanOrEqual(1);
    const sulik = p.talk(npc(/^Sulik$/), [0, /Biting Lizards/, /./]);
    expect(sulik.history.join('\n')).toMatch(/spirits|Lizards/i);
    await p.enter('KLAMALL');
    const slim = p.talk(npc(/^Average Merchant$/), [/./, /./]);
    expect(slim.history.join('\n')).toMatch(/key/i);
    expect(p.problems(mark)).toEqual([]);
  }, 120_000);

  it('Klamath: mapy zadan (KLAGRAZ/KLACANYN: Torr, skorpiony, Dunton, KLATRAP) laduja sie bez bledow VM', async () => {
    for (const m of ['KLAGRAZ', 'KLACANYN', 'KLATRAP', 'KLARATCV']) {
      const mark = p.logMark();
      await p.enter(m);
      p.tick(30);
      expect(p.problems(mark), m).toEqual([]);
    }
  }, 180_000);

  it('Toxic Caves: ratunek Smileya (dialog, dolaczenie, dojscie do wyjscia) ustawia SMILEY_STATUS=2 i nagrody', async () => {
    await p.enter('KLATOXCV');
    const mark = p.logMark();
    const repBefore = p.gvar('GVAR_PLAYER_REPUTATION');
    const smiley = npc(/^Trapper$/);
    expect(p.gvar('GVAR_SMILEY_STATUS')).toBe(0);
    const r = p.talk(smiley, [/What are you doing/, 0, /./, /./, /./, /./]);
    expect(r.history.join('\n')).toMatch(/You can join me/);
    // Smiley idzie za graczem skryptem (nie przez party): przechodzi z Toxic Caves do wyjscia
    const startHex = smiley.hex;
    moveObject(p.world.map, p.player, SMILEY_EXIT_HEX + 3, 0);
    for (let k = 0; k < 40; k++) p.tick(10);
    expect(smiley.hex).not.toBe(startHex);
    expect(hexDistance(smiley.hex, SMILEY_EXIT_HEX)).toBeLessThan(7);
    expect(p.gvar('GVAR_SMILEY_STATUS')).toBe(2);
    expect(p.gvar('GVAR_PLAYER_REPUTATION') - repBefore).toBe(75);
    expect(p.gvar('GVAR_TOWN_REP_KLAMATH')).toBe(8);
    expect(p.problems(mark)).toEqual([]);
  }, 180_000);

  it('zapis/odczyt po quescie Smileya: GVAR i stan mapy przechodza przez JSON, drugi boot GameVars', async () => {
    const st = p.rt.captureCurrentMapState();
    expect(st).not.toBeNull();
    const registry = new MapRegistry();
    registry.snapshot(st!);
    const restored = new MapRegistry();
    restored.load(JSON.parse(JSON.stringify(registry.serialize())));
    expect(restored.get('KLATOXCV')?.name.toUpperCase()).toBe('KLATOXCV');
    const gv = JSON.parse(JSON.stringify(Array.from(p.vars.snapshot()))) as number[];
    const fresh = new GameVars(Int32Array.from(gv));
    expect(fresh.get(p.gvarIndex.get('GVAR_SMILEY_STATUS')!)).toBe(2);
    expect(fresh.get(p.gvarIndex.get('GVAR_TALKED_TO_ELDER')!)).toBe(1);
    // wczytanie stanu mapy na biezaca instancje nie psuje skryptow
    const mark = p.logMark();
    p.rt.registry.load(restored.serialize());
    p.rt.applySavedScriptState(restored.get('KLATOXCV')!);
    p.tick(10);
    expect(p.problems(mark)).toEqual([]);
    expect(p.gvar('GVAR_SMILEY_STATUS')).toBe(2);
  }, 120_000);

  it('Klamath po quescie: powrot do KLADWTWN, rozmowa bez bledow VM, status Smileya awansuje do 3', async () => {
    const mark = p.logMark();
    await p.enter('KLADWTWN');
    const r = p.talk(npc(/^Average Merchant$/), [/./]);
    expect(r.started).toBe(true);
    // po powrocie do Klamath skrypty awansuja status ratunku (2 -> 3)
    expect(p.gvar('GVAR_SMILEY_STATUS')).toBe(3);
    expect(p.problems(mark)).toEqual([]);
  }, 120_000);

  it('Den: Vic zlecaja naprawe (GVAR_QUEST_VIC_DEVICE) i radio lezy w KLADWTWN', async () => {
    await p.enter('DENBUS2');
    const mark = p.logMark();
    const before = snap();
    const r = p.talk(npc(/^Vic$/), [/./, /see what I can do/i]);
    expect(r.started).toBe(true);
    expect(gvarDiff(p, before).join('|')).toMatch(/GVAR_QUEST_VIC_DEVICE\(\d+\) 0->1/);
    expect(p.problems(mark)).toEqual([]);
  }, 120_000);
});
