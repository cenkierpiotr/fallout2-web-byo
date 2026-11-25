import type { PlayerCritter } from '@f2/app/src/character-binding';
import { defaultSheet, type PlayerSheet } from './save-world';

/** Zamienia krytera z kreatora na arkusz gracza sesji (stan zapisu). */
export function sheetFromCritter(c: PlayerCritter): PlayerSheet {
  const s = defaultSheet();
  for (let i = 0; i < 35; i++) {
    s.baseStats[i] = c.baseStats[i] ?? s.baseStats[i] ?? 5;
    s.statBonuses[i] = c.bonusStats[i] ?? 0;
  }
  for (let i = 0; i < s.skills.length; i++) s.skills[i] = c.skillRaw[i] ?? 0;
  s.taggedSkills = c.tags.filter((t) => t >= 0);
  s.traits = c.traits.filter((t) => t >= 0);
  s.perks = {};
  for (const [id, rank] of Object.entries(c.perkRanks)) if (rank > 0) s.perks[id] = rank;
  s.hp = c.curHP;
  s.radiation = c.curRad;
  s.poison = c.curPoison;
  s.progress = {
    ...s.progress,
    level: c.level,
    xp: c.xp,
    freeSkillPoints: c.skillPoints,
  };
  return s;
}
