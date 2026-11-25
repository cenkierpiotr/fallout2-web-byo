import { signal, type Signal } from '@preact/signals';
import type { SaveResult, SaveSlotView, SavesCommands, SavesView } from './types';

export interface MockSaves {
  view: Signal<SavesView>;
  commands: SavesCommands;
  /** Dziennik wywolan komend (do asercji). */
  log: string[];
}

function readText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

/** Mala miniatura (SVG jako data URL) udajaca zrzut ekranu. */
const MOCK_THUMB =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="48"><rect width="64" height="48" fill="#3a5a2a"/><circle cx="32" cy="24" r="10" fill="#c8b560"/></svg>',
  );

const OK: SaveResult = { ok: true };

/** Domyslne sloty: 4 reczne (1 zajety), autozapis (zajety), quicksave (pusty). */
export function createMockSlots(manual = 4): SaveSlotView[] {
  const slots: SaveSlotView[] = [];
  for (let i = 0; i < manual; i++) {
    slots.push(
      i === 0
        ? {
            id: 'manual-0',
            kind: 'manual',
            empty: false,
            name: 'Wybraniec',
            level: 3,
            location: 'Arroyo',
            gameTime: { year: 2241, month: 7, day: 25, hour: 9, minute: 30 },
            savedAt: Date.UTC(2026, 10, 9, 18, 5),
            thumbnail: null,
          }
        : { id: `manual-${i}`, kind: 'manual', empty: true },
    );
  }
  slots.push({
    id: 'auto',
    kind: 'auto',
    empty: false,
    name: 'Wybraniec',
    level: 2,
    location: 'Klamath',
    gameTime: { year: 2241, month: 7, day: 27, hour: 14, minute: 5 },
    savedAt: Date.UTC(2026, 10, 9, 19, 40),
    thumbnail: null,
  });
  slots.push({ id: 'quick', kind: 'quick', empty: true });
  return slots;
}

/** Atrapa magazynu zapisow: zapis kopiuje dane gracza do slotu, import przyjmuje JSON z `format: "f2save"`. */
export function createMockSaves(slots: SaveSlotView[] = createMockSlots()): MockSaves {
  const view = signal<SavesView>({ slots });
  const log: string[] = [];
  const find = (id: string) => view.value.slots.find((s) => s.id === id);
  const patch = (id: string, fn: (s: SaveSlotView) => SaveSlotView) => {
    view.value = { slots: view.value.slots.map((s) => (s.id === id ? fn(s) : s)) };
  };

  const commands: SavesCommands = {
    async save(id) {
      log.push(`save:${id}`);
      if (!find(id)) return { ok: false, code: 'save-failed' };
      patch(id, (s) => ({
        id: s.id,
        kind: s.kind,
        empty: false,
        name: 'Wybraniec',
        level: 3,
        location: 'Arroyo',
        gameTime: { year: 2241, month: 7, day: 25, hour: 10, minute: 0 },
        savedAt: Date.now(),
        thumbnail: MOCK_THUMB,
      }));
      return OK;
    },
    async load(id) {
      log.push(`load:${id}`);
      return find(id)?.empty === false ? OK : { ok: false, code: 'save-failed' };
    },
    async remove(id) {
      log.push(`remove:${id}`);
      patch(id, (s) => ({ id: s.id, kind: s.kind, empty: true }));
      return OK;
    },
    async exportSlot(id) {
      log.push(`export:${id}`);
      return OK;
    },
    async importFile(file) {
      log.push(`import:${file.name}`);
      let data: unknown;
      try {
        data = JSON.parse(await readText(file));
      } catch {
        return { ok: false, code: 'save-corrupt' };
      }
      if (!data || typeof data !== 'object' || (data as { format?: unknown }).format !== 'f2save') {
        return { ok: false, code: 'save-corrupt' };
      }
      const free = view.value.slots.find((s) => s.kind === 'manual' && s.empty);
      if (!free) return { ok: false, code: 'save-failed' };
      patch(free.id, (s) => ({
        id: s.id,
        kind: s.kind,
        empty: false,
        name: 'Zaimportowany',
        level: 1,
        location: 'Arroyo',
        gameTime: { year: 2241, month: 7, day: 25, hour: 8, minute: 0 },
        savedAt: Date.now(),
        thumbnail: null,
      }));
      return OK;
    },
  };
  return { view, commands, log };
}
