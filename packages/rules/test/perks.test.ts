import { describe, expect, it } from 'vitest';
import {
  PERK_DEFS,
  Perk,
  Stat,
  availablePerks,
  defaultRulesContext,
  newCritterData,
  perkAdd,
  perkAddForce,
  perkCanAdd,
  perkLevel,
  perkRemove,
  perkSkillBonus,
  perkStatBonus,
  playerMayRun,
  statLevel,
  type CritterData,
  type PerkContext,
} from '../src/index.js';

function pc(sp: number[] = [5, 5, 5, 5, 5, 5, 5]): CritterData {
  const c = newCritterData(true);
  sp.forEach((v, i) => (c.baseStats[i] = v));
  return c;
}
function pctx(level: number, skills: Record<number, number> = {}, gvar = 0): PerkContext {
  return {
    ...defaultRulesContext(),
    level,
    skillLevel: (_c, s) => skills[s] ?? 0,
    gvar: () => gvar,
  };
}

describe('tablica perkow', () => {
  it('119 perkow, indeksy ciagle, nazwy unikalne', () => {
    expect(PERK_DEFS).toHaveLength(119);
    PERK_DEFS.forEach((p, i) => expect(p.index).toBe(i));
    expect(new Set(PERK_DEFS.map((p) => p.key)).size).toBe(119);
    expect(Perk.Jinxed).toBe(118);
    expect(Perk.Awareness).toBe(0);
  });

  it('rangi, poziomy i msgId sa poprawne strukturalnie', () => {
    for (const p of PERK_DEFS) {
      expect(p.maxRank === -1 || p.maxRank >= 1, p.key).toBe(true);
      expect(p.minLevel === -1 || p.minLevel >= 1, p.key).toBe(true);
      expect(p.msgId, p.key).toBeGreaterThanOrEqual(101);
      expect(p.descMsgId, p.key).toBe(p.msgId + 1000);
    }
  });
});

