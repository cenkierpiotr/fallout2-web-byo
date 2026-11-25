/**
 * Adapter postaci gracza (@f2/rules) do widoku i komend panelu postaci z @f2/ui
 * (`PlayerView`, `CharacterCommands`). Plan M4 Z14: `GameView.player` + `character.*`.
 * Reguly zyja w rekordzie krytera gracza; adapter nie trzyma wlasnej kopii stanu.
 */
import {
  PERK_DEFS,
  Perk,
  SKILL_COUNT,
  SKILL_DEFS,
  Stat,
  TRAIT_DEFS,
  addExperience,
  hereAndNowGrant,
  expForLevel,
  perkAdd,
  perkCanAdd,
  skillDec,
  skillInc,
  skillIsTagged,
  skillTag,
  skillLevel,
  skillPointCost,
  statBase,
  statBonus,
  statLevel,
  type GameObject,
  type PerkContext,
  type ProgressCritter,
  type SkillCritter,
  type SkillsContext,
  type Skill,
} from '../../rules/src/index.js';
import skillsData from '../../rules/data/skills.json' with { type: 'json' };
import type {
  CharacterCommands,
  CharacterResult,
  CostTier,
  PerkOptionView,
  PerkView,
  PlayerView,
  StatSourceView,
  StatView,
  TraitView,
} from '../../ui/src/screens/character/types.js';
import { createStore, type Store } from './store.js';

export type PlayerCritter = SkillCritter & ProgressCritter;

/** Teksty z danych gry (PERK.MSG, TRAIT.MSG): wstrzykiwane, adapter nie czyta plikow. */
export interface CharacterTexts {
  perk(id: number): { name: string; description: string };
  trait(id: number): { name: string; description: string };
  /** Nazwa przedmiotu dla zrodel bonusu (opcjonalnie). */
  item?(pid: number): string | undefined;
}

export interface CharacterBindingDeps {
  /** Obiekt gracza; `critter` musi miec stan skilli i postepu (PlayerCritter). */
  player: GameObject;
  name: string;
  texts: CharacterTexts;
  rulesContext: () => SkillsContext;
  karma: () => number;
  karmaTitle: (karma: number) => string;
  kills?: () => number;
  /** Uzycie skilla na sobie (Pierwsza pomoc, Doktor, Skradanie); zwraca opis wyniku. */
  useSkill?: (skill: number) => { ok: boolean; reason?: string; message?: string };
  /** Skille dostepne w `useSkill` (widok pokazuje przy nich przycisk Uzyj). */
  usableSkills?: number[];
  /** Wywolywane po kazdej zmianie stanu postaci (np. przeliczenie obciazenia, autozapis). */
  onChange?: () => void;
}

export interface CharacterBinding {
  view: Store<PlayerView>;
  commands: CharacterCommands;
  /** Przyznaje XP (Swift Learner, awanse); ustawia levelUpPending przy awansie. */
  gainExperience(amount: number): { levelsGained: number; perkAvailable: boolean };
  /** Przelicza widok (po zmianie ekwipunku, chemii, itp.). */
  refresh(): void;
}

const STAT_COUNT = 38;
/** Atut Tag! (data/skills.json tag.perk). */
const PERK_TAG = 51;
const fail = (reason: string): CharacterResult => ({ ok: false, reason });
const ok: CharacterResult = { ok: true };

const COST_TIERS: CostTier[] = skillsData.costTable.map((t) => ({ upTo: t.upTo, cost: t.cost }));

function requireCritter(o: GameObject): PlayerCritter {
  if (!o.critter) throw new Error('character-binding: gracz bez critter');
  return o.critter as PlayerCritter;
}

