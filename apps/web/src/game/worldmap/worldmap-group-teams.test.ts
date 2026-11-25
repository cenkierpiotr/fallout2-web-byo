import { describe, expect, it } from 'vitest';
import { directionTo, hexDistance, hexInDirection, type Direction } from '@f2/engine-core';
import { parseRelations, type EncounterDef, type EncounterRelation } from '@f2/formats';
import {
  layoutHexes,
  planCombatRequest,
  planEncounterGroup,
  planTeams,
  spawnGroup,
  type GroupEnv,
} from './worldmap-group';
import { partyBestSkill } from './worldmap-session';
import { Skill } from '@f2/rules';

const mk = (kind: string, spacing = 1, distance = 4): EncounterDef =>
  ({
    name: 'E',
    teamNum: -1,
    types: [],
    position: { kind, spacing, distance },
  }) as unknown as EncounterDef;
const genv = (over: Partial<GroupEnv> = {}): GroupEnv => ({
  rng: { int: (a) => a },
  player: () => 5,
  global: () => 0,
  time: () => 1000,
  free: () => true,
  ...over,
});
const P = 20100;

describe('uklady formacji (exe 0x4c16f0)', () => {
  const S = 20500; // punkt startowy mapy
  const env = (): GroupEnv => genv({ starts: [S] });
  const dirSP = directionTo(S, P);
  const mv = (h: number, d: number, k: number): number =>
    hexInDirection(h, (d % 6) as Direction, k);
  it('wszystkie formacje: unikalne heksy, bez heksa gracza', () => {
    for (const k of ['Surrounding', 'huddle', 'straight_line', 'double_line', 'wedge', 'cone']) {
      const hs = layoutHexes(
        mk(k),
        9,
        P,
        genv({ rng: { int: (a, b) => Math.min(b, a + 1) }, starts: [S] }),
      );
      const ok = hs.filter((h) => h >= 0);
      expect(new Set(ok).size, k).toBe(ok.length);
      expect(ok.length, k).toBeGreaterThan(3);
      expect(ok, k).not.toContain(P);
    }
  });
  it('straight_line i double_line to ten sam kod w exe', () => {
    expect(layoutHexes(mk('straight_line', 2), 6, P, env())).toEqual(
      layoutHexes(mk('double_line', 2), 6, P, env()),
    );
  });
  it('straight_line: zygzak dir+s, dir+2s naprzemiennie po obu stronach', () => {
    const hs = layoutHexes(mk('straight_line', 1), 3, P, env());
    const a = mv(mv(S, dirSP + 1, 1), dirSP + 2, 1);
    const b = mv(mv(S, dirSP + 5, 1), dirSP + 4, 1);
    expect(hs).toEqual([S, a, b]);
  });
  it('wedge: pierwszy na starcie, dalej dwa promienie dir+1 i dir+5 co spacing', () => {
    const hs = layoutHexes(mk('wedge', 2), 5, P, env());
    const r0 = mv(S, dirSP + 1, 2);
    const r1 = mv(S, dirSP + 5, 2);
    expect(hs.slice(0, 3)).toEqual([S, r0, r1]);
    expect(hs[3]).toBe(mv(r0, dirSP + 1, 2));
  });
  it('cone: promienie w strone przeciwna (dir+3+s)', () => {
    const hs = layoutHexes(mk('cone', 1), 3, P, env());
    expect(hs).toEqual([S, mv(S, dirSP + 4, 1), mv(S, dirSP + 8, 1)]);
  });
  it('huddle: spirala, dir0 rosnie o 1 co krytter', () => {
    const hs = layoutHexes(mk('huddle', 1), 4, P, env());
    let h = S;
    const exp: number[] = [S];
    for (let i = 1; i < 4; i++) {
      h = mv(h, dirSP + i, 1);
      exp.push(h);
    }
    expect(hs).toEqual(exp);
  });
  it('bez punktu startowego start = heks gracza (zajety), pierwszy licznik przepada', () => {
    const hs = layoutHexes(mk('huddle', 1), 2, P, genv());
    expect(hs.every((h) => h >= 0 && h !== P)).toBe(true);
  });
  it('Surrounding: tilenum i Distance slotu', () => {
    const fixed = layoutHexes(mk('Surrounding'), 1, P, genv(), false, [{ tilenum: 20500 }]);
    expect(hexDistance(20500, fixed[0]!)).toBeLessThanOrEqual(4);
    const near = layoutHexes(mk('Surrounding'), 1, P, genv(), false, [{ distance: 2 }]);
    expect(hexDistance(P, near[0]!)).toBeLessThanOrEqual(3);
  });
  it('perk Cautious Nature: +3 do odleglosci', () => {
    const base = layoutHexes(mk('Surrounding'), 1, P, genv({ rng: { int: (a) => a } }));
    const cn = layoutHexes(
      mk('Surrounding'),
      1,
      P,
      genv({ rng: { int: (a) => a }, cautiousNature: true }),
    );
    expect(hexDistance(P, cn[0]!)).toBeGreaterThan(hexDistance(P, base[0]!));
  });
  it('wszystkie heksy zablokowane: porazka -1 po 26 probach', () => {
    expect(layoutHexes(mk('huddle', 1), 2, P, genv({ free: () => false }))).toEqual([-1, -1]);
  });
  it('zasadzka: Surrounding niezaleznie od formacji', () => {
    const hs = layoutHexes(mk('straight_line', 5, 20), 4, P, genv(), true);
    expect(hs.filter((h) => h >= 0).length).toBeGreaterThan(0);
  });
});

