import { describe, expect, it } from 'vitest';
import { newCritterData, newProgressState, newSkillState } from '@f2/rules';
import type { PlayerCritter } from '@f2/app/src/character-binding';
import { sheetFromCritter } from './character';
import { defaultSheet } from './save-world';

describe('sheetFromCritter', () => {
  it('przenosi staty, skille, tagi, traity i postep', () => {
    const c: PlayerCritter = {
      ...newCritterData(),
      ...newSkillState(),
      ...newProgressState(),
    };
    c.baseStats[0] = 8;
    c.bonusStats[1] = 2;
    c.skillRaw[3] = 40;
    c.tags = [3, 5, -1, -1];
    c.traits = [2, -1];
    c.perkRanks = { 7: 1, 9: 0 };
    c.curHP = 41;
    c.skillPoints = 5;
    const s = sheetFromCritter(c);
    expect(s.baseStats[0]).toBe(8);
    expect(s.statBonuses[1]).toBe(2);
    expect(s.skills[3]).toBe(40);
    expect(s.taggedSkills).toEqual([3, 5]);
    expect(s.traits).toEqual([2]);
    expect(s.perks).toEqual({ 7: 1 });
    expect(s.hp).toBe(41);
    expect(s.progress.freeSkillPoints).toBe(5);
    expect(s.progress.level).toBe(1);
  });

  it('plec z kreatora (stat 0x22 = 1, zenska) trafia do arkusza; domyslny arkusz to mezczyzna', () => {
    const c: PlayerCritter = { ...newCritterData(), ...newSkillState(), ...newProgressState() };
    c.baseStats[0x22] = 1;
    expect(sheetFromCritter(c).baseStats[0x22]).toBe(1);
    expect(defaultSheet().baseStats[0x22]).toBe(0);
  });
});
