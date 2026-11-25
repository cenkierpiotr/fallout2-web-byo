import data from '../data/perks.json' with { type: 'json' };
import { statLevel } from './stats.js';
import { Stat, type CritterData, type Result, type RulesContext } from './types.js';

export enum Perk {
  Awareness = 0,
  BonusHtHAttacks = 1,
  BonusHtHDamage = 2,
  BonusMove = 3,
  BonusRangedDamage = 4,
  BonusRateOfFire = 5,
  EarlierSequence = 6,
  FasterHealing = 7,
  MoreCriticals = 8,
  NightVision = 9,
  Presence = 10,
  RadResistance = 11,
  Toughness = 12,
  StrongBack = 13,
  Sharpshooter = 14,
  SilentRunning = 15,
  Survivalist = 16,
  MasterTrader = 17,
  Educated = 18,
  Healer = 19,
  FortuneFinder = 20,
  BetterCriticals = 21,
  Empathy = 22,
  Slayer = 23,
  Sniper = 24,
  SilentDeath = 25,
  ActionBoy = 26,
  MentalBlock = 27,
  Lifegiver = 28,
  Dodger = 29,
  Snakeater = 30,
  MrFixit = 31,
  Medic = 32,
  MasterThief = 33,
  Speaker = 34,
  HeaveHo = 35,
  ErrorUnimped = 36,
  Pickpocket = 37,
  Ghost = 38,
  CultOfPersonality = 39,
  Scrounger = 40,
  Explorer = 41,
  FlowerChild = 42,
  Pathfinder = 43,
  AnimalFriend = 44,
  Scout = 45,
  MysteriousStranger = 46,
  Ranger = 47,
  QuickPockets = 48,
  SmoothTalker = 49,
  SwiftLearner = 50,
  Tag = 51,
  Mutate = 52,
  NukaColaAddiction = 53,
  BuffoutAddiction = 54,
  MentatsAddiction = 55,
  PsychoAddiction = 56,
  RadawayAddiction = 57,
  WeaponLongRange = 58,
  WeaponAccurate = 59,
  WeaponPenetrate = 60,
  WeaponKnockback = 61,
  PoweredArmor = 62,
  CombatArmor = 63,
  WeaponScopeRange = 64,
  WeaponFastReload = 65,
  WeaponNightSight = 66,
  WeaponFlameboy = 67,
  ArmorAdvancedI = 68,
  ArmorAdvancedII = 69,
  JetAddiction = 70,
  TragicAddiction = 71,
  ArmorCharisma = 72,
  GeckoSkinning = 73,
  DermalImpactArmor = 74,
  DermalImpactAssltEnhance = 75,
  PhoenixArmorImplants = 76,
  PhoenixAssaultEnhancement = 77,
  VaultCityInoculations = 78,
  AdrenalineRush = 79,
  CautiousNature = 80,
  Comprehension = 81,
  DemolitionExpert = 82,
  Gambler = 83,
  GainStrength = 84,
  GainPerception = 85,
  GainEndurance = 86,
  GainCharisma = 87,
  GainIntelligence = 88,
  GainAgility = 89,
  GainLuck = 90,
  Harmless = 91,
  HereAndNow = 92,
  HtHEvade = 93,
  KamaSutraMaster = 94,
  KarmaBeacon = 95,
  LightStep = 96,
  LivingAnatomy = 97,
  MagneticPersonality = 98,
  Negotiator = 99,
  PackRat = 100,
  Pyromaniac = 101,
  QuickRecovery = 102,
  Salesman = 103,
  Stonewall = 104,
  Thief = 105,
  WeaponHandling = 106,
  VaultCityTraining = 107,
  AlcoholRaisedHitPoints = 108,
  AlcoholRaisedHitPointsII = 109,
  AlcoholLoweredHitPoints = 110,
  AlcoholLoweredHitPointsII = 111,
  AutodocRaisedHitPoints = 112,
  AutodocRaisedHitPointsII = 113,
  AutodocLoweredHitPoints = 114,
  AutodocLoweredHitPointsII = 115,
  ExpertExcrementExpeditor = 116,
  WeaponEnhancedKnockout = 117,
  Jinxed = 118,
}