describe('perkCanAdd', () => {
  it('Awareness: PE>=5, poziom 3', () => {
    const c = pc();
    expect(perkCanAdd(c, Perk.Awareness, pctx(3))).toEqual({ ok: true, unmet: [] });
    c.baseStats[Stat.Perception] = 4;
    expect(perkCanAdd(c, Perk.Awareness, pctx(2))).toEqual({
      ok: false,
      unmet: ['level<3', 'PE<5'],
    });
  });

  it('Strong Back: ST>=6 EN>=6', () => {
    const c = pc([6, 5, 6, 5, 5, 5, 5]);
    expect(perkCanAdd(c, Perk.StrongBack, pctx(3)).ok).toBe(true);
    c.baseStats[Stat.Endurance] = 5;
    expect(perkCanAdd(c, Perk.StrongBack, pctx(3)).unmet).toEqual(['EN<6']);
  });

  it('Lifegiver: EN>=4, poziom 12, ranga 2 i max-rank', () => {
    const c = pc();
    const x = pctx(12);
    expect(perkAdd(c, Perk.Lifegiver, x)).toEqual({ ok: true });
    expect(perkAdd(c, Perk.Lifegiver, x)).toEqual({ ok: true });
    expect(perkLevel(c, Perk.Lifegiver)).toBe(2);
    expect(perkAdd(c, Perk.Lifegiver, x)).toEqual({ ok: false, reason: 'max-rank' });
    expect(perkCanAdd(c, Perk.Lifegiver, x).unmet).toEqual(['max-rank']);
  });

  it('Tag!, Here and Now, Mutate! bez wymagan poza poziomem', () => {
    const c = pc();
    expect(perkCanAdd(c, Perk.Tag, pctx(11)).unmet).toEqual(['level<12']);
    expect(perkCanAdd(c, Perk.Tag, pctx(12)).ok).toBe(true);
    expect(perkCanAdd(c, Perk.Mutate, pctx(9)).ok).toBe(true);
    expect(perkCanAdd(c, Perk.HereAndNow, pctx(3)).ok).toBe(true);
  });

  it('Sniper: PE>=8 AG>=8 Small Guns>=80, poziom 24', () => {
    const c = pc([5, 8, 5, 5, 5, 8, 5]);
    expect(perkCanAdd(c, Perk.Sniper, pctx(24, { 0: 80 })).ok).toBe(true);
    expect(perkCanAdd(c, Perk.Sniper, pctx(24, { 0: 79 })).unmet).toEqual(['skill:Small Guns<80']);
  });

  it('Educated, Toughness (ranga 3)', () => {
    const c = pc([5, 5, 6, 5, 6, 5, 6]);
    expect(perkCanAdd(c, Perk.Educated, pctx(6)).ok).toBe(true);
    expect(perkCanAdd(c, Perk.Educated, pctx(5)).unmet).toEqual(['level<6']);
    const x = pctx(3);
    for (let i = 0; i < 3; i++) expect(perkAdd(c, Perk.Toughness, x)).toEqual({ ok: true });
    expect(perkAdd(c, Perk.Toughness, x)).toEqual({ ok: false, reason: 'max-rank' });
  });

  it('OR (Mr. Fixit) i AND (Master Thief, Harmless z GVAR)', () => {
    const c = pc();
    expect(perkCanAdd(c, Perk.MrFixit, pctx(12, { 13: 40 })).ok).toBe(true);
    expect(perkCanAdd(c, Perk.MrFixit, pctx(12, { 12: 40 })).ok).toBe(true);
    expect(perkCanAdd(c, Perk.MrFixit, pctx(12, { 12: 39, 13: 10 })).unmet).toEqual([
      'skill:Repair<40',
      'skill:Science<40',
    ]);
    expect(perkCanAdd(c, Perk.MasterThief, pctx(12, { 10: 50, 9: 49 })).unmet).toEqual([
      'skill:Lockpick<50',
    ]);
    expect(perkCanAdd(c, Perk.Harmless, pctx(6, { 10: 50 }, 49)).unmet).toEqual(['gvar:0<50']);
    expect(perkCanAdd(c, Perk.Harmless, pctx(6, { 10: 50 }, 50)).ok).toBe(true);
  });

  it('maksima: Gain Strength zablokowany przy ST 10, Weapon Handling ST<7', () => {
    const c = pc([10, 5, 5, 5, 5, 5, 5]);
    expect(perkCanAdd(c, Perk.GainStrength, pctx(12)).unmet).toEqual(['ST>=10']);
    c.baseStats[Stat.Strength] = 9;
    expect(perkCanAdd(c, Perk.GainStrength, pctx(12)).ok).toBe(true);
    c.baseStats[Stat.Strength] = 7;
    expect(perkCanAdd(c, Perk.WeaponHandling, pctx(12)).unmet).toEqual(['ST>=7']);
  });

  it('nieselektowalne: odrzucone i poza availablePerks; Mental Block poza zasiegiem', () => {
    const c = pc();
    expect(perkAdd(c, Perk.BuffoutAddiction, pctx(99))).toEqual({
      ok: false,
      reason: 'not-selectable',
    });
    const list = availablePerks(c, pctx(3));
    expect(list).toContain(Perk.Awareness);
    expect(list).not.toContain(Perk.BuffoutAddiction);
    expect(list).not.toContain(Perk.MentalBlock);
    expect(list).not.toContain(Perk.Tag);
  });
});

describe('efekty dodania/usuniecia', () => {
  it('Toughness: +10 DR normal na range, usuniecie cofa', () => {
    const c = pc([5, 5, 6, 5, 5, 5, 6]);
    const base = statLevel(c, Stat.DrNormal);
    perkAdd(c, Perk.Toughness, pctx(3));
    expect(statLevel(c, Stat.DrNormal)).toBe(base + 10);
    perkAdd(c, Perk.Toughness, pctx(3));
    expect(statLevel(c, Stat.DrNormal)).toBe(base + 20);
    expect(perkStatBonus(c, Stat.DrNormal)).toBe(20);
    expect(perkRemove(c, Perk.Toughness)).toEqual({ ok: true });
    expect(statLevel(c, Stat.DrNormal)).toBe(base + 10);
    perkRemove(c, Perk.Toughness);
    expect(perkRemove(c, Perk.Toughness)).toEqual({ ok: false, reason: 'perk-not-owned' });
    expect(statLevel(c, Stat.DrNormal)).toBe(base);
  });

  it('Strong Back +50 carry; Powered Armor (force) +3 ST i radRes +30', () => {
    const c = pc([6, 5, 6, 5, 5, 5, 5]);
    const carry = statLevel(c, Stat.CarryWeight);
    perkAdd(c, Perk.StrongBack, pctx(3));
    expect(statLevel(c, Stat.CarryWeight)).toBe(carry + 50);
    perkAddForce(c, Perk.PoweredArmor);
    expect(statLevel(c, Stat.Strength)).toBe(9);
    expect(perkAddForce(c, Perk.PoweredArmor)).toEqual({ ok: false, reason: 'max-rank' });
    perkRemove(c, Perk.PoweredArmor);
    expect(statLevel(c, Stat.Strength)).toBe(6);
  });

  it('delty SPECIAL uzaleznien: Buffout ST-2 EN-2 AG-3', () => {
    const c = pc();
    perkAddForce(c, Perk.BuffoutAddiction);
    expect([Stat.Strength, Stat.Endurance, Stat.Agility].map((s) => statLevel(c, s))).toEqual([
      3, 3, 2,
    ]);
  });
});

