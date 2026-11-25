/**
 * Lokalny kontrakt widoku kreatora postaci (podzbior GameView.creator / GameCommands.creator
 * ze specyfikacji 4.3). Adapter do prawdziwego GameView powstanie w Zadaniu 14; UI zna tylko te typy.
 * Teksty nazw i opisow (STAT.MSG, SKILL.MSG, TRAIT.MSG) przychodza gotowe z widoku.
 */

export const STAT_MAX = 10;
export const STAT_MIN = 1;
export const TAGS_REQUIRED = 3;
export const TRAITS_MAX = 2;

export type CreatorReason = 'statPoints' | 'tags' | 'name';

export interface StatItem {
  id: number;
  name: string;
  description: string;
  value: number;
  min: number;
  max: number;
}

export interface SkillItem {
  id: number;
  name: string;
  description: string;
  value: number;
  tagged: boolean;
}

export interface TraitItem {
  id: number;
  name: string;
  description: string;
  selected: boolean;
}

export interface PresetItem {
  id: string;
  name: string;
  bio: string;
  /** Skrot SPECIAL w kolejnosci ST PE EN CH IN AG LK. */
  special: number[];
}

export interface DerivedItem {
  id: 'hp' | 'ap' | 'ac' | 'carry';
  value: number;
}

export interface CreatorView {
  name: string;
  age: number;
  ageMin: number;
  ageMax: number;
  gender: 'male' | 'female';
  presetId: string | null;
  presets: PresetItem[];
  stats: StatItem[];
  /** Punkty SPECIAL do rozdania. */
  pointsLeft: number;
  skills: SkillItem[];
  tagsUsed: number;
  traits: TraitItem[];
  traitsUsed: number;
  derived: DerivedItem[];
  /** Zywa walidacja: powody, dla ktorych nie mozna zakonczyc. */
  reasons: CreatorReason[];
  canFinish: boolean;
}

export type CreatorResult = { ok: true } | { ok: false; reason: string };

export interface CreatorCommands {
  setName(name: string): CreatorResult;
  setAge(age: number): CreatorResult;
  setGender(gender: 'male' | 'female'): CreatorResult;
  applyPreset(id: string): CreatorResult;
  adjustStat(id: number, delta: 1 | -1): CreatorResult;
  toggleTag(skillId: number): CreatorResult;
  toggleTrait(traitId: number): CreatorResult;
  finish(): CreatorResult;
}
