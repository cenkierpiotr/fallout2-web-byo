import { describe, expect, it } from 'vitest';
import {
  Skill,
  Stat,
  defaultRulesContext,
  newCritterData,
  newSkillState,
  recalcDerived,
  type Rng,
  type SkillCritter,
} from '@f2/rules';
import {
  GameClock,
  isDoorLocked,
  isLocked,
  skillChanceOn,
  skillsUsableOn,
  useSkillOnObject,
  type SkillActionDeps,
} from '../index.js';
import { critterHp } from '../critter-model.js';
import type { GameObject } from '../game-object.js';
import { door, fake } from './helpers.js';

/** Rng zwracajacy kolejne wartosci (jak w testach @f2/rules). */
function seq(values: number[]): Rng {
  let i = 0;
  return { int: (min) => values[i++] ?? min };
}

function playerCritter(skills: Partial<Record<Skill, number>> = {}): SkillCritter {
  const c = newCritterData(true);
  [5, 5, 5, 5, 5, 5, 5].forEach((v, i) => (c.baseStats[i] = v));
  recalcDerived(c, defaultRulesContext());
  c.curHP = 10;
  const sk = newSkillState();
  for (const [s, v] of Object.entries(skills)) sk.skillRaw[Number(s)] = v;
  return Object.assign(c, sk);
}

function setup(rolls: number[], skills: Partial<Record<Skill, number>> = {}) {
  const player = fake(1, 20100);
  const clock = new GameClock(1_000_000);
  const deps: SkillActionDeps = {
    player,
    critter: playerCritter(skills),
    clock,
    ctx: () => ({ ...defaultRulesContext(), rng: seq(rolls), clock }),
  };
  return { player, clock, deps };
}

function npc(hex: number): GameObject {
  const o = fake(1, hex, 0, { kind: 'critter', flags: 0, raw: new Int32Array(10) });
  o.proto = {
    kind: 'critter',
    baseStats: Array.from({ length: 35 }, (_, i) => (i === Stat.MaxHitPoints ? 30 : 5)),
    bonusStats: [],
    skills: [],
    bodyType: 0,
  } as never;
  return o;
}

describe('skillsUsableOn', () => {
  it('zamkniete drzwi: wytrych, pulapki, nauka', () => {
    const { player } = setup([]);
    expect(skillsUsableOn(door(20101, 0x2), player)).toEqual([
      Skill.Lockpick,
      Skill.Traps,
      Skill.Science,
    ]);
  });
  it('otwarte na klucz drzwi nie oferuja wytrycha', () => {
    const { player } = setup([]);
    expect(skillsUsableOn(door(20101), player)).toEqual([Skill.Traps, Skill.Science]);
  });
  it('krytter: pierwsza pomoc, doktor, kradziez, nauka', () => {
    const { player } = setup([]);
    expect(skillsUsableOn(npc(20101), player)).toEqual([
      Skill.FirstAid,
      Skill.Doctor,
      Skill.Steal,
      Skill.Science,
    ]);
  });
  it('robot dodaje naprawe, gracz na sobie bez kradziezy', () => {
    const { player } = setup([]);
    const robot = npc(20101);
    (robot.proto as { bodyType: number }).bodyType = 2;
    expect(skillsUsableOn(robot, player)).toContain(Skill.Repair);
    expect(skillsUsableOn(player, player)).toEqual([Skill.FirstAid, Skill.Doctor]);
  });
  it('wall/ukryty: nic', () => {
    const { player } = setup([]);
    expect(skillsUsableOn(fake(3, 20101), player)).toEqual([]);
  });
});

