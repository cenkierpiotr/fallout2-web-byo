import { describe, expect, it } from 'vitest';
import {
  Perk,
  RollResult,
  Skill,
  Trait,
  addictionGvar,
  applyJinxed,
  bloodyMessActive,
  defaultRulesContext,
  endWithdrawal,
  newCritterData,
  newGameObject,
  newSkillState,
  recalcDerived,
  repairRobot,
  selectDeathAnimation,
  skillUsesLeftToday,
  specialPoolDec,
  specialPoolInc,
  useSkillOn,
  withdrawalDurationMinutes,
  withdrawalStartTick,
  type Rng,
  type SkillCritter,
  type SkillObject,
  type SkillUseContext,
} from '../src/index.js';

const seq = (values: number[]): Rng => {
  let i = 0;
  return { int: (min) => values[i++] ?? min };
};

function player(traits: number[] = [-1, -1], perks: Record<number, number> = {}) {
  const c = newCritterData(true);
  c.traits = traits;
  c.perkRanks = perks;
  return c;
}

describe('Bloody Mess (R11c-U1)', () => {
  it('aktywny tylko gdy atakujacy to gracz z traitem 8', () => {
    expect(bloodyMessActive(player([Trait.BloodyMess, -1]))).toBe(true);
    expect(bloodyMessActive(player([-1, Trait.BloodyMess]))).toBe(true);
    expect(bloodyMessActive(player())).toBe(false);
    const npc = newCritterData(false);
    npc.traits = [Trait.BloodyMess, -1];
    expect(bloodyMessActive(npc)).toBe(false);
    expect(bloodyMessActive(undefined)).toBe(false);
  });

  it('wybiera najbardziej brutalna animacje niezaleznie od obrazen', () => {
    const anims = { normal: 0x14, brutal: 0x17 };
    expect(selectDeathAnimation(player([Trait.BloodyMess, -1]), anims)).toBe(0x17);
    expect(selectDeathAnimation(player(), anims)).toBe(0x14);
  });
});

describe('Jinxed (R11c-U2)', () => {
  it('zwykla porazka z traitem Jinxed gracza: rand(0,1) != 0 daje krytyczna porazke', () => {
    const p = player([Trait.Jinxed, -1]);
    expect(applyJinxed(RollResult.Failure, p, seq([1]))).toBe(RollResult.CriticalFailure);
    expect(applyJinxed(RollResult.Failure, p, seq([0]))).toBe(RollResult.Failure);
  });

  it('dziala tez z perkiem 118 gracza', () => {
    const p = player([-1, -1], { [Perk.Jinxed]: 1 });
    expect(applyJinxed(RollResult.Failure, p, seq([1]))).toBe(RollResult.CriticalFailure);
  });

  it('nie rusza sukcesow ani krytycznych porazek i nie zuzywa rzutu', () => {
    const p = player([Trait.Jinxed, -1]);
    const rng = {
      int: () => {
        throw new Error('rng nie powinien byc uzyty');
      },
    };
    expect(applyJinxed(RollResult.Success, p, rng)).toBe(RollResult.Success);
    expect(applyJinxed(RollResult.CriticalSuccess, p, rng)).toBe(RollResult.CriticalSuccess);
    expect(applyJinxed(RollResult.CriticalFailure, p, rng)).toBe(RollResult.CriticalFailure);
  });

  it('bez Jinxed u gracza nic sie nie zmienia; rzut atakujacego-NPC tez podlega (globalnie)', () => {
    const rng = {
      int: () => {
        throw new Error('rng nie powinien byc uzyty');
      },
    };
    expect(applyJinxed(RollResult.Failure, player(), rng)).toBe(RollResult.Failure);
    expect(applyJinxed(RollResult.Failure, undefined, rng)).toBe(RollResult.Failure);
    // funkcja bierze gracza, nie atakujacego: ten sam efekt dla kazdego atakujacego
    expect(applyJinxed(RollResult.Failure, player([Trait.Jinxed, -1]), seq([1]))).toBe(
      RollResult.CriticalFailure,
    );
  });
});

describe('odstawienie uzaleznien (R12-U1/U2)', () => {
  it('start = onset * 600 ticków od teraz', () => {
    expect(withdrawalStartTick(1000, 3)).toBe(1000 + 1800);
  });

  it('czas trwania: 10080 min, Chem Reliant 5040, Flower Child polowa', () => {
    expect(withdrawalDurationMinutes(player())).toBe(10080);
    expect(withdrawalDurationMinutes(player([Trait.ChemReliant, -1]))).toBe(5040);
    expect(withdrawalDurationMinutes(player([-1, -1], { [Perk.FlowerChild]: 1 }))).toBe(5040);
    expect(withdrawalDurationMinutes(undefined)).toBe(10080);
    const npc = newCritterData(false);
    npc.traits = [Trait.ChemReliant, -1];
    expect(withdrawalDurationMinutes(npc)).toBe(10080);
  });

  it('indeksy GVAR uzaleznien', () => {
    expect([106, 87, 53, 110, 48, 124, 125, 304, 259].map(addictionGvar)).toEqual([
      21, 22, 23, 24, 25, 26, 26, 295, 296,
    ]);
    expect(addictionGvar(1)).toBeUndefined();
  });

  it('koniec odstawienia zdejmuje perk odstawienia z danego indeksu', () => {
    const c = player();
    c.perkRanks[Perk.BuffoutAddiction] = 1;
    const target = newGameObject(1, 0x1000000, c);
    target.withdrawalPerks = { 22: Perk.BuffoutAddiction, 23: 999 };
    endWithdrawal(target, 22);
    expect(target.withdrawalPerks).toEqual({ 23: 999 });
    expect(c.perkRanks[Perk.BuffoutAddiction] ?? 0).toBe(0);
    expect(() => endWithdrawal(target, 22)).not.toThrow();
  });
});