export interface PerkReq {
  skill?: number;
  gvar?: number;
  name: string;
  min: number;
}
export interface PerkEffect {
  kind: 'stat' | 'skill' | 'proc';
  target: number;
  delta: number;
  proc?: string;
}
export interface PerkDef {
  index: number;
  key: string;
  msgId: number;
  descMsgId: number;
  /** -1 = nieselektowalny (skrypt/pancerz/chemia). */
  maxRank: number;
  minLevel: number;
  /** Wymagania SPECIAL: dodatnie = minimum, ujemne = maksimum (odpada gdy poziom >= |v|). */
  stats: Record<string, number>;
  skills: PerkReq[];
  skillOp: 'none' | 'AND' | 'OR';
  perks: number[];
  effects: PerkEffect[];
  scriptOnly: boolean;
  category: string;
  status: string;
}

export const PERK_COUNT = 119;
export const PERK_DEFS: readonly PerkDef[] = data.perks as PerkDef[];

const SPECIAL_KEYS = ['ST', 'PE', 'EN', 'CH', 'IN', 'AG', 'LK'];

/** Kontekst decyzji o perku: poziom gracza, GVAR-y i (w ctx.skillLevel) poziom skilla. */
export interface PerkContext extends RulesContext {
  level: number;
  gvar?: (id: number) => number;
}

export function perkLevel(c: CritterData, p: Perk): number {
  return PERK_DEFS[p] ? (c.perkRanks[p] ?? 0) : 0;
}

/** Sprawdza wymagania (f2_perk_can_add 0x49680c). Zawsze zwraca pelna liste niespelnionych. */
export function perkCanAdd(
  c: CritterData,
  p: Perk,
  ctx: PerkContext,
): { ok: boolean; unmet: string[] } {
  const def = PERK_DEFS[p];
  if (!def) return { ok: false, unmet: ['invalid-perk'] };
  const unmet: string[] = [];
  if (def.maxRank < 0) unmet.push('not-selectable');
  else if (perkLevel(c, p) >= def.maxRank) unmet.push('max-rank');
  if (c.isPlayer && ctx.level < def.minLevel) unmet.push(`level<${def.minLevel}`);
  SPECIAL_KEYS.forEach((k, i) => {
    const req = def.stats[k];
    if (req === undefined || req === 0 || def.maxRank < 0) return;
    const v = statLevel(c, i as Stat, ctx);
    if (req > 0 && v < req) unmet.push(`${k}<${req}`);
    if (req < 0 && v >= -req) unmet.push(`${k}>=${-req}`);
  });
  const reqs = def.skills;
  if (reqs.length > 0) {
    const results = reqs.map((r) => {
      const have =
        r.skill !== undefined
          ? (ctx.skillLevel?.(c, r.skill) ?? 0)
          : (ctx.gvar?.(r.gvar ?? 0) ?? 0);
      const label = r.skill !== undefined ? `skill:${r.name}<${r.min}` : `gvar:${r.gvar}<${r.min}`;
      return { ok: have >= r.min, label };
    });
    const pass = def.skillOp === 'OR' ? results.some((r) => r.ok) : results.every((r) => r.ok);
    if (!pass) for (const r of results) if (!r.ok) unmet.push(r.label);
  }
  for (const q of def.perks)
    if (perkLevel(c, q) === 0) unmet.push(`perk:${PERK_DEFS[q]?.key ?? q}`);
  return { ok: unmet.length === 0, unmet };
}

function applyEffects(c: CritterData, def: PerkDef, sign: 1 | -1): void {
  for (const e of def.effects) {
    if (e.kind !== 'stat') continue;
    c.bonusStats[e.target] = (c.bonusStats[e.target] ?? 0) + sign * e.delta;
  }
}

function addRank(c: CritterData, p: Perk): void {
  const def = PERK_DEFS[p] as PerkDef;
  c.perkRanks[p] = perkLevel(c, p) + 1;
  applyEffects(c, def, 1);
}

/** Dodaje jedna range z weryfikacja wymagan. Efekty statowe ida do bonusStats (jak oryginal 0x496bfc). */
export function perkAdd(c: CritterData, p: Perk, ctx: PerkContext): Result {
  const r = perkCanAdd(c, p, ctx);
  if (!r.ok) return { ok: false, reason: r.unmet[0] ?? 'perk-unavailable' };
  addRank(c, p);
  return { ok: true };
}

/** Dodanie wymuszone (skrypt, pancerz, chemia): pomija wymagania; limit rangi 1 dla nieselektowalnych. */
export function perkAddForce(c: CritterData, p: Perk): Result {
  const def = PERK_DEFS[p];
  if (!def) return { ok: false, reason: 'invalid-perk' };
  if (perkLevel(c, p) >= (def.maxRank < 0 ? 1 : def.maxRank))
    return { ok: false, reason: 'max-rank' };
  addRank(c, p);
  return { ok: true };
}

