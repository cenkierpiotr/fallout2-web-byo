/** Headless playthrough, Modoc: Karl (zebrak) i Grisham (sprzedaz miesa). Opis: dokumentacja techniczna */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, GAME_DIR, type Playthrough } from './harness.js';

const KARL = 268435472;
const GRISHAM = 92;

describe.skipIf(!GAME_DIR)('playthrough: Modoc, Karl i Grisham (headless)', () => {
  let p: Playthrough;
  beforeAll(async () => {
    p = await boot();
    await p.enter('MODMAIN');
  }, 120_000);
  afterAll(async () => {
    await p?.close();
  });
  const byId = (id: number) => {
    const o = p.world.map.objects.find((x) => x.id === id);
    expect(o, `brak obiektu ${id}`).toBeDefined();
    return o!;
  };

  it('Karl: pierwsza interakcja pokazuje floater i nie generuje bledow VM', () => {
    const mark = p.logMark();
    p.view.floatingTexts.value = [];
    p.talk(byId(KARL), []);
    const texts = p.view.floatingTexts.value.map((f) => f.text).join(' ');
    expect(texts).toMatch(/good to be home/);
    expect(p.problems(mark)).toEqual([]);
  });

  it('Grisham: dialog uruchamia sie bez bledow VM i oferuje rozmowe', () => {
    const mark = p.logMark();
    const r = p.talk(byId(GRISHAM), []);
    expect(r.started).toBe(true);
    expect(r.history.length).toBeGreaterThan(0);
    expect(p.problems(mark)).toEqual([]);
  });
});

describe.skipIf(!GAME_DIR)('playthrough: Modoc, Grisham zakupy i zlecenie (headless)', () => {
  let p: Playthrough;
  beforeAll(async () => {
    p = await boot();
    await p.enter('MODMAIN');
  }, 120_000);
  afterAll(async () => {
    await p?.close();
  });
  const byId = (id: number) => {
    const o = p.world.map.objects.find((x) => x.id === id);
    expect(o, `brak obiektu ${id}`).toBeDefined();
    return o!;
  };

  it('Grisham: kupno suszonego miesa za $10 oraz przyjecie zlecenia na dzikie psy', async () => {
    const mark = p.logMark();
    await p.give(41, 50);
    const caps0 = p.count(41);
    const r = p.talk(byId(GRISHAM), [
      /interested in buying/,
      /Sounds good/,
      /questions/,
      /Goodbye/,
      /^Sure/,
    ]);
    expect(r.started).toBe(true);
    expect(r.history.join('\n')).toMatch(/kill the pack of wild dogs/);
    expect(p.count(41)).toBe(caps0 - 10);
    expect(p.gvar('GVAR_MODOC_FAMILY_FEUD_SEED_TWO')).toBe(4);
    expect(p.problems(mark)).toEqual([]);
  });
});