describe('Enctr(Num_Critters) w warunkach slotow', () => {
  const def = {
    name: 'G',
    teamNum: -1,
    position: { kind: 'Surrounding', spacing: 1, distance: 4 },
    types: [
      { pid: 1, items: [], dead: false },
      {
        pid: 2,
        items: [],
        dead: false,
        condition: {
          op: '>',
          left: { kind: 'enctr', what: 'Num_Critters' },
          right: { kind: 'const', value: 3 },
        },
      },
    ],
  } as unknown as EncounterDef;
  const cfg = { encounters: new Map([['G', def]]) };
  it('lider tylko gdy grupa liczy ponad 3', () => {
    const run = (n: number) =>
      planEncounterGroup(cfg, { groups: [{ name: 'G', min: n, max: n }] }, P, genv()).map(
        (m) => m.pid,
      );
    expect(run(3)).not.toContain(2);
    expect(run(5)).toContain(2);
  });
});

describe('Dead', () => {
  it('slot Dead zabija krytera po utworzeniu', () => {
    const def = {
      name: 'D',
      teamNum: -1,
      position: { kind: 'Surrounding', spacing: 1, distance: 3 },
      types: [{ pid: 7, items: [], dead: true }],
    } as unknown as EncounterDef;
    const ms = planEncounterGroup(
      { encounters: new Map([['D', def]]) },
      { groups: [{ name: 'D', min: 1, max: 1 }] },
      P,
      genv(),
    );
    expect(ms[0]!.dead).toBe(true);
    const killed: number[] = [];
    spawnGroup(
      {
        createObject: () => 5,
        addMultObjsToInven: () => undefined,
        wieldObjCritter: () => undefined,
        critterAddTrait: () => 0,
        killCritter: (i) => void killed.push(i),
      },
      ms,
      0,
    );
    expect(killed).toEqual([5]);
  });
});

