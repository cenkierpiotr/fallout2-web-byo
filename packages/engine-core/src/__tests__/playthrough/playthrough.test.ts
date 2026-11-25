/**
 * Headless playthrough glownego watku Arroyo -> Klamath -> Den -> ... -> Enclave na prawdziwych danych
 * (F2_GAME_DIR). Tabela kamieni milowych: dokumentacja techniczna Mapa swiata jest zastapiona
 * bezposrednim wejsciem do miasta wg data/city.txt (podroz jest pokryta przez e2e m5-worldmap-travel).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, converse, GAME_DIR, PATCH_DIR, type Playthrough } from './harness.js';

describe.skipIf(!GAME_DIR || !PATCH_DIR)('playthrough Arroyo -> Enclave (headless)', () => {
  let p: Playthrough;
  beforeAll(async () => {
    p = await boot();
  }, 120_000);
  afterAll(async () => {
    await p?.close();
  });

  it('M1 Arroyo: wioska, rozmowa ze Starszym ustawia GVAR-y questa', async () => {
    // area 'Arroyo' w city.txt wystepuje dwa razy (zywa wioska i wariant ARDEAD po zniszczeniu): wprost ARVILLAG
    await p.enter('ARVILLAG');
    const elder = p.npcsByName(/^Elder$/)[0];
    expect(elder).toBeDefined();
    const mark = p.logMark();
    const r = converse(p, elder!, [/./]);
    expect(r.started).toBe(true);
    expect(p.gvar('GVAR_TALKED_TO_ELDER')).toBe(1);
    expect(p.gvar('GVAR_DEN_VIC_KNOWN')).toBeGreaterThan(0);
    expect(p.problems(mark)).toEqual([]);
  }, 120_000);

  it('M2 Klamath: miasto + Klamath Mall, rozmowy z mieszkancami bez bledow VM', async () => {
    expect(await p.enterArea('Klamath')).toBe('KLADWTWN');
    const mark = p.logMark();
    const sulik = p.npcsByName(/^Sulik$/)[0];
    expect(sulik).toBeDefined();
    expect(converse(p, sulik!, [/./], 8).started).toBe(true);
    await p.enter('KLAMALL');
    expect(p.problems(mark)).toEqual([]);
  }, 120_000);

  it('M3 Den: Vic zlecaja zadanie z radiem (dzialajace dialogi, bez bledow VM)', async () => {
    expect(await p.enterArea('Den')).toBe('DENBUS1');
    await p.enter('DENBUS2');
    const vic = p.npcsByName(/^Vic$/)[0];
    expect(vic).toBeDefined();
    const mark = p.logMark();
    const r = converse(p, vic!, [/./]);
    expect(r.started).toBe(true);
    expect(r.history.join('\n')).toMatch(/radio/i);
    expect(p.problems(mark)).toEqual([]);
  }, 120_000);

  it('M3b Den: wstapienie do gildii Metzgera -> load_map do niewolniczego biegu (DNSlvRun)', async () => {
    await p.enter('DENBUS2');
    const metzger = p.npcsByName(/^Metzger$/)[0];
    expect(metzger).toBeDefined();
    const mark = p.logMark();
    // pierwsza rozmowa traci cierpliwosc Metzgera, druga prowadzi do wstapienia i wyslania na bieg
    converse(p, metzger!, [/./], 3);
    converse(p, metzger!, [/join|ready|do it|okay|all right/i], 20);
    expect(await p.followLoadMap()).toBe('DNSlvRun');
    expect(p.mapName().toUpperCase()).toBe('DNSLVRUN');
    expect(p.problems(mark)).toEqual([]);
  }, 120_000);

  // Wejscie do kolejnych obszarow glownego watku: mapa laduje sie, skrypty startuja (start + map_enter)
  // bez bledow VM i bez nieobslugiwanych opkodow spoza listy kosmetycznych.
  const AREAS: [string, string, string][] = [
    ['M4 Modoc', 'Modoc', 'MODMAIN'],
    ['M5 Vault City', 'Vault City', 'VCTYCTYD'],
    ['M6 Gecko', 'Gecko', 'GECKSETL'],
    ['M7 Broken Hills', 'Broken Hills', 'BROKEN1'],
    ['M8 New Reno', 'New Reno', 'NEWR1'],
    ['M9 Sierra Army Base', 'Sierra Army Base', 'DEPOLV1'],
    ['M10 Vault 15', 'Vault 15', 'V15ENT'],
    ['M11 NCR', 'NCR', 'NCRENT'],
    ['M12 Vault 13', 'Vault 13', 'V13ENT'],
    ['M13 Military Base', 'Military Base', 'MBCLOSE'],
    ['M14 Redding', 'Redding', 'REDDOWN'],
    ['M15 San Francisco', 'San Francisco', 'SFCHINA'],
    ['M17 Enclave (platforma)', 'Enclave', 'ENCDOCK'],
  ];
  for (const [label, area, map] of AREAS) {
    it(`${label}: wejscie (${map}) bez bledow VM`, async () => {
      const mark = p.logMark();
      expect(await p.enterArea(area)).toBe(map);
      expect(p.world.map.objects.length).toBeGreaterThan(50);
      expect(p.problems(mark)).toEqual([]);
    }, 120_000);
  }

  it('M16 Navarro: wejscie; jedyne bledy to store_external straznikow (zgodne z oryginalem)', async () => {
    const mark = p.logMark();
    expect(await p.enterArea('Navarro')).toBe('NAVARRO');
    const probs = p.problems(mark);
    // ccgrdpa zapisuje guardN_obj, ktorego zaden skrypt nie eksportuje; oryginal (programFatalError) przerywa
    // procedure identycznie, wiec nie jest to blokada watku
    expect(probs.length).toBeGreaterThan(0);
    for (const l of probs) expect(l).toMatch(/store_external: zmienna zewnetrzna "guard\d_obj"/);
  }, 120_000);
});
