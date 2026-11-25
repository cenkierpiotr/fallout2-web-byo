/**
 * Headless playthrough, Vault City: test obywatelstwa u Gregory'ego (wymagane staty z vcgreg:
 * CH>5, INT 8/9, PE/IN/AG>8) oraz praca Lynette (roznica obywatel / nie-obywatel).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, GAME_DIR, type Playthrough } from './harness.js';

const GREGORY = 112;
const LYNETTE = 18;

describe.skipIf(!GAME_DIR)('playthrough: Vault City (headless)', () => {
  let p: Playthrough;
  beforeAll(async () => {
    p = await boot();
    await p.enter('VCTYCOCL');
  }, 120_000);
  afterAll(async () => {
    await p?.close();
  });
  const byId = (id: number) => {
    const o = p.world.map.objects.find((x) => x.id === id);
    expect(o, `brak obiektu ${id}`).toBeDefined();
    return o!;
  };

  it('Lynette: bez obywatelstwa oferuje prace przy roslinie Gecko', () => {
    const mark = p.logMark();
    const r = p.talk(byId(LYNETTE), [/some questions/]);
    expect(r.started).toBe(true);
    expect(p.gvar('GVAR_VAULT_CITIZEN')).toBe(0);
    expect(p.problems(mark)).toEqual([]);
  });

  it('test obywatelstwa: przy wymaganych statach daje obywatelstwo i reputacje', () => {
    const mark = p.logMark();
    const rep0 = p.gvar('GVAR_TOWN_REP_VAULT_CITY');
    p.setStat(3, 8);
    p.setStat(1, 9);
    p.setStat(6, 9);
    p.setStat(4, 9);
    const r = p.talk(byId(GREGORY), [
      /Who are you/,
      /What do you do/,
      /Citizenship test\?/,
      /What is the test/,
      /Sounds elementary/,
      /^Sure/,
      /All right/,
      /Already|Wait/,
      /Of COURSE/,
      /Great/,
      /Okay/,
      /Thanks/,
    ]);
    expect(r.started).toBe(true);
    expect(p.gvar('GVAR_VAULT_CITIZEN')).toBe(4);
    expect(p.gvar('GVAR_VAULT_CITIZENSHIP')).toBe(1);
    expect(p.gvar('GVAR_TOWN_REP_VAULT_CITY')).toBe(rep0 + 10);
    expect(p.problems(mark)).toEqual([]);
  });

  it('Lynette: raport o naprawionym reaktorze (PLANT=15) i o zniszczonym (PLANT=8) bez bledow VM', async () => {
    for (const [label, state, steps] of [
      [
        'naprawa',
        {
          VAULT_GECKO_PLANT: 15,
          QUEST_OPTIMIZE_POWER_PLANT: 2,
          VAULT_CITIZENSHIP: 1,
          VAULT_CITIZEN: 4,
        },
        [
          /another question/,
          /Gecko power/,
          /took care/,
          /repaired it/,
          /HELP them/,
          /Mess with me/,
        ],
      ],
      [
        'zniszczenie',
        { VAULT_GECKO_PLANT: 8, GECKO_MELTDOWN: 1, VAULT_CITIZENSHIP: 1, VAULT_CITIZEN: 4 },
        [/another question/, /Gecko power/, /destroyed/, /SOME compensation/, /leave peacefully/],
      ],
    ] as const) {
      const q = await boot();
      try {
        await q.enter('VCTYCOCL');
        const mark = q.logMark();
        const ly = q.world.map.objects.find((x) => x.id === LYNETTE)!;
        q.talk(ly, [/don.t have time/]);
        for (const [k, v] of Object.entries(state)) q.setGvar(`GVAR_${k}`, v);
        const r = q.talk(ly, [...steps]);
        expect(r.started, label).toBe(true);
        expect(r.history.join('\n'), label).toMatch(/Lynette|plant|Gecko|Citizen/i);
        expect(q.problems(mark), label).toEqual([]);
      } finally {
        await q.close();
      }
    }
  }, 240_000);
});
