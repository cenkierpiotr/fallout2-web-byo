import data from '../data/skill-use.json' with { type: 'json' };
import type { GameObject, ProtoLookup } from './items.js';
import { addExperience, type ProgressCritter } from './levelup.js';
import { RollResult, isSuccess, rollWithMargin } from './roll.js';
import { SKILL_DEFS, Skill, skillLevel, type SkillCritter, type SkillsContext } from './skills.js';
import { statLevel } from './stats.js';
import { Perk } from './perks.js';
import { stealAttempt, stealThiefChance, type StealParams } from './steal.js';
import { Stat } from './types.js';

/** Stan obiektu istotny dla skilli uzytkowych (rozszerza GameObject). */
export interface SkillObjectState {
  locked?: boolean;
  /** Zamek zablokowany po krytycznej porazce. */
  jammed?: boolean;
  trapDifficulty?: number;
  trapArmed?: boolean;
  /** Cel naprawy (maszyna/robot). */
  broken?: boolean;
  /** Bity okaleczonych konczyn (data.heal.limbMasks). */
  crippled?: number;
  /** Typ ciala krytera (GCD +0x164, getter 0x42ddc4): 2 = robot. */
  bodyType?: number;
  /** Flagi okaleczen robota naprawiane Repair (maski data.repair.limbMasks). */
  robotCrippled?: number;
  /** Skille, za ktore XP na tym obiekcie juz przyznano. */
  skillUsed?: Record<number, true>;
  /** Steal: cel powalony lub nieprzytomny (flagi obrazen & 3, 0x4abbe4). */
  downed?: boolean;
  /** Steal: cel NIE stoi tylem do zlodzieja (0x412bc4 == 1). Brak = zaklada ze cel widzi zlodzieja. */
  seesThief?: boolean;
  /** Steal: cel w druzynie gracza (0x494fc4): kradziez bez ryzyka. */
  inPlayerParty?: boolean;
  /** Steal: liczba przedmiotow juz przeniesionych w tej sesji kradziezy. */
  stealCount?: number;
}

/** Stan uzytkownika: znaczniki czasu uzyc (pierwsza pomoc/doktor) i skradanie. */
export interface SkillUserState {
  skillUseTimes?: Record<number, number[]>;
  sneaking?: boolean;
}

export type SkillObject = GameObject & SkillObjectState & SkillUserState;

/** Lokalny interfejs hookow VM (M3: Hooks). `true` = skrypt przejmuje (script_overrides). */
export interface SkillHooks {
  useSkillOnProc?(obj: GameObject, skill: Skill): boolean;
}

export interface SkillUseContext extends SkillsContext {
  hooks?: SkillHooks;
  protos?: ProtoLookup;
}

export type SkillEffect =
  | { kind: 'heal'; amount: number }
  | { kind: 'uncripple'; mask: number; messageId: number }
  | { kind: 'unlock' }
  | { kind: 'jam' }
  | { kind: 'steal'; itemId: number }
  | { kind: 'caught' }
  | { kind: 'repair' }
  | { kind: 'science' }
  | { kind: 'disarm' }
  | { kind: 'triggerTrap' }
  | { kind: 'sneak'; on: boolean };

export interface SkillUseResult {
  ok: boolean;
  reason?: string;
  roll: RollResult | null;
  messageId: number | null;
  xp: number;
  minutesSpent: number;
  effects: SkillEffect[];
  /** Skrypt przejal obsluge (regula domyslna pominieta). */
  overridden?: boolean;
}

export interface SkillUseOptions {
  /** Narzedzie (lockpick) albo kradziony przedmiot (steal). */
  tool?: GameObject | null;
}

const D = data;
const MSG = D.messages;

function critOf(o: SkillObject): SkillCritter | null {
  return (o.critter as SkillCritter | undefined) ?? null;
}

function critsEnabled(ctx: SkillUseContext): boolean {
  return ctx.clock.ticks >= D.roll.critsEnabledAfterTicks;
}

function userSkill(user: SkillObject, skill: Skill, ctx: SkillUseContext): number {
  const c = critOf(user);
  return c ? skillLevel(c, skill, ctx) : 0;
}

function capChance(v: number): number {
  return Math.max(0, Math.min(D.roll.chanceCap, v));
}

function critMod(user: SkillObject, ctx: SkillUseContext): number {
  const c = user.critter;
  return c ? statLevel(c, Stat.CriticalChance, ctx) : 0;
}

