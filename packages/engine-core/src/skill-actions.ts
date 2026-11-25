import type { CritterProto } from '@f2/formats';
import {
  Skill,
  Stat,
  lockpickChance,
  newCritterData,
  newSkillState,
  repairChance,
  scienceChance,
  skillLevel,
  stealChance,
  targetSeesThiefByRotation,
  trapsDisarmChance,
  useSkillOn,
  type SkillCritter,
  type SkillEffect,
  type SkillObject,
  type SkillUseContext,
  type SkillUseResult,
} from '@f2/rules';
import { critterHeal, critterHp } from './critter-model.js';
import { DOOR_LOCKED_BIT, isDoor, isDoorLocked } from './doors.js';
import type { GameClock } from './game-clock.js';
import type { GameObject } from './game-object.js';
import { hexDistance } from './hexgrid.js';

/**
 * Uzycie skilli na obiektach swiata (wytrych, kradziez, naprawa, nauka, doktor, pierwsza pomoc,
 * pulapki). Logika kostek/XP/czasu zyje w `@f2/rules` (`useSkillOn`); ten modul to adapter:
 * lista skilli dla celu, widok `SkillObject` z trwalym stanem na obiekcie, hook `use_skill_on_p_proc`
 * skryptu celu, zastosowanie efektow w swiecie i uplyw czasu.
 */

const TYPE_ITEM = 0;
const TYPE_CRITTER = 1;
const TYPE_SCENERY = 2;
const ITEM_CONTAINER = 1;
const STAT_MAX_HP = Stat.MaxHitPoints;
const TICKS_PER_MINUTE = 600;
/** Z: maksymalny dystans (heksy) uzycia skilla; oryginal podchodzi do celu przed uzyciem. */
export const SKILL_USE_RANGE = 2;
const FLAG_LOCKED = 0x2;
const BODY_ROBOT = 2;

/** Stan skilli obiektu, niezapisywany w mapie (Z: zapis stanu w savegame jeszcze nie podpiety). */
export interface ObjSkillState {
  locked?: boolean;
  jammed?: boolean;
  trapArmed?: boolean;
  trapDifficulty?: number;
  robotCrippled?: number;
  skillUsed?: Record<number, true>;
  /** Nadpisania danych celu kradziezy (testy/skrypty); brak = liczone z obiektu. */
  downed?: boolean;
  seesThief?: boolean;
  inPlayerParty?: boolean;
}
const states = new WeakMap<GameObject, ObjSkillState>();

export function skillState(o: GameObject): ObjSkillState {
  let s = states.get(o);
  if (!s) {
    s = {};
    states.set(o, s);
  }
  return s;
}

export const isContainerObj = (o: GameObject): boolean =>
  (o.type === TYPE_ITEM && o.extra.kind === 'item' && o.extra.subtype === ITEM_CONTAINER) ||
  (o.type === TYPE_SCENERY && o.extra.kind === 'scenery' && o.inventory.length > 0);

/** Czy obiekt ma zamek (drzwi albo pojemnik) i jest zamkniety. Z: bit 0x2 flag dla pojemnikow. */
export function isLocked(o: GameObject): boolean {
  const st = states.get(o);
  if (st?.locked !== undefined) return st.locked;
  if (isDoor(o)) return isDoorLocked(o);
  if (isContainerObj(o)) return (o.extra.flags & FLAG_LOCKED) !== 0;
  return false;
}

function isRobotObj(o: GameObject): boolean {
  return o.proto?.kind === 'critter' && (o.proto as CritterProto).bodyType === BODY_ROBOT;
}

/** Skille mozliwe do uzycia na celu (kolejnosc jak w menu akcji). */
export function skillsUsableOn(target: GameObject, user: GameObject): Skill[] {
  if (target.hidden) return [];
  if (target.type === TYPE_CRITTER) {
    const self = target === user;
    const out: Skill[] = [Skill.FirstAid, Skill.Doctor];
    if (!self) out.push(Skill.Steal);
    if (isRobotObj(target)) out.push(Skill.Repair);
    if (!self) out.push(Skill.Science);
    return out;
  }
  if (isDoor(target) || isContainerObj(target)) {
    const out: Skill[] = [];
    if (isLocked(target)) out.push(Skill.Lockpick);
    out.push(Skill.Traps, Skill.Science);
    return out;
  }
  if (target.type === TYPE_ITEM || target.type === TYPE_SCENERY)
    return [Skill.Science, Skill.Repair];
  return [];
}

/** Port skryptow: uruchamia `use_skill_on_p_proc` celu; true = skrypt zawolal script_overrides. */
export interface SkillScriptPort {
  runUseSkillProc(source: number, target: number, skill: number): boolean;
}

/** Minimalny ksztalt `ScriptRuntime` potrzebny do hooka (bez zmian w script-runtime.ts). */
export interface ScriptRuntimeLike {
  scheduler: {
    all(): Array<{ sid: number; instance: object }>;
    runProc(
      sid: number,
      proc: 'use_skill_on_p_proc',
      ctx: { source: number; target: number; actionBeingUsed: number },
    ): unknown;
  };
  overridden: WeakSet<object>;
}

