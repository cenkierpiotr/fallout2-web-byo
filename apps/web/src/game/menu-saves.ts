import type { SaveMeta, SaveStore } from '@f2/engine-core';
import type { SavesCommands } from '@f2/ui';
import { resolveSlot } from './ui-bindings';

/** Slot najnowszego zapisu (dowolnego rodzaju) do "Wczytaj ostatni"; null gdy brak zapisow. */
export function latestSaveSlot(metas: readonly SaveMeta[]): string | null {
  let best: SaveMeta | undefined;
  for (const m of metas) if (!best || m.realTime > best.realTime) best = m;
  return best?.slot ?? null;
}

export interface MenuSavesDeps {
  store: Pick<SaveStore, 'readChecked' | 'delete'>;
  metas(): readonly SaveMeta[];
  /** Zapis sprawdzony i czytelny: przejscie do gry z tym slotem. */
  onLoad(slot: string): void;
  refresh(): Promise<void>;
}

const FAILED = { ok: false, code: 'save-failed' } as const;

/**
 * Komendy ekranu zapisow w menu glownym (bez zywej sesji): wczytanie sprawdza zapis w magazynie
 * (uszkodzony/nowszy daje czytelny blad) i zleca przejscie do gry; usuwanie dziala, zapis/eksport/import nie.
 */
export function createMenuSavesCommands(d: MenuSavesDeps): SavesCommands {
  return {
    async load(id) {
      const slot = resolveSlot(id, d.metas() as SaveMeta[]);
      const r = await d.store.readChecked(slot);
      if (r === null) return slot === 'quick' ? { ok: false, code: 'save-no-quick' } : FAILED;
      if ('error' in r)
        return { ok: false, code: r.error === 'save-too-new' ? 'save-version' : 'save-corrupt' };
      d.onLoad(slot);
      return { ok: true };
    },
    async remove(id) {
      await d.store.delete(resolveSlot(id, d.metas() as SaveMeta[]));
      await d.refresh();
      return { ok: true };
    },
    save: async () => FAILED,
    exportSlot: async () => FAILED,
    importFile: async () => FAILED,
  };
}