describe('pula punktow SPECIAL w GCD (R11b-U2)', () => {
  function pc(st = 5) {
    const c = newCritterData(true);
    for (let i = 0; i < 7; i++) c.baseStats[i] = st;
    recalcDerived(c, defaultRulesContext());
    return c;
  }
  it('podniesienie statystyki zmniejsza pule, obnizenie zwieksza', () => {
    const c = pc();
    const pool = { points: 5 };
    expect(specialPoolInc(c, pool, 0)).toEqual({ ok: true });
    expect(c.baseStats[0]).toBe(6);
    expect(pool.points).toBe(4);
    expect(specialPoolDec(c, pool, 0)).toEqual({ ok: true });
    expect(c.baseStats[0]).toBe(5);
    expect(pool.points).toBe(5);
  });
  it('limit 10 i minimum 1 nie ruszaja puli', () => {
    const c = pc(10);
    const pool = { points: 5 };
    expect(specialPoolInc(c, pool, 0).ok).toBe(false);
    expect(pool.points).toBe(5);
    const d = pc(1);
    expect(specialPoolDec(d, pool, 0).ok).toBe(false);
    expect(pool.points).toBe(5);
  });
});

describe('Repair robotow (R18a-U1)', () => {
  const MASKS = [0x40, 0x10, 0x20, 0x08, 0x04];
  function repairer(skill = 100) {
    const c = Object.assign(newCritterData(true), newSkillState()) as SkillCritter;
    c.baseStats[0] = 5;
    recalcDerived(c, defaultRulesContext());
    c.skillRaw[Skill.Repair] = skill;
    c.skillRaw[Skill.FirstAid] = skill;
    return newGameObject(1, 0x1000000, c) as SkillObject;
  }
  function robot(flags: number, bodyType = 2) {
    const o = newGameObject(2, 0x1000001, newCritterData(false)) as SkillObject;
    o.bodyType = bodyType;
    o.robotCrippled = flags;
    return o;
  }
  const ctx = (rng: Rng, ticks = 2_000_000): SkillUseContext => ({
    ...defaultRulesContext(),
    rng,
    clock: { ticks },
  });
  const always = (): SkillUseContext => ctx({ int: (min) => min });

  it('odrzuca cele inne niz robot (typ ciala != 2)', () => {
    const r = repairRobot(repairer(), robot(0x40, 0), always());
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('not-robot');
  });

  it('brak flag do naprawy: no-need, bez zuzycia limitu', () => {
    const u = repairer();
    const r = repairRobot(u, robot(0), always());
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no-need');
    expect(skillUsesLeftToday(u, Skill.Repair, always())).toBe(3);
  });

  it('osobny rzut na kazda ustawiona flage; sukces 2/3 zdejmuje flage, porazka zostawia', () => {
    const u = repairer();
    const t = robot(0x40 | 0x20 | 0x04);
    // chance 100 (cap 95): pierwszy rzut 1 -> sukces (kolejny rzut krytyka: wylaczony przez dobe? ticks > 864000: krytyk rzucany)
    // uzywamy sekwencji: [d100 rzut, d100 krytyk] x liczba flag
    const rng = seq([1, 100, 99, 100, 1, 100]); // flaga 0x40 ok, 0x20 porazka (99 > 95), 0x04 ok
    const r = repairRobot(u, t, ctx(rng));
    expect(
      r.effects.filter((e) => e.kind === 'uncripple').map((e) => (e as { mask: number }).mask),
    ).toEqual([0x40, 0x04]);
    expect(t.robotCrippled).toBe(0x20);
    expect(r.ok).toBe(true);
  });

  it('kolejnosc masek z tabeli 0x4aa2f0: 0x40, 0x10, 0x20, 0x08, 0x04', () => {
    const t = robot(0x7c);
    const masks: number[] = [];
    const rng: Rng = { int: (min) => min };
    const r = repairRobot(repairer(), t, ctx(rng));
    for (const e of r.effects) if (e.kind === 'uncripple') masks.push(e.mask);
    expect(masks).toEqual(MASKS);
    expect(t.robotCrippled).toBe(0);
  });

  it('limit 3 uzycia na 25 h: czwarte blokowane, po 25 h przechodzi', () => {
    const u = repairer();
    const c = ctx({ int: (min) => min });
    for (let i = 0; i < 3; i++) {
      c.clock.ticks += 10;
      expect(repairRobot(u, robot(0x40), c).ok).toBe(true);
    }
    expect(skillUsesLeftToday(u, Skill.Repair, c)).toBe(0);
    const blocked = repairRobot(u, robot(0x40), c);
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toBe('skill-exhausted');
    c.clock.ticks += 900_000;
    expect(repairRobot(u, robot(0x40), c).ok).toBe(true);
  });

  it('useSkillOn(Repair) idzie ta sama sciezka', () => {
    const t = robot(0x08);
    const r = useSkillOn(repairer(), Skill.Repair, t, ctx({ int: (min) => min }));
    expect(r.ok).toBe(true);
    expect(t.robotCrippled).toBe(0);
  });

  it('pierwsza pomoc na robocie to zawsze porazka (0x1f7)', () => {
    const u = repairer();
    const t = robot(0);
    t.critter!.curHP = 1;
    const r = useSkillOn(u, Skill.FirstAid, t, ctx({ int: (min) => min }));
    expect(r.ok).toBe(false);
    expect(r.messageId).toBe(503);
  });
});