export function skillScriptPort(
  rt: ScriptRuntimeLike,
  objects: (id: number) => GameObject | undefined,
): SkillScriptPort {
  return {
    runUseSkillProc(source, target, skill) {
      const t = objects(target);
      const e =
        t && t.scriptId >= 0 ? rt.scheduler.all().find((x) => x.sid === t.scriptId) : undefined;
      if (!e) return false;
      rt.overridden.delete(e.instance);
      rt.scheduler.runProc(e.sid, 'use_skill_on_p_proc', {
        source,
        target,
        actionBeingUsed: skill,
      });
      return rt.overridden.has(e.instance);
    },
  };
}

export interface SkillActionDeps {
  player: GameObject;
  /** Rekord krytera gracza z arkusza (skille, tagi, perki, HP). */
  critter: SkillCritter;
  ctx(): SkillUseContext;
  clock: GameClock;
  scripts?: SkillScriptPort;
  onCaught?(target: GameObject): void;
  onTrap?(target: GameObject): void;
  /** Przeniesienie przedmiotu przy kradziezy; domyslnie proste przepisanie tablic inventory. */
  moveItem?(item: GameObject, from: GameObject, to: GameObject): void;
  sneaking?(): boolean;
  /** Czy obiekt jest w druzynie gracza (0x494fc4): kradziez druzynie jest bezpieczna. */
  inPlayerParty?(target: GameObject): boolean;
  skillUseTimes?(): Record<number, number[]>;
  /** Zapis znacznikow uzyc (pierwsza pomoc/doktor/naprawa: limit 3 na 25 h) po uzyciu skilla. */
  saveSkillUseTimes?(times: Record<number, number[]>): void;
}

export interface SkillActionOptions {
  /** Narzedzie (wytrych/zestaw) albo kradziony przedmiot (z inventory celu). */
  tool?: GameObject | null;
  /** Pomija test dystansu (UI juz podeszlo do celu). */
  ignoreRange?: boolean;
}

export type SkillActionFailReason = 'out-of-range' | 'not-usable';

export interface SkillActionResult extends SkillUseResult {
  skill: Skill;
  targetId: number;
  failReason?: SkillActionFailReason;
}

function bad(
  skill: Skill,
  target: GameObject,
  failReason: SkillActionFailReason,
): SkillActionResult {
  return {
    skill,
    targetId: target.id,
    ok: false,
    reason: failReason,
    failReason,
    roll: null,
    messageId: null,
    xp: 0,
    minutesSpent: 0,
    effects: [],
  };
}

/** Widok krytera-celu dla @f2/rules (staty z proto, HP z modelu krytera). */
function targetCritter(o: GameObject, deps: SkillActionDeps): SkillCritter | undefined {
  if (o.type !== TYPE_CRITTER) return undefined;
  if (o === deps.player) return deps.critter;
  const p = o.proto?.kind === 'critter' ? (o.proto as CritterProto) : undefined;
  const c = newCritterData(false);
  if (p) {
    p.baseStats.forEach((v, i) => void (c.baseStats[i] = v));
    p.bonusStats.forEach((v, i) => void (c.bonusStats[i] = v));
  }
  const max = (c.baseStats[STAT_MAX_HP] ?? 0) + (c.bonusStats[STAT_MAX_HP] ?? 0);
  c.curHP = critterHp(o, max || 1);
  const sk = newSkillState();
  p?.skills.forEach((v, i) => void (sk.skillRaw[i] = v));
  return Object.assign(c, sk);
}

function userView(deps: SkillActionDeps): SkillObject {
  return {
    id: deps.player.id,
    pid: deps.player.pid,
    critter: deps.critter,
    sneaking: deps.sneaking?.() ?? false,
    skillUseTimes: deps.skillUseTimes?.() ?? {},
  } as unknown as SkillObject;
}

function defaultMove(item: GameObject, from: GameObject, to: GameObject): void {
  const i = from.inventory.indexOf(item);
  if (i >= 0) from.inventory.splice(i, 1);
  to.inventory.push(item);
}

function applyEffects(
  deps: SkillActionDeps,
  target: GameObject,
  effects: SkillEffect[],
  tool: GameObject | null,
): void {
  const st = skillState(target);
  for (const e of effects) {
    switch (e.kind) {
      case 'unlock': {
        st.locked = false;
        if (target.extra.kind === 'door' && target.extra.raw.length > 0)
          target.extra.raw[0] = (target.extra.raw[0] ?? 0) & ~DOOR_LOCKED_BIT;
        break;
      }
      case 'steal': {
        const item = tool ?? target.inventory.find((i) => i.id === e.itemId);
        if (item) (deps.moveItem ?? defaultMove)(item, target, deps.player);
        break;
      }
      case 'caught':
        deps.onCaught?.(target);
        break;
      case 'triggerTrap':
        deps.onTrap?.(target);
        break;
      default:
        break;
    }
  }
}