function fail(reason: string, messageId: number | null = null): SkillUseResult {
  return { ok: false, reason, roll: null, messageId, xp: 0, minutesSpent: 0, effects: [] };
}

export function lockpickChance(
  user: SkillObject,
  target: SkillObject,
  tool: GameObject | null,
  ctx: SkillUseContext,
): number {
  const bonus = tool
    ? ((D.lockpick.toolBonus as Record<string, number>)[String(tool.pid)] ?? 0)
    : 0;
  return capChance(userSkill(user, Skill.Lockpick, ctx) + bonus);
}

/** Parametry kradziezy wg 0x4abbe4 (patrz steal.ts); brak danych celu = cel widzi zlodzieja, nie lezy. */
export function stealParams(
  user: SkillObject,
  target: SkillObject,
  item: GameObject | null,
  ctx: SkillUseContext,
): StealParams {
  const uc = user.critter;
  const tc = target.critter;
  return {
    thiefSkill: userSkill(user, Skill.Steal, ctx),
    thiefCriticalChance: critMod(user, ctx),
    thiefIsPlayerWithPickpocket: !!uc?.isPlayer && (uc.perkRanks[Perk.Pickpocket] ?? 0) > 0,
    thiefIsPlayer: !!uc?.isPlayer,
    itemSize: item && ctx.protos ? (ctx.protos(item.pid)?.size ?? 0) : 0,
    transferredCount: target.stealCount ?? 0,
    targetIsCritter: !!tc,
    targetSeesThief: target.seesThief ?? true,
    targetDowned: target.downed ?? false,
    targetSkill: tc ? skillLevel(tc as SkillCritter, Skill.Steal, ctx) : 0,
    targetInPlayerParty: target.inPlayerParty ?? false,
  };
}

/** Szansa zlodzieja (0..95) wg 0x4abbe4. */
export function stealChance(
  user: SkillObject,
  target: SkillObject,
  item: GameObject | null,
  ctx: SkillUseContext,
): number {
  return Math.max(0, stealThiefChance(stealParams(user, target, item, ctx)));
}

export function repairChance(
  user: SkillObject,
  _target: SkillObject,
  ctx: SkillUseContext,
): number {
  return capChance(userSkill(user, Skill.Repair, ctx));
}

export function scienceChance(
  user: SkillObject,
  _target: SkillObject,
  ctx: SkillUseContext,
): number {
  return capChance(userSkill(user, Skill.Science, ctx));
}

export function trapsDisarmChance(
  user: SkillObject,
  target: SkillObject,
  ctx: SkillUseContext,
): number {
  return capChance(userSkill(user, Skill.Traps, ctx) - (target.trapDifficulty ?? 0));
}

function activeUses(user: SkillObject, skill: Skill, ctx: SkillUseContext): number[] {
  const t = user.skillUseTimes?.[skill] ?? [];
  return t.filter((ts) => ctx.clock.ticks - ts < D.usage.windowTicks);
}

/** Pozostala liczba uzyc skilla (pierwsza pomoc/doktor) w oknie 25 godzin gry; inne skille: Infinity. */
export function skillUsesLeftToday(user: SkillObject, skill: Skill, ctx: SkillUseContext): number {
  if (!(D.usage.skills as number[]).includes(skill)) return Number.POSITIVE_INFINITY;
  return Math.max(0, D.usage.slots - activeUses(user, skill, ctx).length);
}

function recordUse(user: SkillObject, skill: Skill, ctx: SkillUseContext): void {
  const times = activeUses(user, skill, ctx);
  times.push(ctx.clock.ticks);
  user.skillUseTimes ??= {};
  user.skillUseTimes[skill] = times.slice(-D.usage.slots);
}

/**
 * f2_skill_use_xp (0x4aac2c): XP za uzycie skilla (tylko gracz). `extra` < 0 (margines porazki)
 * dodaje |extra| do XP, gdy skill ma flage marginesu (skills.md, 9/10/11). Zwraca przyznane XP.
 */
function awardXp(user: SkillObject, skill: Skill, ctx: SkillUseContext, extra = 0): number {
  const c = user.critter;
  if (!c?.isPlayer) return 0;
  const def = SKILL_DEFS[skill];
  let xp = def?.xpPerUse ?? 0;
  if (xp <= 0) return 0;
  if (def?.marginXp && extra < 0) xp += Math.abs(extra);
  if (typeof (c as Partial<ProgressCritter>).xp === 'number') {
    const before = (c as ProgressCritter).xp;
    addExperience(c as ProgressCritter, xp, ctx);
    return (c as ProgressCritter).xp - before;
  }
  return xp;
}