describe('perkSkillBonus', () => {
  it('stale, bez mnozenia przez rangi; Skille 0..5 bez bonusu', () => {
    const c = pc();
    c.perkRanks[Perk.Thief] = 1;
    c.perkRanks[Perk.MasterThief] = 1;
    expect(perkSkillBonus(c, 9)).toBe(25);
    expect(perkSkillBonus(c, 10)).toBe(25);
    expect(perkSkillBonus(c, 0)).toBe(0);
    c.perkRanks[Perk.Speaker] = 1;
    c.perkRanks[Perk.Negotiator] = 1;
    c.perkRanks[Perk.ExpertExcrementExpeditor] = 1;
    expect(perkSkillBonus(c, 14)).toBe(35);
  });

  it('pelna tabela delt z f2_perk_skill_bonus 0x496dd0 (perk -> skill: delta)', () => {
    const table: Record<number, [number, number][]> = {
      16: [[17, 25]],
      31: [
        [12, 10],
        [13, 10],
      ],
      32: [
        [6, 10],
        [7, 10],
      ],
      33: [
        [9, 15],
        [10, 15],
      ],
      34: [[14, 20]],
      47: [[17, 15]],
      83: [[16, 20]],
      91: [[10, 20]],
      97: [[7, 10]],
      99: [
        [14, 10],
        [15, 10],
      ],
      103: [[15, 20]],
      105: [
        [8, 10],
        [9, 10],
        [10, 10],
        [11, 10],
      ],
      107: [
        [6, 5],
        [7, 5],
      ],
      116: [[14, 5]],
    };
    for (const [perk, deltas] of Object.entries(table)) {
      const c = pc();
      c.perkRanks[Number(perk)] = 1;
      for (let skill = 6; skill <= 17; skill++) {
        const want = deltas.find(([s]) => s === skill)?.[1] ?? 0;
        expect(perkSkillBonus(c, skill), `perk ${perk} skill ${skill}`).toBe(want);
      }
    }
  });

  it('Ghost +20 Sneak tylko w ciemnosci (0xb333)', () => {
    const c = pc();
    c.perkRanks[Perk.Ghost] = 1;
    expect(perkSkillBonus(c, 8)).toBe(0);
    expect(perkSkillBonus(c, 8, 0xb333)).toBe(20);
    expect(perkSkillBonus(c, 8, 0xb334)).toBe(0);
  });

  it('nie-gracz nie dostaje bonusow', () => {
    const c = newCritterData(false);
    c.perkRanks[Perk.Speaker] = 1;
    expect(perkSkillBonus(c, 14)).toBe(0);
  });
});

describe('Silent Running (0x41405c, D)', () => {
  it('skradanie bez perku wymusza chod, z perkiem pozwala biec', () => {
    const c = pc();
    expect(playerMayRun(c, false)).toBe(true);
    expect(playerMayRun(c, true)).toBe(false);
    perkAddForce(c, Perk.SilentRunning);
    expect(playerMayRun(c, true)).toBe(true);
  });
  it('krytery inne niz gracz nie sa ograniczane', () => {
    expect(playerMayRun(newCritterData(false), true)).toBe(true);
  });
});
