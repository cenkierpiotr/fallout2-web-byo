import type { GameClock } from '../game-clock.js';
import type { EventQueue, GameEventJSON } from '../event-queue.js';
import type { PartyStateJSON } from '../party/party-state.js';
import type { GlobalVarsJSON } from '../quests/global-vars.js';
import type { SfallStateJSON } from '@f2/vm';

export const SAVE_SCHEMA_VERSION = 7;

/** Sloty: quick, auto-0..2, manual-0..9 (decyzja 0015). */
export const SAVE_SLOTS: readonly string[] = [
  'quick',
  ...Array.from({ length: 3 }, (_, i) => `auto-${i}`),
  ...Array.from({ length: 10 }, (_, i) => `manual-${i}`),
];
export function isValidSlot(slot: string): boolean {
  return SAVE_SLOTS.includes(slot);
}

export type SaveError = { error: 'save-corrupt' | 'save-too-new' };

/** Przedmiot: tylko id protosa i liczby, bez danych PRO/FRM. */
export interface SaveItem {
  pid: number;
  count: number;
  equippedSlot: 'left' | 'right' | 'armor' | null;
  ammo: number | null;
  /** PID zaladowanej amunicji (+0x40 w inventory.md) albo null */
  ammoPid: number | null;
  contents: SaveItem[];
}

export interface SavePlayer {
  objId: number;
  hex: number;
  elevation: number;
  orientation: number;
  flags: number;
  inventory: SaveItem[];
  /**
   * biezace HP, napromieniowanie i zatrucie krytera gracza. W oryginale to osobne pola krytera
   * (kolejnosc curHP, curPoison, curRad), a nie czesc bloku statow; tu trzymane jawnie.
   */
  hp: number;
  radiation: number;
  poison: number;
  /** 35 statow bazowych (slot 6) */
  baseStats: number[];
  statBonuses: number[];
  /** 18 skilli */
  skills: number[];
  taggedSkills: number[];
  skillUseSlots: { skill: number; atTick: number }[];
  perks: Record<string, number>;
  traits: number[];
  /** 19 licznikow zabojstw (slot 7) */
  kills: number[];
  progress: {
    level: number;
    xp: number;
    freeSkillPoints: number;
    reputation: number;
    karma: number;
    /** czeka nierozdany atut z awansu (v4; wczesniej ginal przy wczytaniu) */
    perkPending: boolean;
  };
  sneaking: boolean;
  sneakRollOk?: boolean;
  /** pola uzupelnione domyslnie przez migracje (np. 'hp' gdy nie znano maxHP); do dopracowania */
  migrationTodo?: string[];
}

export interface SaveMapObject {
  objId: number;
  pid: number;
  hex: number;
  orientation: number;
  flags: number;
  hp: number;
  scriptLocalId: number | null;
  inventory: SaveItem[];
  /** krytery: maksimum HP, flagi obrazen (0x80 = martwy), leczenie na 3 h (opcjonalne; map-aging) */
  maxHp?: number;
  dmgFlags?: number;
  healPer3h?: number;
}

export interface MapStateJSON {
  name: string;
  lastVisitTick: number;
  mapVars: number[];
  /** zmienne mapy (map_var, MVARS); opcjonalne dla starszych zapisow */
  mvars?: number[];
  scriptLocals: Record<string, number[]>;
  elevations: { objects: SaveMapObject[] }[];
  /** timery skryptow tej mapy: czas bezwzgledny w tickach gry (add_timer_event), przezywaja zmiane mapy */
  timers?: { sid: number; atTick: number; fixedParam: number }[];
  /** mapa losowego spotkania: nigdy nie trafia do zapisu (savegame-state.md) */
  encounter?: boolean;
}

export interface SaveSettings {
  gameDifficulty: number;
  combatDifficulty: number;
  violence: number;
}