function xpOnce(
  user: SkillObject,
  target: SkillObject,
  skill: Skill,
  ctx: SkillUseContext,
  extra = 0,
): number {
  if (!(D.xpOncePerObject as number[]).includes(skill)) return awardXp(user, skill, ctx, extra);
  target.skillUsed ??= {};
  if (target.skillUsed[skill]) return 0;
  target.skillUsed[skill] = true;
  return awardXp(user, skill, ctx, extra);
}

function healerRank(user: SkillObject): number {
  const c = user.critter;
  return c?.isPlayer ? (c.perkRanks[D.heal.healerPerk] ?? 0) : 0;
}

function isRobot(o: SkillObject): boolean {
  return o.bodyType === D.repair.bodyTypeRobot;
}

type HealKind = 'firstAid' | 'doctor';

function heal(
  user: SkillObject,
  target: SkillObject,
  kind: HealKind,
  ctx: SkillUseContext,
): SkillUseResult {
  const def = D.heal[kind];
  const skill = def.skill as Skill;
  const tc = target.critter;
  if (!tc) return fail('no-critter');
  // Pierwsza pomoc/doktor na robocie to zawsze porazka (0x1f7, R18a-U1).
  if (isRobot(target)) return fail('robot', MSG.fail);
  if (skillUsesLeftToday(user, skill, ctx) <= 0) return fail('skill-exhausted', MSG.exhausted);
  const missing = statLevel(tc, Stat.MaxHitPoints, ctx) - tc.curHP;
  if (missing <= 0)
    return fail('no-need', kind === 'firstAid' ? MSG.noNeedFirst : MSG.noNeedDoctor);

  const chance = capChance(userSkill(user, skill, ctx));
  const cm = critMod(user, ctx);
  const ce = critsEnabled(ctx);
  const roll = rollWithMargin(chance, cm, ctx.rng, ce).result;
  const res: SkillUseResult = {
    ok: isSuccess(roll),
    roll,
    messageId: null,
    xp: 0,
    minutesSpent: def.minutes,
    effects: [],
  };
  if (!res.ok) {
    res.messageId = MSG.fail;
    return res;
  }
  const h = healerRank(user);
  const dice = ctx.rng.int(def.min + def.healerMin * h, def.max + def.healerMax * h);
  const amount = Math.min(dice, missing);
  tc.curHP += amount;
  res.effects.push({ kind: 'heal', amount });
  res.messageId = MSG.heal;
  if (kind === 'doctor' && target.crippled) {
    D.heal.limbMasks.forEach((mask, i) => {
      if (!((target.crippled ?? 0) & mask)) return;
      if (isSuccess(rollWithMargin(chance, cm, ctx.rng, ce).result)) {
        target.crippled = (target.crippled ?? 0) & ~mask;
        res.effects.push({ kind: 'uncripple', mask, messageId: D.heal.limbMessages[i] ?? 0 });
      }
    });
  }
  recordUse(user, skill, ctx);
  res.xp = awardXp(user, skill, ctx);
  return res;
}

/**
 * Repair robota (f2_skill_use 0x4aad08, skill 13, R18a-U1). Cel musi miec typ ciala 2. Nie leczy HP:
 * dla kazdej ustawionej flagi okaleczenia (kolejnosc masek z 0x4aa2f0..0x4aa300) osobny rzut, wynik 2/3
 * zdejmuje flage. Limit 3 uzycia na 25 h (jak pierwsza pomoc/doktor); uzycie zapisane po naprawie.
 *
 * TODO(R18a-U1): (a) komunikat 'nie-robot' (kod 0x4ab5fa) i 'brak do naprawy' (0x1f5/0x1f6, nie wiadomo
 * ktory dla Repair) niezdekodowane: messageId = null; (b) komunikat sukcesu per flaga: znany 0x212+i,
 * ale warunek wyboru 0x208/0x209 ("cudzy obiekt") niejasny: uzywamy 0x212+i; (c) co liczy sie jako
 * `ok` i XP przy czesciowym powodzeniu: tu ok = zdjeto co najmniej jedna flage, XP wtedy raz na obiekt;
 * (d) koszt czasu 0x4a3518 niezdekodowany: zostaje stala `repair.minutes` (Z).
 */