describe('relacje i druzyny', () => {
  it('parseRelations: AND + FIGHTING Player', () => {
    expect(parseRelations('(2-4) A AND (1-2) B FIGHTING Player')).toEqual([
      { op: 'AND', left: 0, right: 1 },
      { op: 'FIGHTING', left: 1, right: 'player' },
    ]);
    expect(parseRelations('(2-4) A FIGHTING (3-4) B')).toEqual([
      { op: 'FIGHTING', left: 0, right: 1 },
    ]);
    expect(parseRelations('(2-5) R AMBUSH Player')).toEqual([
      { op: 'AMBUSH', left: 0, right: 'player' },
    ]);
  });
  const defs = [mk('wedge'), mk('wedge')].map(
    (d, i) => ({ ...d, teamNum: i === 0 ? 0 : 0 }) as EncounterDef,
  );
  it('FIGHTING Player: sojusznicy (AND) wspolna wroga druzyna, nie 0', () => {
    const rel: EncounterRelation[] = [
      { op: 'AND', left: 0, right: 1 },
      { op: 'FIGHTING', left: 1, right: 'player' },
    ];
    const t = planTeams(defs, rel);
    expect(t[0]!.team).toBe(t[1]!.team);
    expect(t[0]!.team).not.toBe(0);
    expect(t.every((x) => x.hostile && !x.ambush)).toBe(true);
  });
  it('FIGHTING miedzy grupami: rozne druzyny, gracz neutralny', () => {
    const t = planTeams(defs, [{ op: 'FIGHTING', left: 0, right: 1 }]);
    expect(t[0]!.team).not.toBe(t[1]!.team);
    expect(t.some((x) => x.hostile)).toBe(false);
  });
  it('AMBUSH Player: hostile i ambush', () => {
    const t = planTeams([defs[0]], [{ op: 'AMBUSH', left: 0, right: 'player' }]);
    expect(t[0]).toMatchObject({ hostile: true, ambush: true });
  });
  it('bez relacji: team_num z definicji', () => {
    const d = [{ ...mk('wedge'), teamNum: 45 } as EncounterDef];
    expect(planTeams(d, undefined)[0]!.team).toBe(45);
  });
  it('plan: czlonkowie dziedzicza druzyne i flagi, ambush uklada przy graczu', () => {
    const d = {
      ...mk('wedge'),
      teamNum: 0,
      types: [
        { pid: 1, ratio: 100, items: [], dead: false },
        { pid: 1, items: [], dead: false },
      ],
    } as unknown as EncounterDef;
    const ms = planEncounterGroup(
      { encounters: new Map([['E', d]]) },
      {
        groups: [{ name: 'E', min: 3, max: 3 }],
        relations: [{ op: 'AMBUSH', left: 0, right: 'player' }],
      },
      P,
      genv(),
    );
    expect(ms).toHaveLength(4);
    expect(ms.every((m) => m.hostile && m.ambush && m.team > 0)).toBe(true);
  });
});

describe('Outdoorsman: najlepszy w druzynie', () => {
  const npc = (outdoors: number, dead = false) => ({
    proto: {
      kind: 'critter',
      baseStats: [],
      bonusStats: [],
      skills: (() => {
        const a = new Array<number>(18).fill(0);
        a[Skill.Outdoorsman] = outdoors;
        return a;
      })(),
    },
    extra: { kind: 'critter', raw: [0, 0, 0, dead ? 0x80 : 0] },
  });
  const ctx = { fixes: {}, rng: { int: (a: number) => a }, clock: undefined } as never;
  it('towarzysz lepszy od gracza podnosi wynik, slabszy nie obniza', () => {
    const solo = partyBestSkill(30, [], Skill.Outdoorsman, ctx);
    expect(solo).toBe(30);
    const strong = partyBestSkill(30, [npc(80)], Skill.Outdoorsman, ctx);
    expect(strong).toBeGreaterThan(30);
    const weak = partyBestSkill(200, [npc(1)], Skill.Outdoorsman, ctx);
    expect(weak).toBe(200);
  });
  it('martwy towarzysz nie liczy sie', () => {
    expect(partyBestSkill(30, [npc(80, true)], Skill.Outdoorsman, ctx)).toBe(30);
  });
});