function targetView(
  deps: SkillActionDeps,
  target: GameObject,
): { tc: SkillCritter | undefined; view: SkillObject } {
  const st = skillState(target);
  const tc = targetCritter(target, deps);
  const view = {
    id: target.id,
    pid: target.pid,
    ...(tc ? { critter: tc } : {}),
    locked: isLocked(target),
    jammed: st.jammed ?? false,
    trapDifficulty: st.trapDifficulty ?? 0,
    trapArmed: st.trapArmed ?? false,
    bodyType: isRobotObj(target) ? BODY_ROBOT : 0,
    robotCrippled: st.robotCrippled ?? 0,
    skillUsed: st.skillUsed ?? {},
    // dane celu kradziezy (D 0x4abbe4): powalony (flagi obrazen & 3), widzi zlodzieja (rotacja), druzyna
    downed:
      st.downed ?? (target.extra.kind === 'critter' && ((target.extra.raw[3] ?? 0) & 3) !== 0),
    seesThief: st.seesThief ?? targetSeesThiefByRotation(deps.player.rotation, target.rotation),
    inPlayerParty: st.inPlayerParty ?? deps.inPlayerParty?.(target) ?? false,
  } as unknown as SkillObject;
  return { tc, view };
}

/**
 * Szansa (0..95) uzycia skilla na celu, do pokazania w menu przy `showSkillCheckPercent`.
 * Pierwsza pomoc/doktor/skradanie: sam poziom skilla; reszta wg wzorow @f2/rules.
 */
export function skillChanceOn(
  deps: SkillActionDeps,
  skill: Skill,
  target: GameObject,
  tool: GameObject | null = null,
): number {
  const { view } = targetView(deps, target);
  const u = userView(deps);
  const ctx = deps.ctx();
  const toolView = tool ? ({ id: tool.id, pid: tool.pid } as never) : null;
  switch (skill) {
    case Skill.Lockpick:
      return lockpickChance(u, view, toolView, ctx);
    case Skill.Steal:
      return stealChance(u, view, toolView, ctx);
    case Skill.Traps:
      return trapsDisarmChance(u, view, ctx);
    case Skill.Science:
      return scienceChance(u, view, ctx);
    case Skill.Repair:
      return repairChance(u, view, ctx);
    default:
      return Math.max(0, Math.min(95, skillLevel(deps.critter, skill, ctx)));
  }
}

/**
 * Uzywa skilla gracza na obiekcie: skrypt celu (`use_skill_on_p_proc`, action_being_used = skill) moze
 * przejac obsluge, inaczej reguly z @f2/rules; efekty ida do swiata, a czas gry plynie o `minutesSpent`.
 */
export function useSkillOnObject(
  deps: SkillActionDeps,
  skill: Skill,
  target: GameObject,
  opts: SkillActionOptions = {},
): SkillActionResult {
  if (!skillsUsableOn(target, deps.player).includes(skill)) return bad(skill, target, 'not-usable');
  if (
    !opts.ignoreRange &&
    target !== deps.player &&
    hexDistance(deps.player.hex, target.hex) > SKILL_USE_RANGE
  )
    return bad(skill, target, 'out-of-range');

  if (deps.scripts?.runUseSkillProc(deps.player.id, target.id, skill)) {
    return {
      skill,
      targetId: target.id,
      ok: true,
      overridden: true,
      roll: null,
      messageId: null,
      xp: 0,
      minutesSpent: 0,
      effects: [],
    };
  }

  const st = skillState(target);
  const { tc, view } = targetView(deps, target);

  const hpBefore = tc?.curHP ?? 0;
  const user = userView(deps);
  const r = useSkillOn(user, skill, view, deps.ctx(), {
    tool: opts.tool ? ({ id: opts.tool.id, pid: opts.tool.pid } as never) : null,
  });
  // stan celu wraca na obiekt swiata
  st.locked = view.locked ?? false;
  st.jammed = view.jammed ?? false;
  st.trapArmed = view.trapArmed ?? false;
  st.robotCrippled = view.robotCrippled ?? 0;
  st.skillUsed = view.skillUsed ?? {};
  if (tc && target !== deps.player && tc.curHP > hpBefore) {
    const max = (tc.baseStats[STAT_MAX_HP] ?? 0) + (tc.bonusStats[STAT_MAX_HP] ?? 0);
    critterHeal(target, tc.curHP - hpBefore, max || tc.curHP);
  }
  deps.saveSkillUseTimes?.(user.skillUseTimes ?? {});
  applyEffects(deps, target, r.effects, opts.tool ?? null);
  if (r.minutesSpent > 0) deps.clock.advance(r.minutesSpent * TICKS_PER_MINUTE);
  return { ...r, skill, targetId: target.id };
}
