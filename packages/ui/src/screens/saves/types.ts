import type { GameDate } from '../../i18n';

/**
 * Lokalne typy widoku ekranu zapisow. Odpowiadaja przyszlemu `GameView.saves` / `GameCommands`
 * (adapter w apps/web); UI nie zalezy od engine-core.
 */

export type SaveSlotKind = 'manual' | 'auto' | 'quick';

/** Kody bledow; tlumaczone kluczem `saves.error.<kod>`. */
export type SaveErrorCode = 'save-corrupt' | 'save-version' | 'save-failed' | 'save-no-quick';

export interface SaveSlotView {
  /** np. `manual-0`, `auto`, `quick`. */
  id: string;
  kind: SaveSlotKind;
  empty: boolean;
  /** Imie postaci. */
  name?: string;
  level?: number;
  /** Nazwa mapy / lokacji. */
  location?: string;
  /** Czas gry w swiecie. */
  gameTime?: GameDate;
  /** Czas rzeczywisty zapisu (ms od epoki). */
  savedAt?: number;
  /** Miniatura jako data URL (lub null). */
  thumbnail?: string | null;
  /** Czas gry rzeczywisty w ms (kumulowany). */
  playTimeMs?: number;
}

export interface SavesView {
  slots: SaveSlotView[];
}

export type SaveResult = { ok: true } | { ok: false; code: SaveErrorCode };

export interface SavesCommands {
  save(slotId: string): Promise<SaveResult>;
  load(slotId: string): Promise<SaveResult>;
  remove(slotId: string): Promise<SaveResult>;
  exportSlot(slotId: string): Promise<SaveResult>;
  importFile(file: File): Promise<SaveResult>;
}