describe('liczebnosc i walidacja (exe 0x4c0fa4/0x4c1a64)', () => {
  const d = {
    ...mk('wedge'),
    teamNum: 0,
    types: [{ pid: 1, items: [], dead: false }],
  } as unknown as EncounterDef;
  const run = (env: Record<string, unknown>) =>
    planEncounterGroup(
      { encounters: new Map([['E', d]]) },
      { groups: [{ name: 'E', min: 1, max: 1 }] },
      P,
      { ...genv(), ...env },
    );
  it('druzyna > 2 nie zmienia slotow bez Ratio, ale podnosi total (+2) dla Ratio', () => {
    const dr = {
      ...d,
      types: [{ pid: 1, ratio: 100, items: [], dead: false }],
    } as unknown as EncounterDef;
    const go = (partySize: number) =>
      planEncounterGroup(
        { encounters: new Map([['E', dr]]) },
        { groups: [{ name: 'E', min: 3, max: 3 }] },
        P,
        { ...genv(), partySize },
      ).length;
    expect(go(2)).toBe(3);
    expect(go(3)).toBe(5);
  });
  it('nieosiagalny heks odpada', () => {
    expect(run({ reachable: () => false })).toHaveLength(0);
    expect(run({ reachable: () => true })).toHaveLength(1);
  });
});

describe('zadanie walki z relacji i obrot', () => {
  const first = new Map([
    [0, 10],
    [1, 20],
    [2, 30],
  ]);
  it('AMBUSH grupa->gracz: grupa atakuje gracza; FIGHTING Player bez akcji', () => {
    expect(planCombatRequest(parseRelations('(2-5) R AMBUSH Player'), first, 1)).toEqual({
      attacker: 10,
      defender: 1,
    });
    expect(planCombatRequest(parseRelations('(2-5) R FIGHTING Player'), first, 1)).toBeUndefined();
  });
  it('FIGHTING miedzy grupami: pierwsze krytery; AND pomijane; brak grupy = pominiecie', () => {
    expect(
      planCombatRequest(parseRelations('(2-4) A AND (1-2) B FIGHTING (1-1) C'), first, 1),
    ).toEqual({ attacker: 20, defender: 30 });
    expect(
      planCombatRequest(parseRelations('(2-4) A FIGHTING (1-2) B'), new Map([[1, 20]]), 1),
    ).toBeUndefined();
    expect(planCombatRequest(undefined, first, 1)).toBeUndefined();
  });
  it('spawnGroup: pierwszy krytter grupy i obrot w strone gracza', () => {
    const ms = [0, 0, 1].map((g, i) => ({
      pid: 7,
      script: undefined,
      dead: false,
      items: [],
      team: -1,
      hostile: false,
      ambush: false,
      hex: 100 + i,
      group: g,
    }));
    let n = 50;
    const faced: [number, number][] = [];
    const fb = new Map<number, number>();
    spawnGroup(
      {
        createObject: () => n++,
        addMultObjsToInven: () => undefined,
        wieldObjCritter: () => undefined,
        critterAddTrait: () => 0,
        faceTowards: (i, t) => void faced.push([i, t]),
      },
      ms,
      0,
      { player: 999, firstByGroup: fb },
    );
    expect([...fb]).toEqual([
      [0, 50],
      [1, 52],
    ]);
    expect(faced).toEqual([
      [50, 999],
      [51, 999],
      [52, 999],
    ]);
  });
});

describe('Fortune Finder (exe 0x4c145e)', () => {
  const d = {
    ...mk('wedge'),
    teamNum: 0,
    types: [
      {
        pid: 1,
        items: [
          { pid: 41, min: 10, max: 10, wielded: false },
          { pid: 7, min: 3, max: 3, wielded: false },
        ],
        dead: false,
      },
    ],
  } as unknown as EncounterDef;
  const go = (fortuneFinder: boolean) =>
    planEncounterGroup(
      { encounters: new Map([['E', d]]) },
      { groups: [{ name: 'E', min: 1, max: 1 }] },
      P,
      genv({ fortuneFinder }),
    )[0]?.items;
  it('podwaja tylko ilosc pid 41', () => {
    expect(go(false)?.map((i) => [i.pid, i.count])).toEqual([
      [41, 10],
      [7, 3],
    ]);
    expect(go(true)?.map((i) => [i.pid, i.count])).toEqual([
      [41, 20],
      [7, 3],
    ]);
  });
});