export function perkRemove(c: CritterData, p: Perk): Result {
  const def = PERK_DEFS[p];
  if (!def) return { ok: false, reason: 'invalid-perk' };
  const rank = perkLevel(c, p);
  if (rank === 0) return { ok: false, reason: 'perk-not-owned' };
  c.perkRanks[p] = rank - 1;
  applyEffects(c, def, -1);
  return { ok: true };
}

export function availablePerks(c: CritterData, ctx: PerkContext): Perk[] {
  const out: Perk[] = [];
  for (const def of PERK_DEFS) if (perkCanAdd(c, def.index as Perk, ctx).ok) out.push(def.index);
  return out;
}

/**
 * Suma statBonus/delt SPECIAL perkow po rangach (informacyjnie). NIE wpinac do statLevel:
 * perkAdd zapisuje te same wartosci w bonusStats (podwojne liczenie).
 */
export function perkStatBonus(c: CritterData, s: Stat): number {
  let sum = 0;
  for (const def of PERK_DEFS) {
    const rank = c.perkRanks[def.index] ?? 0;
    if (rank === 0) continue;
    for (const e of def.effects) if (e.kind === 'stat' && e.target === s) sum += rank * e.delta;
  }
  return sum;
}

/**
 * Ruch gracza 0x41405c/0x414394/0x41810c (D, specyfikacja formatu): gdy skradanie aktywne (0x42e2f8) i brak perku
 * Silent Running (id 15, ranga 0), animacja ruchu spada z biegu (0x13) do chodu (1). Perk pozwala biec
 * w skradaniu. Dla krytera innego niz gracz i przy braku skradania bieg nie jest zmieniany.
 */
export function playerMayRun(c: CritterData, sneaking: boolean): boolean {
  return !(c.isPlayer && sneaking && perkLevel(c, Perk.SilentRunning) === 0);
}

/**
 * f2_perk_skill_bonus 0x496dd0: stale bonusy (ranga != 0, bez mnozenia). Ghost (+20 Sneak) tylko gdy
 * `lightAtPlayer <= 0xb333`; brak podanego swiatla = bonus nie jest liczony.
 */
export function perkSkillBonus(c: CritterData, skill: number, lightAtPlayer?: number): number {
  if (!c.isPlayer) return 0;
  let sum = 0;
  for (const def of PERK_DEFS) {
    if ((c.perkRanks[def.index] ?? 0) === 0) continue;
    for (const e of def.effects) if (e.kind === 'skill' && e.target === skill) sum += e.delta;
  }
  if (
    (c.perkRanks[Perk.Ghost] ?? 0) > 0 &&
    skill === 8 &&
    lightAtPlayer !== undefined &&
    lightAtPlayer <= 0xb333
  )
    sum += 20;
  return sum;
}

/**
 * critter_add_trait(obj, 0, perk, amount != 0) -> f2_perk_add 0x496a9c (D): zakres 0..118, ranga < maxRank
 * (maxRank -1 = bez limitu), bez wymagan; potem efekty statowe (0x496bfc).
 */
export function perkAddScripted(c: CritterData, p: Perk): Result {
  const def = PERK_DEFS[p];
  if (!Number.isInteger(p) || !def) return { ok: false, reason: 'invalid-perk' };
  if (def.maxRank >= 0 && perkLevel(c, p) >= def.maxRank) return { ok: false, reason: 'max-rank' };
  addRank(c, p);
  return { ok: true };
}

/** critter_rm_trait(obj, 0, perk, 0) 0x458c2c (D): petla f2_perk_remove 0x496afc do zera rang. */
export function perkRemoveAllScripted(c: CritterData, p: Perk): void {
  while (perkLevel(c, p) > 0) if (!perkRemove(c, p).ok) break;
}

/**
 * Smooth Talker (perk 49), 0x45aa88 w 0x45965b (D): do testu progu IN opcji dialogu (giq_option) gracz
 * liczy sie z IN podniesionym o range perku (statystyka 4 + ranga). Opcje z progiem ujemnym (niska IN)
 * porownuja ten sam skorygowany IN.
 */
export function dialogIntelligence(c: CritterData, baseIntelligence: number): number {
  return baseIntelligence + perkLevel(c, Perk.SmoothTalker);
}
