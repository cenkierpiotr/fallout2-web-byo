import type { SkillCritter } from '@f2/rules';
import { Skill, createRng } from '@f2/rules';
import {
  skillChanceOn,
  skillScriptPort,
  skillsUsableOn,
  useSkillOnObject,
  type GameObject,
  type SkillActionDeps,
  type SkillActionResult,
} from '@f2/engine-core';
import type { GameSession } from './game-session';
import { effectiveFixes, settings } from '../settings';

/** Komunikat do pokazania graczowi: klucz i18n + parametry. */
export interface SkillOutcomeMessage {
  key: string;
  params?: Record<string, string | number>;
}

export interface SkillUseOutcome {
  ok: boolean;
  message: SkillOutcomeMessage;
  result: SkillActionResult;
}

export interface SkillUseHost {
  /** Skille mozliwe do uzycia na obiekcie (menu z kursora). */
  usable(target: GameObject): number[];
  /** Szansa 0..95 do pokazania w menu. */
  chance(skill: number, target: GameObject, tool?: GameObject | null): number;
  /** Uzycie skilla; wynik zawiera komunikat i18n. Kradziez: `tool` = wybrany przedmiot celu. */
  use(skill: number, target: GameObject, tool?: GameObject | null): SkillUseOutcome;
}

const ERR_KEYS: Record<string, string> = {
  'out-of-range': 'skill.err.tooFar',
  'not-usable': 'skill.err.notUsable',
  'skill-exhausted': 'skill.err.exhausted',
  'no-need': 'skill.err.noNeed',
  jammed: 'skill.err.jammed',
};

/** Komunikat wyniku uzycia skilla (czysta funkcja, testowana osobno). */
export function skillOutcomeMessage(r: SkillActionResult): SkillOutcomeMessage {
  if (r.overridden) return { key: 'skill.result.overridden' };
  if (!r.ok) {
    const caught = r.effects.find((e) => e.kind === 'caught');
    if (caught) return { key: 'skill.result.caught' };
    if (r.effects.some((e) => e.kind === 'jam')) return { key: 'skill.result.jam' };
    if (r.effects.some((e) => e.kind === 'triggerTrap')) return { key: 'skill.result.trap' };
    const err = r.reason ? ERR_KEYS[r.reason] : undefined;
    return { key: err ?? 'skill.result.fail' };
  }
  for (const e of r.effects) {
    switch (e.kind) {
      case 'heal':
        return { key: 'skill.result.heal', params: { amount: e.amount } };
      case 'unlock':
        return { key: 'skill.result.unlock' };
      case 'steal':
        return { key: 'skill.result.steal' };
      case 'disarm':
        return { key: 'skill.result.disarm' };
      case 'science':
        return { key: 'skill.result.science' };
      case 'uncripple':
        return { key: 'skill.result.repair' };
      default:
        break;
    }
  }
  return { key: 'skill.result.repair' };
}

/**
 * Uzycie skilli gracza na obiektach mapy z menu kursora. Arkusz postaci to zrodlo prawdy
 * (skille, XP, znaczniki limitu 3 uzyc na 25 h); gotowe efekty trafiaja do swiata przez engine-core.
 */
export function createSkillUseHost(session: GameSession, critter: SkillCritter): SkillUseHost {
  const rng = createRng((session.state.rng.seed ^ 0x51d1) >>> 0);
  const sheet = (): typeof session.state.sheet => session.state.sheet;
  const world = session.world;
  const deps = (): SkillActionDeps => {
    const rt = world.scripts;
    const d: SkillActionDeps = {
      player: world.player,
      critter,
      clock: world.clock,
      ctx: () => ({
        fixes: effectiveFixes(settings.value),
        rng,
        clock: world.clock,
        difficulty: session.state.settings.gameDifficulty,
      }),
      sneaking: () => sheet().sneaking,
      inPlayerParty: (t) => world.scripts?.inventory.partyObjects().includes(t) ?? false,
      skillUseTimes: () => {
        const times: Record<number, number[]> = {};
        for (const s of sheet().skillUseSlots) (times[s.skill] ??= []).push(s.atTick);
        return times;
      },
      saveSkillUseTimes: (times) => {
        const out: { skill: number; atTick: number }[] = [];
        for (const [k, v] of Object.entries(times))
          for (const atTick of v) out.push({ skill: Number(k), atTick });
        sheet().skillUseSlots = out;
      },
    };
    if (rt) {
      d.scripts = skillScriptPort(rt as never, (id) => world.map.objects.find((o) => o.id === id));
    }
    return d;
  };
  return {
    usable: (target) => skillsUsableOn(target, world.player),
    chance: (skill, target, tool = null) => skillChanceOn(deps(), skill as Skill, target, tool),
    use(skill, target, picked = null) {
      // kradziez: przedmiot wybiera gracz na ekranie kradziezy; bez wyboru pierwszy przedmiot celu
      const tool = skill === Skill.Steal ? (picked ?? target.inventory[0] ?? null) : null;
      if (skill === Skill.Steal && !tool) {
        const result: SkillActionResult = {
          skill: Skill.Steal,
          targetId: target.id,
          ok: false,
          reason: 'no-item',
          roll: null,
          messageId: null,
          xp: 0,
          minutesSpent: 0,
          effects: [],
        };
        return { ok: false, message: { key: 'skill.err.noItem' }, result };
      }
      const result = useSkillOnObject(deps(), skill as Skill, target, { tool });
      return {
        ok: result.ok,
        message: skillOutcomeMessage(result),
        result,
      };
    },
  };
}
