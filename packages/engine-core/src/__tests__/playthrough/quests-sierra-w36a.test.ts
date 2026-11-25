/**
 * Headless playthrough (Fala w36a): terminale Sierra Army Depot (depolva, depolvb), brak map ncrex i v15entb w danych.
 * Opis: dokumentacja techniczna czesc 19, niewiadome: open-unknowns.md "Fala w36a".
 */
import { afterEach, describe, expect, it } from 'vitest';
import { boot, GAME_DIR, type Playthrough } from './harness.js';

const GVAR_CONTAMINATION_TIMER = 149;
const SCIENCE = 14;

describe.skipIf(!GAME_DIR)('playthrough: Sierra Army Depot, terminale (headless)', () => {
  let p: Playthrough;
  const start = async (map: string) => {
    p = await boot();
    p.setStat(4, 8);
    await p.enter(map);
    p.tick(30);
    (p.rt as unknown as { rng: () => number }).rng = () => 0;
    const rt = p.rt as unknown as { skillValue: (c: number, s: number) => number };
    const orig = rt.skillValue;
    rt.skillValue = (c, s) => (c === p.player.id ? 200 : orig(c, s));
  };
  const talkTo = (id: number, steps: (number | RegExp)[]) => {
    const o = p.world.map.objects.find((x) => x.id === id)!;
    expect(o, `obiekt ${id}`).toBeTruthy();
    (p.world.view.notifications as unknown as { value: string[] }).value = [];
    const r = p.talk(o, steps);
    const n = (p.world.view.notifications as unknown as { value: string[] }).value;
    return { history: r.history.join('\n'), notes: n.join('\n') };
  };
  afterEach(async () => {
    await p?.close();
  });

  const cases: [string, string, number, (number | RegExp)[], RegExp, RegExp][] = [
    [
      '1A: hack wylacza pola silowe',
      'depolva',
      268435464,
      [/Hack/],
      /Ctrl/,
      /disable the force fields/,
    ],
    [
      '1B: hack konczy alarm poziomu 1',
      'depolva',
      268435460,
      [0, /Hack/],
      /Terminating Alarm Systems Level 1/,
      /hack into the computer/,
    ],
    [
      '2A: hack konczy alarm poziomu 2',
      'depolva',
      268435472,
      [0, /Hack/],
      /Terminating Alarm Systems Level 2/,
      /hack into the computer/,
    ],
    [
      '2B: hack wylacza plyty uderzeniowe',
      'depolva',
      268435476,
      [0, 0],
      /turn off the Shock Plates/,
      /disable the shock plates/,
    ],
    [
      '2B: hack wylacza pola silowe',
      'depolva',
      268435476,
      [1, 0],
      /force fields are now deactivated/,
      /200 experience/,
    ],
    [
      '2C: stacja napraw wylaczona',
      'depolva',
      98,
      [0],
      /repair system is off/,
      /Robot Repair Terminal/,
    ],
  ];
  it.each(cases)('%s', async (_n, map, id, steps, hist, note) => {
    await start(map);
    const r = talkTo(id, steps);
    expect(r.history).toMatch(hist);
    expect(r.notes).toMatch(note);
  });

  it('3A: bez hasla Skynet pyta o tozsamosc (3 opcje)', async () => {
    await start('depolva');
    const r = talkTo(96, []);
    expect(r.history).toMatch(/Who\.\.\.are\.\.\.you\?/);
    expect(r.history).toMatch(/Corporal Dixon/);
  });

  it('4A: terminal bezpieczenstwa poziomu 4 odmawia dostepu', async () => {
    await start('depolvb');
    expect(talkTo(138, []).history).toMatch(/Access Denied/);
  });

  it('4C: pobranie Black Plague ustawia licznik skazenia bazy', async () => {
    await start('depolvb');
    expect(p.vars.get(GVAR_CONTAMINATION_TIMER)).toBe(0);
    talkTo(20, [0, 0, 1, 1, 0]);
    expect(p.vars.get(GVAR_CONTAMINATION_TIMER)).toBeGreaterThan(0);
  });

  it('4C: pobranie serca Dobbsa jest bezcelowe (uszkodzony magazyn)', async () => {
    await start('depolvb');
    expect(talkTo(20, [0, 1, 0, 0]).history).toMatch(/storage devices for these organs failed/);
    expect(p.vars.get(GVAR_CONTAMINATION_TIMER)).toBe(0);
  });
  void SCIENCE;
});

describe.skipIf(!GAME_DIR)('brak map ncrex i v15entb w danych gry', () => {
  it('MAPS.TXT je zna, city.txt daje wejscie Off z -1,-1, a plikow map/skryptow nie ma', async () => {
    const p = await boot();
    try {
      const city = Buffer.from(await p.vfs.open('data/city.txt')).toString('latin1');
      const maps = Buffer.from(await p.vfs.open('data/maps.txt')).toString('latin1');
      for (const [m, lookup] of [
        ['ncrex', 'NCR: Council 2'],
        ['v15entb', 'The Squat B'],
      ]) {
        expect(maps).toMatch(new RegExp(`lookup_name=${lookup}\\s*\\r?\\nmap_name=${m}\\b`));
        expect(city).toContain(`=Off,-1,-1,${lookup},-1,-1,0`);
        for (const f of [`maps/${m}.map`, `scripts/${m}.int`]) {
          await expect(p.vfs.open(f)).rejects.toBeTruthy();
        }
      }
      // pokrewne mapy istnieja (to nie blad wyszukiwania/wielkosci liter)
      for (const m of ['ncr1', 'v15ent']) {
        expect((await p.vfs.open(`maps/${m}.map`)).byteLength).toBeGreaterThan(0);
      }
    } finally {
      await p.close();
    }
  });
});