export function createCharacterBinding(deps: CharacterBindingDeps): CharacterBinding {
  const critter = requireCritter(deps.player);
  let levelUpPending = false;
  let tagPending = false;

  const ctx = (): SkillsContext & PerkContext => {
    const base = deps.rulesContext();
    const full: SkillsContext & PerkContext = {
      ...base,
      level: critter.level,
      skillLevel: (c, s) => skillLevel(c as SkillCritter, s as Skill, base),
    };
    return full;
  };

  function statSources(s: number): StatSourceView[] {
    const out: StatSourceView[] = [];
    let accounted = 0;
    for (const t of critter.traits) {
      for (const e of TRAIT_DEFS[t]?.effects ?? []) {
        if (e.kind === 'stat' && e.target === s && e.delta) {
          out.push({ kind: 'trait', name: deps.texts.trait(t).name, amount: e.delta });
        }
      }
    }
    for (const slot of [0, 1, 2] as const) {
      const item = deps.player.equipped[slot];
      const meta = deps.player.equipMeta[slot];
      if (!item || !meta) continue;
      for (const d of meta.deltas) {
        if (d.stat !== s || d.amount === 0) continue;
        const nm = deps.texts.item?.(item.pid);
        out.push({ kind: 'item', ...(nm ? { name: nm } : {}), amount: d.amount });
        accounted += d.amount;
      }
    }
    for (const [idStr, rank] of Object.entries(critter.perkRanks)) {
      if (!rank) continue;
      for (const e of PERK_DEFS[Number(idStr)]?.effects ?? []) {
        if (e.kind === 'stat' && e.target === s && e.delta) {
          out.push({
            kind: 'perk',
            name: deps.texts.perk(Number(idStr)).name,
            amount: e.delta,
          });
          accounted += e.delta;
        }
      }
    }
    const bonus = statBonus(critter, s as Stat);
    if (bonus !== accounted && bonus - accounted !== 0) {
      out.push({ kind: 'other', amount: bonus - accounted });
    }
    return out;
  }

  function buildView(): PlayerView {
    const c = ctx();
    const stats: StatView[] = [];
    for (let s = 0; s < STAT_COUNT; s++) {
      const level = statLevel(critter, s as Stat, c);
      const base = statBase(critter, s as Stat) ?? level;
      stats.push({ base, bonus: statBonus(critter, s as Stat), level, sources: statSources(s) });
    }
    const skills = [];
    for (let i = 0; i < SKILL_COUNT; i++) {
      const tagged = skillIsTagged(critter, i);
      const cost = skillPointCost(critter, i as Skill, c);
      skills.push({
        level: skillLevel(critter, i as Skill, c),
        tagged,
        cost: Number.isFinite(cost) ? cost : 0,
        gain: (SKILL_DEFS[i]?.pointMult ?? 1) * (tagged ? 2 : 1),
      });
    }
    const traits: TraitView[] = critter.traits
      .filter((t) => t >= 0)
      .map((t) => ({ id: t, ...deps.texts.trait(t) }));
    const perks: PerkView[] = [];
    const options: PerkOptionView[] = [];
    for (const def of PERK_DEFS) {
      const rank = critter.perkRanks[def.index] ?? 0;
      if (rank > 0) {
        perks.push({ id: def.index, ...deps.texts.perk(def.index), rank, maxRank: def.maxRank });
      }
      if (def.maxRank > 0 && def.minLevel < 300) {
        const r = perkCanAdd(critter, def.index as Perk, c);
        options.push({
          id: def.index,
          ...deps.texts.perk(def.index),
          rank,
          maxRank: def.maxRank,
          available: r.ok,
          unmet: r.unmet,
        });
      }
    }
    const next = expForLevel(critter.level + 1);
    const karma = deps.karma();
    const hpMax = statLevel(critter, Stat.MaxHitPoints, c);
    const apMax = statLevel(critter, Stat.MaxActionPoints, c);
    return {
      name: deps.name,
      level: critter.level,
      exp: critter.xp,
      expNext: next < 0 ? critter.xp : next,
      hp: critter.curHP,
      hpMax,
      ap: apMax,
      apMax,
      stats,
      skills,
      skillCostTiers: COST_TIERS,
      skillMax: skillsData.max,
      traits,
      perks,
      availablePerks: options,
      karma,
      karmaTitle: deps.karmaTitle(karma),
      skillPoints: critter.skillPoints,
      unspentPerks: critter.perkPending ? 1 : 0,
      kills: deps.kills?.() ?? 0,
      levelUpPending,
      tagPending,
      usableSkills: deps.usableSkills ?? [],
    };
  }

  const store = createStore<PlayerView>(buildView());
  const refresh = (): void => {
    store.value = buildView();
    deps.onChange?.();
  };

  const commands: CharacterCommands = {
    spendSkill(skill, delta) {
      const r = delta === 1 ? skillInc(critter, skill, ctx()) : skillDec(critter, skill, ctx());
      refresh();
      return r.ok ? ok : fail(r.reason);
    },
    choosePerk(perk) {
      if (!critter.perkPending) return fail('no-perk-pending');
      const r = perkAdd(critter, perk as Perk, ctx());
      if (!r.ok) return fail(r.reason);
      critter.perkPending = false;
      if (perk === PERK_TAG) tagPending = true;
      if (perk === Perk.HereAndNow) {
        const lv = addExperience(critter, hereAndNowGrant(critter), ctx());
        if (lv.levelsGained > 0) levelUpPending = true;
      }
      refresh();
      return ok;
    },
    tagSkill(skill) {
      if (!tagPending) return fail('no-tag-pending');
      const r = skillTag(critter, skill as Skill);
      if (!r.ok) return fail(r.reason);
      tagPending = false;
      refresh();
      return ok;
    },
    useSkill(skill) {
      if (!deps.useSkill) return fail('skill-use-unavailable');
      const r = deps.useSkill(skill);
      refresh();
      return r.ok
        ? { ok: true, ...(r.message ? { message: r.message } : {}) }
        : { ok: false, reason: r.reason ?? 'failed', ...(r.message ? { message: r.message } : {}) };
    },
    confirmLevelUp() {
      if (critter.perkPending) return fail('perk-pending');
      if (tagPending) return fail('tag-pending');
      levelUpPending = false;
      refresh();
      return ok;
    },
  };

  return {
    view: store,
    commands,
    gainExperience(amount) {
      const r = addExperience(critter, amount, ctx());
      if (r.levelsGained > 0) levelUpPending = true;
      refresh();
      return r;
    },
    refresh,
  };
}
