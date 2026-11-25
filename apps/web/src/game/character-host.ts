import { effectiveFixes, settings } from '../settings';
import {
  createCharacterBinding,
  type CharacterBinding,
  type CharacterTexts,
} from '@f2/app/src/character-binding';
import {
  Skill,
  createRng,
  doctorHeal,
  firstAidHeal,
  type GameObject,
  type SkillObject,
  type SkillUseContext,
} from '@f2/rules';
import type { GameSession } from './game-session';
import { createSheetCritter } from './sheet-critter';
import { handleSneakEvent, startSneak, stopSneak, type SneakEnv } from './sneak-event';

/** Skille uzywane z panelu postaci na samym sobie. */
export const USABLE_SKILLS: number[] = [Skill.FirstAid, Skill.Doctor, Skill.Sneak];
const TICKS_PER_MINUTE = 600;

export interface CharacterHostDeps {
  name(): string;
  texts: CharacterTexts;
  locale(): 'pl' | 'en';
  /** Wywolywane po zmianie arkusza (np. odswiezenie Pip-Boya). */
  onChange?(): void;
}

export interface CharacterHost extends CharacterBinding {
  /** XP za zabicie krytera: arkusz + licznik zabojstw `killType`. */
  awardKill(xp: number, killType: number): void;
}

function karmaTitle(karma: number, lang: 'pl' | 'en'): string {
  if (karma > 100) return lang === 'pl' ? 'Dobry' : 'Good';
  if (karma < -100) return lang === 'pl' ? 'Zły' : 'Evil';
  return lang === 'pl' ? 'Neutralny' : 'Neutral';
}

/** Panel postaci (binding @f2/app) podpiety do arkusza sesji gry. */
export function createCharacterHost(session: GameSession, d: CharacterHostDeps): CharacterHost {
  const sheet = (): typeof session.state.sheet => session.state.sheet;
  const critter = createSheetCritter(sheet);
  const rng = createRng((session.state.rng.seed ^ 0x5eed) >>> 0);
  const ctx = (): SkillUseContext => ({
    fixes: effectiveFixes(settings.value),
    rng,
    clock: session.world.clock,
    difficulty: session.state.settings.gameDifficulty,
  });
  const userObject = (): SkillObject => {
    const times: Record<number, number[]> = {};
    for (const s of sheet().skillUseSlots) (times[s.skill] ??= []).push(s.atTick);
    return {
      critter,
      sneaking: sheet().sneaking,
      skillUseTimes: times,
    } as unknown as SkillObject;
  };
  const saveTimes = (u: SkillObject): void => {
    const out: { skill: number; atTick: number }[] = [];
    for (const [k, v] of Object.entries(u.skillUseTimes ?? {})) {
      for (const atTick of v) out.push({ skill: Number(k), atTick });
    }
    sheet().skillUseSlots = out;
  };
  const sneakEnvNow = (): SneakEnv => ({
    sheet: sheet(),
    queue: session.state.queue,
    ticks: () => session.world.clock.ticks,
    ctx,
    user: userObject,
  });
  session.eventHandlers.push((e) => handleSneakEvent(sneakEnvNow(), e));
  const tr = (pl: string, en: string): string => (d.locale() === 'pl' ? pl : en);

  const binding = createCharacterBinding({
    player: { critter, equipped: [], equipMeta: [] } as unknown as GameObject,
    name: d.name(),
    texts: d.texts,
    rulesContext: ctx,
    karma: () => sheet().progress.karma,
    karmaTitle: (k) => karmaTitle(k, d.locale()),
    kills: () => sheet().kills.reduce((a, b) => a + b, 0),
    usableSkills: USABLE_SKILLS,
    ...(d.onChange ? { onChange: d.onChange } : {}),
    useSkill(skill) {
      const u = userObject();
      const self = { critter } as unknown as SkillObject;
      if (skill === Skill.Sneak) {
        // D 0x42e32c: panel przelacza flage skradania; rzut wykonuje zdarzenie okresowe (sneakRollOk)
        if (sheet().sneaking) {
          stopSneak(sneakEnvNow());
          return { ok: true, message: tr('Przestajesz się skradać.', 'Sneaking stopped.') };
        }
        startSneak(sneakEnvNow());
        return { ok: true, message: tr('Skradasz się.', 'Sneaking.') };
      }
      const r = skill === Skill.Doctor ? doctorHeal(u, self, ctx()) : firstAidHeal(u, self, ctx());
      saveTimes(u);
      if (r.minutesSpent > 0) session.world.clock.ticks += r.minutesSpent * TICKS_PER_MINUTE;
      const healed = r.effects.find((e) => e.kind === 'heal');
      if (r.ok && healed && healed.kind === 'heal') {
        return {
          ok: true,
          message: tr(`Wyleczono ${healed.amount} PZ.`, `Healed ${healed.amount} HP.`),
        };
      }
      return {
        ok: false,
        reason: r.reason ?? 'failed',
        message: tr('Nie udało się.', 'It failed.'),
      };
    },
  });

  return {
    ...binding,
    awardKill(xp, killType) {
      const kills = sheet().kills;
      if (killType >= 0 && killType < kills.length) kills[killType] = (kills[killType] ?? 0) + 1;
      if (xp > 0) binding.gainExperience(xp);
      else binding.refresh();
    },
  };
}
