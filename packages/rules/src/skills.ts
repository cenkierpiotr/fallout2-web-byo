import data from '../data/skills.json' with { type: 'json' };
import { perkSkillBonus } from './perks.js';
import { statLevel } from './stats.js';
import { traitAdjustSkill } from './traits.js';
import { Stat, type CritterData, type Result, type RulesContext } from './types.js';

export enum Skill {
  SmallGuns = 0,
  BigGuns = 1,
  EnergyWeapons = 2,
  Unarmed = 3,
  Melee = 4,
  Throwing = 5,
  FirstAid = 6,
  Doctor = 7,
  Sneak = 8,
  Lockpick = 9,
  Steal = 10,
  Traps = 11,
  Science = 12,
  Repair = 13,
  Speech = 14,
  Barter = 15,
  Gambling = 16,
  Outdoorsman = 17,
}

export const SKILL_COUNT = 18;

/** Stan skilli krytera: punkty surowe i 4 sloty tagow (-1 = pusty). */
export interface SkillState {
  skillRaw: number[];
  tags: number[];
}

export type SkillCritter = CritterData & SkillState;

/** Kontekst skilli: trudnosc gry (0..2) i oswietlenie kafelka gracza (Ghost). */
export interface SkillsContext extends RulesContext {
  difficulty?: number;
  playerLight?: number;
}

interface SkillDef {
  index: number;
  key: string;
  msgId: number;
  stats: number[];
  multiplier: number;
  base: number;
  pointMult: number;
  xpPerUse: number;
  /** Flaga [10]: bonus XP za margines porazki (skille 9, 10, 11). */
  marginXp?: boolean;
}

export const SKILL_DEFS: readonly SkillDef[] = data.skills;
const MAX = data.max;
const PERK_TAG = data.tag.perk;

export function newSkillState(): SkillState {
  return { skillRaw: new Array<number>(SKILL_COUNT).fill(0), tags: [-1, -1, -1, -1] };
}

function isSkill(s: number): boolean {
  return Number.isInteger(s) && s >= 0 && s < SKILL_COUNT;
}

function hasPerk(c: CritterData, p: number): boolean {
  return (c.perkRanks[p] ?? 0) > 0;
}

function raw(c: SkillCritter, s: number): number {
  return c.skillRaw[s] ?? 0;
}

export function skillIsTagged(c: SkillCritter, s: number): boolean {
  return c.tags.includes(s);
}

/** f2_skill_level (0x4aa558). Poza zakresem: -5. */
export function skillLevel(c: SkillCritter, s: Skill, ctx: SkillsContext): number {
  if (!isSkill(s)) return -5;
  const d = SKILL_DEFS[s] as SkillDef;
  let v = d.base;
  let sum = 0;
  for (const st of d.stats) sum += statLevel(c, st as Stat, ctx);
  v += d.multiplier * sum + d.pointMult * raw(c, s);
  if (!c.isPlayer) return Math.min(MAX, v);

  if (skillIsTagged(c, s)) {
    v += d.pointMult * raw(c, s);
    if (!(hasPerk(c, PERK_TAG) && c.tags[3] === s)) v += data.tag.bonusFlat;
  }
  v += traitAdjustSkill(c, s);
  v += perkSkillBonus(c, s, ctx.playerLight);
  if (s >= data.difficulty.firstSkill) {
    const diff = String(ctx.difficulty ?? data.difficulty.default) as '0' | '1' | '2';
    v += data.difficulty.byLevel[diff] ?? 0;
  }
  return Math.min(MAX, v);
}

/** Oznacza skill tagiem (3 sloty, 4. po perku Tag!). */
export function skillTag(c: SkillCritter, s: Skill): Result {
  if (!isSkill(s)) return { ok: false, reason: 'skill-invalid' };
  if (skillIsTagged(c, s)) return { ok: false, reason: 'skill-already-tagged' };
  const slots = hasPerk(c, PERK_TAG) ? data.tag.slots : data.tag.baseSlots;
  const i = c.tags.slice(0, slots).indexOf(-1);
  if (i < 0) return { ok: false, reason: 'tag-limit' };
  c.tags[i] = s;
  return { ok: true };
}

