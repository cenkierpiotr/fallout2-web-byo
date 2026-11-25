/**
 * Model statow, perkow, traitow i skilli krytera dla skryptow (get/set_critter_stat, critter_add/rm_trait,
 * critter_mod_skill, has_trait, has_skill). Formuly liczy @f2/rules (statLevel 0x4aef48); tu tylko rekordy per obiekt.
 * Rekord NPC powstaje leniwie z prototypu (baseStats/bonusStats/skills), rekord gracza moze dostarczyc host
 * (karta postaci), inaczej domyslny (SPECIAL 5, wiek 25).
 */
import {
  Perk,
  Stat,
  defaultRulesContext,
  newCritterData,
  newSkillState,
  perkAddScripted,
  perkLevel,
  perkRemove,
  perkRemoveAllScripted,
  recalcDerived,
  setStatBase,
  skillLevel,
  skillModScripted,
  statLevel,
  type RulesContext,
  type SkillCritter,
  type SkillsContext,
} from '@f2/rules';
import type { GameObject } from './game-object.js';

/** Rekord krytera + pola obiektu nieobecne w CritterData (AI packet obj+0x4c, team obj+0x50). */
export type CritterRecord = SkillCritter & {
  aiPacket?: number | undefined;
  team?: number | undefined;
};

export interface CritterStatsOptions {
  isPlayer: (o: GameObject) => boolean;
  /** Rekord gracza z hosta (karta postaci); brak = domyslny. */
  playerRecord?: (() => CritterRecord | undefined) | undefined;
  /** Kontekst regul (zegar, fixy, rng); wolany przy kazdym zapytaniu. */
  context: () => SkillsContext;
}

export class CritterStatsModel {
  private readonly records = new Map<number, CritterRecord>();
  private defaultPlayer: CritterRecord | undefined;

  constructor(private readonly opts: CritterStatsOptions) {}

  /** Rekord krytera (type 1); undefined dla pozostalych typow. */
  record(o: GameObject | undefined): CritterRecord | undefined {
    if (!o || o.type !== 1) return undefined;
    if (this.opts.isPlayer(o))
      return this.opts.playerRecord?.() ?? (this.defaultPlayer ??= this.fresh(o, true));
    let r = this.records.get(o.id);
    if (!r) this.records.set(o.id, (r = this.fresh(o, false)));
    return r;
  }

  private fresh(o: GameObject, player: boolean): CritterRecord {
    const r: CritterRecord = { ...newCritterData(player), ...newSkillState() };
    const p = o.proto as
      | {
          baseStats?: number[];
          bonusStats?: number[];
          skills?: number[];
          aiPacket?: number;
          team?: number;
        }
      | undefined;
    if (!player && p?.baseStats) {
      for (let i = 0; i < 35; i++) r.baseStats[i] = p.baseStats[i];
      for (let i = 0; i < 35; i++) r.bonusStats[i] = p.bonusStats?.[i] ?? 0;
      if (p.skills) for (let i = 0; i < 18; i++) r.skillRaw[i] = p.skills[i] ?? 0;
      r.aiPacket = p.aiPacket;
      r.team = p.team;
    } else {
      recalcDerived(r, this.opts.context());
    }
    r.curHP = statLevel(r, Stat.MaxHitPoints, this.opts.context());
    return r;
  }

  /** get_critter_stat 0x455c10: wprost f2_stat_level; brak krytera = -1. */
  getStat(o: GameObject | undefined, stat: number): number {
    const r = this.record(o);
    return r ? statLevel(r, stat as Stat, this.rulesCtx()) : -1;
  }

  /** set_critter_stat 0x455ccc -> f2_stat_set_base 0x4af4bc; zwraca kod bledu (0 = ok, -1 inaczej). */
  setStat(o: GameObject | undefined, stat: number, v: number): number {
    const r = this.record(o);
    if (!r) return -1;
    return setStatBase(r, stat as Stat, v, this.rulesCtx()).ok ? 0 : -1;
  }

  addPerk(o: GameObject | undefined, perk: number): boolean {
    const r = this.record(o);
    return !!r && perkAddScripted(r, perk as Perk).ok;
  }
  /** ranks = ile rang zdjac (domyslnie wszystkie, jak critter_rm_trait). */
  removePerk(o: GameObject | undefined, perk: number, ranks = Number.POSITIVE_INFINITY): void {
    const r = this.record(o);
    if (!r) return;
    if (ranks === Number.POSITIVE_INFINITY) perkRemoveAllScripted(r, perk as Perk);
    else for (let i = 0; i < ranks; i++) if (!perkRemove(r, perk as Perk).ok) break;
  }
  perkRank(o: GameObject | undefined, perk: number): number {
    const r = this.record(o);
    return r ? perkLevel(r, perk as Perk) : 0;
  }

  /** has_trait kind 2 (0x4b3bc8): 1 gdy trait w jednym z dwoch slotow gracza; idx poza 0..15 = 0. */
  playerTrait(o: GameObject | undefined, trait: number): number {
    const r = this.record(o);
    if (!r || !r.isPlayer || trait < 0 || trait >= 16) return 0;
    return r.traits.includes(trait) ? 1 : 0;
  }

  modSkill(o: GameObject | undefined, skill: number, amount: number): void {
    const r = this.record(o);
    if (r) skillModScripted(r, skill, amount, this.rulesCtx());
  }

  skill(o: GameObject | undefined, skill: number): number {
    const r = this.record(o);
    return r ? skillLevel(r, skill, this.rulesCtx()) : -5;
  }

  private rulesCtx(): SkillsContext {
    return this.opts.context();
  }
}

export { defaultRulesContext };
export type { RulesContext };
