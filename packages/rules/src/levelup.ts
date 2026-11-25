import data from '../data/levelup.json' with { type: 'json' };
import { statLevel } from './stats.js';
import { Stat, type CritterData, type RulesContext } from './types.js';

/** Postep gracza: poziom, XP, pula punktow skilli (pcstat 0..2), flaga nowego perku. */
export interface ProgressState {
  level: number;
  xp: number;
  skillPoints: number;
  perkPending: boolean;
}

export type ProgressCritter = CritterData & ProgressState;

const P = data;

export function newProgressState(): ProgressState {
  return { level: 1, xp: 0, skillPoints: 0, perkPending: false };
}

/** f2_pc_exp_for_level (0x4af9a8): -1 dla L >= 99. */
export function expForLevel(level: number): number {
  if (level >= P.maxLevel) return -1;
  return P.xpFactor * level * (level - 1);
}

/**
 * Here and Now (perk 92), efekt dodania 0x496bfc (D): XP do nastepnego poziomu =
 * f2_pc_exp_for_level(level + 1) - biezace XP (0x4af9a8 minus statystyka 2), przyznane przez
 * 0x4afab8 z flaga 0 (bez komunikatu; Swift Learner dziala jak zwykle). Wartosc zapamietana w 0x51c124;
 * zdjecie perku (0x496ce0) odejmuje ja od XP. Wierna kopia: dla level >= 98 exp_for_level zwraca -1.
 */
export function hereAndNowGrant(c: { level: number; xp: number }): number {
  return expForLevel(c.level + 1) - c.xp;
}

/** Czy na tym poziomie przysluguje perk (bez limitu 37). */
export function perkDueAtLevel(level: number, hasSkilledTrait: boolean): boolean {
  const interval = P.perk.interval + (hasSkilledTrait ? P.perk.skilledExtra : 0);
  return level % interval === 0;
}

function rank(c: CritterData, perk: number): number {
  return c.perkRanks[perk] ?? 0;
}

function perkCount(c: CritterData): number {
  let n = 0;
  for (let i = 0; i <= P.perk.scanMax; i++) if ((c.perkRanks[i] ?? 0) > 0) n++;
  return n;
}

/**
 * Jeden awans: poziom +1, HP, punkty skilli, flaga perku.
 * Zmiana maxHP leczy aktualne HP o te sama wartosc.
 */
export function levelUp(
  c: ProgressCritter,
  ctx: RulesContext,
): { hpGained: number; skillPoints: number; perkAvailable: boolean } {
  if (c.level >= P.maxLevel) return { hpGained: 0, skillPoints: 0, perkAvailable: false };
  c.level += 1;

  const en = statLevel(c, Stat.Endurance, ctx);
  const hpGained =
    Math.floor(en / P.hp.enDivisor) + P.hp.base + P.hp.perRank * rank(c, P.hp.lifegiverPerk);
  const maxBefore = statLevel(c, Stat.MaxHitPoints, ctx);
  const baseBefore =
    c.baseStats[Stat.MaxHitPoints] ?? maxBefore - (c.bonusStats[Stat.MaxHitPoints] ?? 0);
  c.baseStats[Stat.MaxHitPoints] = baseBefore + hpGained;
  c.curHP += statLevel(c, Stat.MaxHitPoints, ctx) - maxBefore;

  const sp = P.skillPoints;
  const int = statLevel(c, Stat.Intelligence, ctx);
  let pts =
    c.skillPoints +
    sp.base +
    sp.perIntelligence * int +
    sp.perEducatedRank * rank(c, sp.educatedPerk);
  const skilled = c.traits.includes(sp.skilledTrait);
  if (skilled) pts += sp.skilledBonus;
  if (c.traits.includes(sp.giftedTrait)) pts = Math.max(0, pts - sp.giftedPenalty);
  pts = Math.min(sp.cap, pts);
  c.skillPoints = pts;

  const perkAvailable = perkDueAtLevel(c.level, skilled) && perkCount(c) < P.perk.cap;
  if (perkAvailable) c.perkPending = true;
  return { hpGained, skillPoints: pts, perkAvailable };
}

/** f2_pc_add_experience (0x4afaa8): Swift Learner, petla awansu. */
export function addExperience(
  c: ProgressCritter,
  amount: number,
  ctx: RulesContext,
): { levelsGained: number; perkAvailable: boolean } {
  const bonus = Math.trunc(
    (amount * P.swiftLearner.percentPerRank * rank(c, P.swiftLearner.perk)) / 100,
  );
  c.xp = Math.min(P.maxXp, Math.max(0, c.xp + amount + bonus));
  let levelsGained = 0;
  let perkAvailable = false;
  while (c.level < P.maxLevel && c.xp >= expForLevel(c.level + 1)) {
    const r = levelUp(c, ctx);
    levelsGained += 1;
    perkAvailable ||= r.perkAvailable;
  }
  return { levelsGained, perkAvailable };
}
