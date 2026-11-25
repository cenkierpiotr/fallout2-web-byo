/**
 * Lokalne typy widoku postaci. Odpowiadaja `GameView.player` / `GameCommands.character`
 * z Zadania 14 (adapter w apps/web przyjdzie w Z14); UI nie zalezy od engine-core.
 */

export type CharacterResult = { ok: true } | { ok: false; reason: string };

/** Zrodlo bonusu statu (cecha, atut, przedmiot, efekt czasowy). */
export interface StatSourceView {
  kind: 'trait' | 'perk' | 'item' | 'effect' | 'other';
  /** Nazwa z danych gry (np. nazwa przedmiotu); gdy brak, UI pokazuje etykiete rodzaju. */
  name?: string;
  amount: number;
}

export interface StatView {
  base: number;
  bonus: number;
  /** Wartosc koncowa (base + bonus po regulach). */
  level: number;
  sources: StatSourceView[];
}

export interface SkillView {
  /** Aktualny poziom w procentach. */
  level: number;
  tagged: boolean;
  /** Koszt najblizszego +1 w punktach skilli. */
  cost: number;
  /** O ile rosnie poziom po jednym punkcie (pointMult, x2 dla oznaczonych). */
  gain: number;
}

export interface CostTier {
  upTo: number;
  cost: number;
}

export interface PerkView {
  id: number;
  name: string;
  description: string;
  rank: number;
  maxRank: number;
}

export interface PerkOptionView {
  id: number;
  name: string;
  description: string;
  rank: number;
  maxRank: number;
  available: boolean;
  /** Kody niespelnionych wymagan z regul, np. `ST<5`, `level<6`, `skill:Doctor<75`, `perk:key`, `max-rank`. */
  unmet: string[];
}

export interface TraitView {
  id: number;
  name: string;
  description: string;
}

export interface PlayerView {
  name: string;
  level: number;
  exp: number;
  expNext: number;
  hp: number;
  hpMax: number;
  ap: number;
  apMax: number;
  /** 38 statow wg indeksu `Stat` (0..6 = SPECIAL). */
  stats: StatView[];
  /** 18 skilli wg indeksu `Skill`. */
  skills: SkillView[];
  /** Tabela kosztow skilli wg poziomu (z danych regul); powyzej ostatniego progu skill jest maksymalny. */
  skillCostTiers: CostTier[];
  skillMax: number;
  traits: TraitView[];
  perks: PerkView[];
  availablePerks: PerkOptionView[];
  karma: number;
  karmaTitle: string;
  skillPoints: number;
  unspentPerks: number;
  /** Licznik zabojstw (placeholder do M6). */
  kills: number;
  /** Czeka na zatwierdzenie awansu (nowy poziom nieobejrzany). */
  levelUpPending: boolean;
  /** Atut Tag! wybrany: trzeba wskazac czwarta glowna umiejetnosc. */
  tagPending?: boolean;
  /** Skille uzywane bezposrednio z panelu (Pierwsza pomoc, Doktor, Skradanie). */
  usableSkills?: number[];
}

export interface CharacterCommands {
  spendSkill(skill: number, delta: 1 | -1): CharacterResult;
  choosePerk(perk: number): CharacterResult;
  confirmLevelUp(): CharacterResult;
  /** Czwarty tag po wybraniu atutu Tag!. */
  tagSkill?(skill: number): CharacterResult;
  /** Uzycie skilla na sobie; `message` to krotki opis wyniku. */
  useSkill?(skill: number): CharacterResult & { message?: string };
}