export function skillUntag(c: SkillCritter, s: Skill): Result {
  const i = c.tags.indexOf(s);
  if (!isSkill(s) || i < 0) return { ok: false, reason: 'skill-not-tagged' };
  c.tags[i] = -1;
  return { ok: true };
}

function tier(v: number): number {
  for (const t of data.costTable) if (v <= t.upTo) return t.cost;
  return Number.POSITIVE_INFINITY;
}

/** Koszt podniesienia skilla o 1 raw; Infinity gdy skill >= 300. */
export function skillPointCost(c: SkillCritter, s: Skill, ctx: SkillsContext): number {
  return tier(skillLevel(c, s, ctx));
}

/** Pula nierozdanych punktow (pcstat 0). */
export interface SkillPoolState {
  skillPoints: number;
}

/** f2_skill_inc (0x4aa6bc); tylko gracz. */
export function skillInc(c: SkillCritter & SkillPoolState, s: Skill, ctx: SkillsContext): Result {
  if (!c.isPlayer || !isSkill(s)) return { ok: false, reason: 'skill-invalid' };
  const v = skillLevel(c, s, ctx);
  if (v >= MAX) return { ok: false, reason: 'skill-max' };
  if (c.skillPoints <= 0) return { ok: false, reason: 'no-skill-points' };
  const cost = tier(v);
  if (c.skillPoints < cost) return { ok: false, reason: 'no-skill-points' };
  c.skillPoints -= cost;
  c.skillRaw[s] = raw(c, s) + 1;
  return { ok: true };
}

/**
 * f2_skill_dec (0x4aa8c4). Zwrot dla taga pomniejszony o 1 przy zmianie progu
 * (zachowanie oryginalu); fix `skillRefundTagTier` zwraca pelny koszt.
 */
export function skillDec(c: SkillCritter & SkillPoolState, s: Skill, ctx: SkillsContext): Result {
  if (!c.isPlayer || !isSkill(s)) return { ok: false, reason: 'skill-invalid' };
  if (raw(c, s) <= 0) return { ok: false, reason: 'skill-no-points' };
  const v = skillLevel(c, s, ctx);
  const cost = tier(v - 1);
  c.skillRaw[s] = raw(c, s) - 1;
  let refund = cost;
  if (skillIsTagged(c, s) && !ctx.fixes['skillRefundTagTier']) {
    if (tier(v - 1) !== tier(skillLevel(c, s, ctx))) refund = cost - 1;
  }
  c.skillPoints += refund;
  return { ok: true };
}

/**
 * f2_skill_inc_force 0x4aa7f8 (D): tylko gracz, skill 0..17; poziom < 300 => surowy +1 bez kosztu puli.
 * Zwraca 0, -5 (zly cel/skill) lub -3 (limit 300).
 */
export function skillIncForce(c: SkillCritter, s: number, ctx: SkillsContext): number {
  if (!c.isPlayer || !isSkill(s)) return -5;
  if (skillLevel(c, s, ctx) >= MAX) return -3;
  c.skillRaw[s] = raw(c, s) + 1;
  return 0;
}

/**
 * critter_mod_skill(obj, skill, amount) 0x45b840 (D): kwota 0 = blad; liczba krokow = |amount|, dla taga
 * polowa (>>1); kazdy krok to skill_inc_force. Ujemna kwota rowniez zwieksza (cmp unsigned w oryginale:
 * galaz skill_dec jest martwa). Zwraca zawsze 0.
 */
export function skillModScripted(
  c: SkillCritter,
  s: number,
  amount: number,
  ctx: SkillsContext,
): number {
  if (amount === 0 || !c.isPlayer) return 0;
  let n = Math.abs(amount);
  if (skillIsTagged(c, s)) n >>= 1;
  for (let i = 0; i < n; i++) skillIncForce(c, s, ctx);
  return 0;
}
