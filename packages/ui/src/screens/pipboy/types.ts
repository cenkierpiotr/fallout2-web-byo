/**
 * Lokalne typy widoku Pip-Boya. Odpowiadaja przyszlemu `GameView.player` / `GameCommands`
 * (adapter w apps/web); UI nie zalezy od engine-core.
 */

export type PipboyTabId = 'status' | 'quests' | 'archives' | 'map' | 'clock';

export const PIPBOY_TABS: readonly PipboyTabId[] = ['status', 'quests', 'archives', 'map', 'clock'];

export interface PipboyStatusView {
  name: string;
  level: number;
  hp: number;
  hpMax: number;
  ap: number;
  apMax: number;
  exp: number;
  expNext: number;
  /** Stan zapisany w dniach gry (placeholder czasu do M5). */
  day: number;
}

export type QuestStatus = 'active' | 'completed';

export interface PipboyQuest {
  description: string;
  status: QuestStatus;
  /** Opcjonalny identyfikator obszaru mapy swiata (skok z dziennika). */
  areaId?: number;
}

export interface PipboyQuestGroup {
  location: string;
  quests: PipboyQuest[];
}

export interface PipboyHolodisk {
  id: number;
  title: string;
  text: string;
}

export interface PipboyKarmaTitle {
  name: string;
  description: string;
}

/** Odkryte kafle automapy: bitmapa 1 bit na kafel, rzedami, domyslnie 100x100 (1250 B). */
export interface PipboyAutomapView {
  width: number;
  height: number;
  bits: Uint8Array;
  /** Nazwa mapy i poziom do podpisu. */
  mapName?: string;
  elevation?: number;
}

export interface PipboyClockView {
  day: number;
  hour: number;
  minute: number;
}

export type RestTarget =
  { kind: 'minutes'; n: number } | { kind: 'hour'; h: number } | { kind: 'healed' };

/** Polecenia z Pip-Boya do silnika (adapter w apps/web). */
export interface PipboyCommands {
  rest?: (target: RestTarget) => void;
  focusArea?: (areaId: number) => void;
}

export interface PipboyView {
  status: PipboyStatusView;
  quests?: PipboyQuestGroup[];
  holodisks?: PipboyHolodisk[];
  karma?: { value: number; titles: PipboyKarmaTitle[] };
  automap?: PipboyAutomapView;
  clock?: PipboyClockView;
  /** Gdy ustawione, odpoczynek jest zablokowany (np. wrogowie w poblizu). */
  restBlocked?: 'enemies_nearby' | 'combat' | 'map_forbids';
}

export const AUTOMAP_SIZE = 100;
export const AUTOMAP_BYTES = (AUTOMAP_SIZE * AUTOMAP_SIZE) / 8;