export function repairRobot(
  user: SkillObject,
  target: SkillObject,
  ctx: SkillUseContext,
): SkillUseResult {
  if (!isRobot(target)) return fail('not-robot');
  if (skillUsesLeftToday(user, Skill.Repair, ctx) <= 0)
    return fail('skill-exhausted', MSG.exhausted);
  const flags = target.robotCrippled ?? 0;
  if (!D.repair.limbMasks.some((m) => flags & m)) return fail('no-need');

  const chance = repairChance(user, target, ctx);
  const cm = critMod(user, ctx);
  const ce = critsEnabled(ctx);
  const res: SkillUseResult = {
    ok: false,
    roll: null,
    messageId: null,
    xp: 0,
    minutesSpent: D.repair.minutes,
    effects: [],
  };
  D.repair.limbMasks.forEach((mask, i) => {
    if (!((target.robotCrippled ?? 0) & mask)) return;
    const roll = rollWithMargin(chance, cm, ctx.rng, ce).result;
    res.roll = roll;
    if (!isSuccess(roll)) return;
    target.robotCrippled = (target.robotCrippled ?? 0) & ~mask;
    res.ok = true;
    res.effects.push({ kind: 'uncripple', mask, messageId: D.repair.limbMessageBase + i });
  });
  recordUse(user, Skill.Repair, ctx);
  if (res.ok) res.xp = xpOnce(user, target, Skill.Repair, ctx);
  else res.messageId = MSG.fail;
  return res;
}

export function firstAidHeal(
  user: SkillObject,
  target: SkillObject,
  ctx: SkillUseContext,
): SkillUseResult {
  return heal(user, target, 'firstAid', ctx);
}

export function doctorHeal(
  user: SkillObject,
  target: SkillObject,
  ctx: SkillUseContext,
): SkillUseResult {
  return heal(user, target, 'doctor', ctx);
}

export interface SneakResult {
  sneaking: boolean;
  roll: RollResult;
  /** Ticki do nastepnej kontroli (zdarzenie okresowe 0x42e32c). */
  nextCheckTicks: number;
}

/** Sam rzut zdarzenia 0x42e32c (D: `f2_skill_roll(player, 8)`, sukces >= 2); nie dotyka flagi skradania. */
export function sneakCheck(
  user: SkillObject,
  ctx: SkillUseContext,
): { ok: boolean; roll: RollResult; nextCheckTicks: number } {
  const skill = userSkill(user, Skill.Sneak, ctx);
  const roll = rollWithMargin(
    capChance(skill),
    critMod(user, ctx),
    ctx.rng,
    critsEnabled(ctx),
  ).result;
  const ok = isSuccess(roll);
  if (ok) return { ok, roll, nextCheckTicks: D.sneak.successTicks };
  const row = D.sneak.failTicks.find((r) => skill > r.above);
  return { ok, roll, nextCheckTicks: row ? row.ticks : D.sneak.defaultTicks };
}

/** Jedna kontrola skradania (0x42e32c). */
export function sneakToggle(user: SkillObject, ctx: SkillUseContext): SneakResult {
  const c = sneakCheck(user, ctx);
  user.sneaking = c.ok;
  return { sneaking: c.ok, roll: c.roll, nextCheckTicks: c.nextCheckTicks };
}

function simple(
  user: SkillObject,
  target: SkillObject,
  skill: Skill,
  chance: number,
  minutes: number,
  ctx: SkillUseContext,
  onSuccess: (r: SkillUseResult) => void,
  onCritFail: (r: SkillUseResult) => void,
): SkillUseResult {
  const outcome = rollWithMargin(chance, critMod(user, ctx), ctx.rng, critsEnabled(ctx));
  const roll = outcome.result;
  const res: SkillUseResult = {
    ok: isSuccess(roll),
    roll,
    messageId: null,
    xp: 0,
    minutesSpent: minutes,
    effects: [],
  };
  if (res.ok) {
    onSuccess(res);
    res.xp = xpOnce(user, target, skill, ctx);
  } else {
    res.messageId = MSG.fail;
    if (roll === RollResult.CriticalFailure) onCritFail(res);
    // Skille z flaga marginesu: porazka tez daje XP (xpPerUse + |margin|), raz na obiekt (Z, R18a-U1).
    if (SKILL_DEFS[skill]?.marginXp) res.xp = xpOnce(user, target, skill, ctx, outcome.margin);
  }
  return res;
}