/** Widok swiata, ktory zapisujemy; zywe obiekty (zegar, kolejka) sa tu klasami. */
export interface SaveWorld {
  clock: GameClock;
  queue: EventQueue;
  rng: { seed: number };
  globals: Record<string, number>;
  player: SavePlayer;
  currentMap: { name: string; elevation: number; encounter?: boolean };
  maps: MapStateJSON[];
  settings: SaveSettings;
  scriptTimers: Record<string, number>;
  modData: Record<string, unknown>;
  /** druzyna (PartyState.toJSON); brak = nie zapisywana (starsze/proste swiaty) */
  party?: PartyStateJSON | null;
  /** globalne zmienne VAULT13.GAM, w tym karma = gvar 0 (GlobalVars.toJSON) */
  gvars?: GlobalVarsJSON | null;
  /** stan podzbioru sfall (opcjonalny; brak = sfall wylaczony/starszy zapis) */
  sfall?: SfallStateJSON | null;
  /** flagi obejrzanych filmow, 17 x 0/1 (slot 21, 0x596c78; ScriptRuntime.movieFlags); brak = same zera */
  movieFlags?: number[];
  /** flaga 'gra zakonczona' (sekwencja konca juz odpalona; [0x5186cc] w oryginale); brak = false */
  gameEnded?: boolean;
  /** bit 0x2 flagi gracza (oczekuje testu promieniowania o polnocy); brak = false */
  radiationFlag?: boolean;
}

export interface SaveMeta {
  slot: string;
  name: string;
  characterName: string;
  level: number;
  location: string;
  gameDate: string;
  realTime: number;
  /** data URL miniatury (JSON-owalna) albo null */
  thumbnail: string | null;
  engineVersion: string;
  /** czas gry rzeczywisty (ms spedzone w sesji, kumulowany przez wczytania); brak w starszych zapisach */
  playTimeMs?: number;
}

/** Czesc swiata bez zywych klas (czysty JSON). */
export type WorldJSON = Omit<
  SaveWorld,
  | 'clock'
  | 'queue'
  | 'rng'
  | 'globals'
  | 'maps'
  | 'modData'
  | 'party'
  | 'gvars'
  | 'sfall'
  | 'movieFlags'
  | 'gameEnded'
  | 'radiationFlag'
>;

/** Zapis v2 (bez druzyny i gvars); wejscie migracji. */
export interface SaveGameV2 {
  schemaVersion: 2;
  meta: SaveMeta;
  world: WorldJSON;
  maps: MapStateJSON[];
  queue: GameEventJSON[];
  clock: number;
  rng: { seed: number };
  globals: Record<string, number>;
  /** nazwy globali GAM w kolejnosci indeksow (globals.md); opcjonalne dla starszych zapisow */
  globalNames?: string[];
  modData: Record<string, unknown>;
}

/** v3: dodaje `party` i `gvars` (null gdy brak). */
export interface SaveGameV3 extends Omit<SaveGameV2, 'schemaVersion'> {
  schemaVersion: 3;
  party: PartyStateJSON | null;
  gvars: GlobalVarsJSON | null;
}

/** v4: `world.player.progress.perkPending`. */
export interface SaveGameV4 extends Omit<SaveGameV3, 'schemaVersion'> {
  schemaVersion: 4;
  /**
   * Dodane bez podbijania wersji: pole opcjonalne, brak (starsze zapisy v1-v4) = null/sfall off.
   * Migracja wsteczna nie jest potrzebna, `migrate` tylko waliduje ksztalt gdy pole jest.
   */
  sfall?: SfallStateJSON | null;
}

/** v5: `movieFlags` (17 x 0/1, slot 21 oryginalu; v1-v4 migrowane do samych zer). */
export interface SaveGameV5 extends Omit<SaveGameV4, 'schemaVersion'> {
  schemaVersion: 5;
  movieFlags: number[];
}

/** v6: `gameEnded` (gra zakonczona; v1-v5 migrowane do false, czyli wczytanie nie zmienia zachowania). */
export interface SaveGameV6 extends Omit<SaveGameV5, 'schemaVersion'> {
  schemaVersion: 6;
  gameEnded: boolean;
}

/**
 * v7: `radiationFlag` (bit 0x2 trwalej flagi gracza [proto+0x20], D 0x42d403/0x42d604: ustawiany przy dawce
 * promieniowania netto > 0, zerowany przez test polnocy; v1-v6 migrowane do false).
 */
export interface SaveGameV7 extends Omit<SaveGameV6, 'schemaVersion'> {
  schemaVersion: 7;
  radiationFlag: boolean;
}

/** Liczba flag filmow w slocie 21 (17 B). */
export const MOVIE_FLAG_COUNT = 17;

/** Aktualna wersja zapisu. */
export type SaveGame = SaveGameV7;
