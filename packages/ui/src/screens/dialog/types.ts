/** Typy lokalne ekranu dialogu (adapter GameView/GameCommands powstaje w Zadaniu 14). */

export type DialogReaction = 'good' | 'neutral' | 'bad';

export interface DialogOptionView {
  /** Argument `choose`. */
  index: number;
  text: string;
  /** Opcja niedostepna (np. za niskie IQ) jest pomijana. */
  visible: boolean;
  /** Wymagane IQ (0 = brak wymagania). */
  iqRequired: number;
  /** Test umiejetnosci (np. Retoryka): nazwa i szansa w procentach. */
  skill?: { name: string; percent: number };
  reaction: DialogReaction;
}

export interface DialogHistoryEntry {
  who: 'npc' | 'player';
  text: string;
}

export interface DialogView {
  npcName: string;
  npcText: string;
  /** Rozmowa bez wyboru (tryb 'message'): tylko przycisk Zamknij. */
  mode: 'reply' | 'message';
  options: DialogOptionView[];
  /** Cala historia, wlacznie z biezaca kwestia NPC. */
  history: DialogHistoryEntry[];
  canBarter: boolean;
}

export interface DialogCommands {
  choose(index: number): void;
  close(): void;
  barter(): void;
}

export interface DialogSignalLike {
  value: DialogView | null;
}