/** Uzycie skilla na obiekcie. Skrypt (hook) moze przejac obsluge. */
export function useSkillOn(
  user: SkillObject,
  skill: Skill,
  target: SkillObject,
  ctx: SkillUseContext,
  opts: SkillUseOptions = {},
): SkillUseResult {
  if (ctx.hooks?.useSkillOnProc?.(target, skill)) {
    return {
      ok: true,
      overridden: true,
      roll: null,
      messageId: null,
      xp: 0,
      minutesSpent: 0,
      effects: [],
    };
  }
  const noop = (): void => undefined;
  switch (skill) {
    case Skill.FirstAid:
      return firstAidHeal(user, target, ctx);
    case Skill.Doctor:
      return doctorHeal(user, target, ctx);
    case Skill.Sneak: {
      const s = sneakToggle(user, ctx);
      return {
        ok: s.sneaking,
        roll: s.roll,
        messageId: null,
        xp: 0,
        minutesSpent: 0,
        effects: [{ kind: 'sneak', on: s.sneaking }],
      };
    }
    case Skill.Lockpick: {
      if (target.jammed) return fail('jammed', MSG.jammed);
      return simple(
        user,
        target,
        skill,
        lockpickChance(user, target, opts.tool ?? null, ctx),
        D.lockpick.minutes,
        ctx,
        (r) => {
          target.locked = false;
          r.effects.push({ kind: 'unlock' });
        },
        (r) => {
          target.jammed = true;
          r.effects.push({ kind: 'jam' });
        },
      );
    }
    case Skill.Steal: {
      const item = opts.tool ?? null;
      const out = stealAttempt(stealParams(user, target, item, ctx), ctx.rng, critsEnabled(ctx));
      const res: SkillUseResult = {
        ok: !out.caught,
        roll: out.thiefRoll,
        messageId: null,
        xp: 0,
        minutesSpent: D.steal.minutes,
        effects: [],
      };
      if (!out.caught) {
        if (item) res.effects.push({ kind: 'steal', itemId: item.id });
        res.xp = xpOnce(user, target, skill, ctx);
      } else {
        res.messageId = MSG.fail;
        res.effects.push({ kind: 'caught' });
      }
      return res;
    }
    case Skill.Traps:
      return simple(
        user,
        target,
        skill,
        trapsDisarmChance(user, target, ctx),
        D.traps.minutes,
        ctx,
        (r) => {
          target.trapArmed = false;
          r.effects.push({ kind: 'disarm' });
        },
        (r) => r.effects.push({ kind: 'triggerTrap' }),
      );
    case Skill.Science:
      return simple(
        user,
        target,
        skill,
        scienceChance(user, target, ctx),
        D.science.minutes,
        ctx,
        (r) => r.effects.push({ kind: 'science' }),
        noop,
      );
    case Skill.Repair:
      return repairRobot(user, target, ctx);
    default:
      return fail('skill-not-usable');
  }
}

/** Kandydat do zastapienia rzucajacego w rzucie na skill (czlonek druzyny). */
export interface PartyRollCandidate<T> {
  member: T;
  hidden: boolean;
  isCritter: boolean;
  /** Poziomy wszystkich 18 skilli czlonka (indeks = Skill). */
  levels: readonly number[];
}

/**
 * Wybor rzucajacego w `f2_skill_roll` 0x4aaaa4 (D): dla gracza i skilla != Steal (10) bierze czlonka druzyny
 * o najwyzszym poziomie tego skilla (0x495560: pomija ukrytych i nie-krytery, strict `>` od 0, przy remisie
 * pierwszy w kolejnosci listy), ale tylko gdy ten skill jest jego NAJLEPSZYM skillem (0x495520: indeks pierwszego
 * maksimum po 18 skillach). Zwraca undefined, gdy rzuca sam gracz.
 */
export function pickPartyRoller<T>(
  skill: number,
  candidates: readonly PartyRollCandidate<T>[],
): T | undefined {
  if (skill === Skill.Steal) return undefined;
  let best: PartyRollCandidate<T> | undefined;
  let bestLevel = 0;
  for (const c of candidates) {
    if (c.hidden || !c.isCritter) continue;
    const l = c.levels[skill] ?? 0;
    if (l > bestLevel) {
      best = c;
      bestLevel = l;
    }
  }
  if (!best) return undefined;
  let bestIdx = 0;
  let max = 0;
  for (let i = 0; i < 18; i++) {
    const l = best.levels[i] ?? 0;
    if (l > max) {
      max = l;
      bestIdx = i;
    }
  }
  return bestIdx === skill ? best.member : undefined;
}
