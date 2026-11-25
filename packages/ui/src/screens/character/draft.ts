import type { CostTier, PlayerView } from './types';

export type Draft = Record<number, number>;

export function tierCost(tiers: CostTier[], level: number): number {
  for (const t of tiers) if (level <= t.upTo) return t.cost;
  return Number.POSITIVE_INFINITY;
}

export interface SkillPreview {
  /** Poziom po zastosowaniu draftu. */
  level: number;
  /** Koszt calego draftu dla tego skilla. */
  spent: number;
  /** Koszt kolejnego +1 (Infinity gdy maks.). */
  nextCost: number;
  /** Poziom po kolejnym +1. */
  nextLevel: number;
}

export function previewSkill(p: PlayerView, skill: number, steps: number): SkillPreview {
  const s = p.skills[skill];
  if (!s) return { level: 0, spent: 0, nextCost: Number.POSITIVE_INFINITY, nextLevel: 0 };
  let level = s.level;
  let spent = 0;
  for (let i = 0; i < steps; i++) {
    spent += tierCost(p.skillCostTiers, level);
    level = Math.min(p.skillMax, level + s.gain);
  }
  const atMax = level >= p.skillMax;
  return {
    level,
    spent,
    nextCost: atMax ? Number.POSITIVE_INFINITY : tierCost(p.skillCostTiers, level),
    nextLevel: Math.min(p.skillMax, level + s.gain),
  };
}

export function draftSpent(p: PlayerView, draft: Draft): number {
  let sum = 0;
  for (const [k, n] of Object.entries(draft)) sum += previewSkill(p, Number(k), n).spent;
  return sum;
}

export function draftRemaining(p: PlayerView, draft: Draft): number {
  return p.skillPoints - draftSpent(p, draft);
}

export function canIncrease(p: PlayerView, draft: Draft, skill: number): boolean {
  const pv = previewSkill(p, skill, draft[skill] ?? 0);
  return Number.isFinite(pv.nextCost) && pv.nextCost <= draftRemaining(p, draft);
}

export function canDecrease(draft: Draft, skill: number): boolean {
  return (draft[skill] ?? 0) > 0;
}

export function draftSteps(draft: Draft): number {
  return Object.values(draft).reduce((a, n) => a + n, 0);
}