describe('useSkillOnObject', () => {
  it('wytrych: sukces odblokowuje drzwi (bit w extra), zuzywa 10 min', () => {
    const { player, clock, deps } = setup([1], { [Skill.Lockpick]: 100 });
    const d = door(20101, 0x2);
    const t0 = clock.ticks;
    const r = useSkillOnObject(deps, Skill.Lockpick, d);
    expect(r.ok).toBe(true);
    expect(r.effects).toContainEqual({ kind: 'unlock' });
    expect(isDoorLocked(d)).toBe(false);
    expect(isLocked(d)).toBe(false);
    expect(clock.ticks - t0).toBe(10 * 600);
    expect(player.hex).toBe(20100);
  });

  it('wytrych: porazka krytyczna zacina zamek, kolejna proba odmowa', () => {
    const { deps } = setup([100, 1], { [Skill.Lockpick]: 0 });
    const d = door(20101, 0x2);
    const r1 = useSkillOnObject(deps, Skill.Lockpick, d);
    expect(r1.ok).toBe(false);
    const r2 = useSkillOnObject(deps, Skill.Lockpick, d);
    expect(r2.reason).toBe('jammed');
    expect(isLocked(d)).toBe(true);
  });

  it('poza zasiegiem i nieuzywalny skill', () => {
    const { deps } = setup([1]);
    expect(useSkillOnObject(deps, Skill.Lockpick, door(20190, 0x2)).failReason).toBe(
      'out-of-range',
    );
    expect(useSkillOnObject(deps, Skill.Lockpick, door(20101)).failReason).toBe('not-usable');
    expect(
      useSkillOnObject(deps, Skill.Lockpick, door(20190, 0x2), { ignoreRange: true }).failReason,
    ).toBeUndefined();
  });

  it('pierwsza pomoc leczy NPC i zapisuje HP w modelu krytera', () => {
    const { deps } = setup([1, 3], { [Skill.FirstAid]: 100 });
    const n = npc(20101);
    // NPC ma 10/30 HP
    (n.extra as { raw: Int32Array }).raw = new Int32Array([0, 0, 0, 0, 0, 0, 0, 10, 0, 0]);
    const r = useSkillOnObject(deps, Skill.FirstAid, n);
    expect(r.ok).toBe(true);
    const heal = r.effects.find((e) => e.kind === 'heal') as { amount: number } | undefined;
    expect(heal?.amount).toBeGreaterThan(0);
    expect(critterHp(n, 30)).toBe(10 + (heal?.amount ?? 0));
  });

  it('kradziez: sukces przenosi przedmiot do gracza', () => {
    const { player, deps } = setup([1], { [Skill.Steal]: 100 });
    const n = npc(20101);
    const item = fake(0, 20101);
    n.inventory.push(item);
    const r = useSkillOnObject(deps, Skill.Steal, n, { tool: item });
    expect(r.ok).toBe(true);
    expect(n.inventory).not.toContain(item);
    expect(player.inventory).toContain(item);
  });

  it('kradziez: wpadka wola onCaught', () => {
    const { deps } = setup([100, 1], { [Skill.Steal]: 0 });
    let caught = 0;
    deps.onCaught = () => void caught++;
    const n = npc(20101);
    const item = fake(0, 20101);
    n.inventory.push(item);
    const r = useSkillOnObject(deps, Skill.Steal, n, { tool: item });
    expect(r.ok).toBe(false);
    expect(caught).toBe(1);
    expect(n.inventory).toContain(item);
  });

  it('skrypt przejmuje obsluge (use_skill_on_p_proc): brak rzutu i czasu', () => {
    const { clock, deps } = setup([1], { [Skill.Lockpick]: 100 });
    const calls: number[][] = [];
    deps.scripts = { runUseSkillProc: (s, t, k) => (calls.push([s, t, k]), true) };
    const d = door(20101, 0x2);
    const t0 = clock.ticks;
    const r = useSkillOnObject(deps, Skill.Lockpick, d);
    expect(r.overridden).toBe(true);
    expect(calls).toEqual([[deps.player.id, d.id, Skill.Lockpick]]);
    expect(isLocked(d)).toBe(true);
    expect(clock.ticks).toBe(t0);
  });

  it('skrypt bez script_overrides: reguly domyslne dzialaja dalej', () => {
    const { deps } = setup([1], { [Skill.Lockpick]: 100 });
    deps.scripts = { runUseSkillProc: () => false };
    expect(useSkillOnObject(deps, Skill.Lockpick, door(20101, 0x2)).ok).toBe(true);
  });

  it('pulapki: sukces rozbraja', () => {
    const { deps } = setup([1], { [Skill.Traps]: 100 });
    const d = door(20101);
    const r = useSkillOnObject(deps, Skill.Traps, d);
    expect(r.effects).toContainEqual({ kind: 'disarm' });
  });
});

describe('skillChanceOn', () => {
  it('wytrych = skill z arkusza (bez modyfikatora zamka: exe go nie ma, mod rzutu daje skrypt celu)', () => {
    const { deps } = setup([], { [Skill.Lockpick]: 50 });
    const d = door(20101, 0x2);
    const base = skillChanceOn(deps, Skill.Lockpick, d);
    expect(base).toBeGreaterThan(0);
    expect(base).toBeLessThanOrEqual(95);
  });
  it('pierwsza pomoc = poziom skilla, ucina do 95', () => {
    const { deps } = setup([], { [Skill.FirstAid]: 300 });
    expect(skillChanceOn(deps, Skill.FirstAid, npc(20101))).toBe(95);
  });
});

describe('limit uzyc na 25 h', () => {
  it('zapisuje znaczniki i po 3 uzyciach odmawia', () => {
    const { deps, player } = setup([1, 3, 1, 3, 1, 3, 1, 3], { [Skill.FirstAid]: 100 });
    let saved: Record<number, number[]> = {};
    deps.skillUseTimes = () => saved;
    deps.saveSkillUseTimes = (t) => void (saved = t);
    const n = npc(20101);
    (n.extra as { raw: Int32Array }).raw = new Int32Array([0, 0, 0, 0, 0, 0, 0, 1, 0, 0]);
    for (let i = 0; i < 3; i++) expect(useSkillOnObject(deps, Skill.FirstAid, n).ok).toBe(true);
    expect(saved[Skill.FirstAid]).toHaveLength(3);
    const r = useSkillOnObject(deps, Skill.FirstAid, n);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('skill-exhausted');
    expect(player.id).toBeGreaterThan(0);
  });
});

describe('skillChanceOn: dane celu kradziezy (D 0x4abbe4)', () => {
  const chance = (
    mut: (t: GameObject, d: SkillActionDeps, p: GameObject) => void = () => {},
  ): number => {
    const { player, deps } = setup([], { [Skill.Steal]: 50 });
    const t = npc(20101);
    mut(t, deps, player);
    return skillChanceOn(deps, Skill.Steal, t);
  };

  it('powalony cel (flagi obrazen & 3) daje premie', () => {
    const base = chance((t, _d, p) => {
      p.rotation = 0;
      t.rotation = 3;
    });
    const downed = chance((t, _d, p) => {
      p.rotation = 0;
      t.rotation = 3;
      (t.extra as { raw: Int32Array }).raw[3] = 1;
    });
    expect(downed).toBeGreaterThan(base);
  });

  it('cel stojacy tylem do zlodzieja nie widzi go (brak kary spotted)', () => {
    const sees = chance((t, _d, p) => {
      p.rotation = 0;
      t.rotation = 3;
    });
    const back = chance((t, _d, p) => {
      p.rotation = 0;
      t.rotation = 0;
    });
    expect(back).toBeGreaterThan(sees);
  });

  it('cel z druzyny gracza: dep inPlayerParty jest odczytany', () => {
    let asked = false;
    chance((_t, d) => {
      d.inPlayerParty = () => ((asked = true), true);
    });
    expect(asked).toBe(true);
  });
});
