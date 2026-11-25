import { signal, type ReadonlySignal } from '@preact/signals';
import { hexDistance, type GameObject, type SaveMeta, type SaveFailReason } from '@f2/engine-core';
import type {
  BarterCommands,
  BarterView,
  ClockView,
  RestCommands,
  RestMode,
  RestView,
  SaveResult as UiSaveResult,
  SaveSlotView,
  SavesCommands,
  SavesView,
} from '@f2/ui';
import type { GameSession } from './game-session';

/** Liczba slotow recznych w ekranie zapisow. */
export const MANUAL_SLOTS = 4;
/** Maksymalna odleglosc (heksy) do kupca wybieranego klawiszem/przyciskiem handlu. */
export const TRADE_RANGE = 15;

const MONTHS = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  pl: ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paz', 'lis', 'gru'],
};

/** "24 lut 2241 10:05" (jak `formatGameDate`) -> data do widoku; null gdy format nieznany. */
export function parseGameDate(s: string): SaveSlotView['gameTime'] | undefined {
  const m = /^(\d+) (\S+) (\d+) (\d+):(\d+)$/.exec(s);
  if (!m) return undefined;
  const name = m[2]!.toLowerCase();
  let month = MONTHS.pl.indexOf(name as never);
  if (month < 0) month = MONTHS.en.findIndex((x) => x.toLowerCase() === name);
  if (month < 0) return undefined;
  return {
    year: Number(m[3]),
    month: month + 1,
    day: Number(m[1]),
    hour: Number(m[4]),
    minute: Number(m[5]),
  };
}

function slotFromMeta(
  id: string,
  kind: SaveSlotView['kind'],
  m: SaveMeta | undefined,
): SaveSlotView {
  if (!m) return { id, kind, empty: true };
  const gameTime = parseGameDate(m.gameDate);
  return {
    id,
    kind,
    empty: false,
    name: m.characterName,
    level: m.level,
    location: m.location,
    ...(gameTime ? { gameTime } : {}),
    savedAt: m.realTime,
    thumbnail: m.thumbnail,
    ...(m.playTimeMs !== undefined ? { playTimeMs: m.playTimeMs } : {}),
  };
}

/** Najnowszy z rotacyjnych autozapisow `auto-N` (ekran pokazuje jeden slot "auto"). */
export function latestAuto(metas: readonly SaveMeta[]): SaveMeta | undefined {
  return metas.filter((m) => /^auto-\d+$/.test(m.slot)).sort((a, b) => b.realTime - a.realTime)[0];
}

/** Sloty silnika (`manual-N`, `auto-N`, `quick`) -> sloty ekranu zapisow. */
export function savesViewOf(metas: readonly SaveMeta[]): SavesView {
  const by = new Map(metas.map((m) => [m.slot, m]));
  const slots: SaveSlotView[] = [];
  for (let i = 0; i < MANUAL_SLOTS; i++) {
    slots.push(slotFromMeta(`manual-${i}`, 'manual', by.get(`manual-${i}`)));
  }
  // 3 rotacyjne sloty autozapisu widoczne osobno (wczytanie; zapis recznie zablokowany)
  for (let i = 0; i < 3; i++) slots.push(slotFromMeta(`auto-${i}`, 'auto', by.get(`auto-${i}`)));
  slots.push(slotFromMeta('quick', 'quick', by.get('quick')));
  return { slots };
}

function uiCode(
  reason: SaveFailReason | string,
  slot: string,
): Extract<UiSaveResult, { ok: false }>['code'] {
  if (reason === 'save-corrupt') return 'save-corrupt';
  if (reason === 'save-too-new') return 'save-version';
  if (reason === 'save-missing' && slot === 'quick') return 'save-no-quick';
  return 'save-failed';
}

export interface SavesDeps {
  session: GameSession;
  /** Wczytanie slotu silnika wraz z odswiezeniem ekranu mapy (preload, kamera). */
  load(slot: string): Promise<{ ok: true } | { ok: false; reason: string }>;
  /** Pobranie pliku eksportu (domyslnie przez <a download>). */
  download?(blob: Blob, fileName: string): void;
}

function defaultDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function resolveSlot(id: string, metas: readonly SaveMeta[]): string {
  return id === 'auto' ? (latestAuto(metas)?.slot ?? 'auto-0') : id;
}

/** Komendy ekranu zapisow na `GameSession`. */
export function createSavesCommands(d: SavesDeps): SavesCommands {
  const { session } = d;
  const metas = (): SaveMeta[] => session.view.saves.value;
  return {
    async save(id) {
      const r = await session.save(id);
      return r.ok ? { ok: true } : { ok: false, code: uiCode(r.reason, id) };
    },
    async load(id) {
      const slot = resolveSlot(id, metas());
      const r = await d.load(slot);
      return r.ok ? { ok: true } : { ok: false, code: uiCode(r.reason, slot) };
    },
    async remove(id) {
      await session.saveCommands.saves.delete(resolveSlot(id, metas()));
      await session.refreshSaves();
      return { ok: true };
    },
    async exportSlot(id) {
      const slot = resolveSlot(id, metas());
      const r = await session.saveCommands.saves.export(slot);
      if (!r.ok) return { ok: false, code: uiCode(r.reason, slot) };
      (d.download ?? defaultDownload)(r.blob, r.fileName);
      return { ok: true };
    },
    async importFile(file) {
      const free = savesViewOf(metas()).slots.find((s) => s.kind === 'manual' && s.empty);
      if (!free) return { ok: false, code: 'save-failed' };
      const r = await session.saveCommands.saves.import(file, free.id);
      await session.refreshSaves();
      return r.ok ? { ok: true } : { ok: false, code: uiCode(r.reason, free.id) };
    },
  };
}

/** Widoki i komendy @f2/ui podpiete do sesji gry (sygnaly preact zasilane sygnalami silnika). */
export interface UiBindings {
  saves: ReadonlySignal<SavesView>;
  savesCommands: SavesCommands;
  clock: ReadonlySignal<ClockView>;
  rest: ReadonlySignal<RestView>;
  restCommands: RestCommands;
  barter: ReadonlySignal<BarterView | null>;
  barterCommands: BarterCommands;
  /** Otwiera handel z najblizszym kupcem; zwraca false, gdy nikogo w poblizu. */
  tradeWithNearest(name: string, nameOf?: (o: GameObject) => string): boolean;
  dispose(): void;
}

export function nearestMerchant(session: GameSession, range = TRADE_RANGE): GameObject | null {
  const { map, player } = session.world;
  let best: GameObject | null = null;
  let bestD = Infinity;
  for (const o of map.objects) {
    if (o === player || o.type !== 1 || o.hidden || o.hex < 0 || o.elevation !== player.elevation)
      continue;
    if (o.inventory.length === 0) continue;
    const dist = hexDistance(player.hex, o.hex);
    if (dist <= range && dist < bestD) {
      best = o;
      bestD = dist;
    }
  }
  return best;
}

export function createUiBindings(
  session: GameSession,
  d: Pick<SavesDeps, 'load'> & { onRest?(): void },
): UiBindings {
  const saves = signal<SavesView>(savesViewOf([]));
  const dateOf = (): ClockView => {
    const c = session.world.clock.date;
    return { year: c.year, month: c.month, day: c.day, hour: c.hour, minute: c.minute };
  };
  const clock = signal<ClockView>(dateOf());
  let lastResult: RestView['lastResult'] = null;
  const restOf = (): RestView => ({
    clock: dateOf(),
    hp: session.state.sheet.hp,
    hpMax: session.maxHp(),
    enemiesNearby: session.enemiesNearby(),
    lastResult,
  });
  const rest = signal<RestView>(restOf());
  const barter = signal<BarterView | null>(null);

  const unsubs = [
    session.view.saves.subscribe((m) => (saves.value = savesViewOf(m))),
    session.view.clock.subscribe(() => {
      clock.value = dateOf();
      rest.value = restOf();
    }),
    session.view.barter.subscribe((b) => (barter.value = b as BarterView | null)),
  ];

  return {
    saves,
    savesCommands: createSavesCommands({ session, load: d.load }),
    clock,
    rest,
    restCommands: {
      rest(mode: RestMode) {
        const r = session.rest(mode);
        lastResult = {
          ok: r.ok,
          ...(r.reason && r.reason !== 'invalid-hours' ? { reason: r.reason } : {}),
          hoursRested: r.hoursRested,
          hpHealed: r.hpHealed,
        };
        rest.value = restOf();
        d.onRest?.();
      },
      close() {
        lastResult = null;
      },
    },
    barter,
    barterCommands: {
      move: (side, id, count, to) => session.barter.move(side, id, count, to),
      accept: () => session.barter.accept(),
      balance: () => session.barter.balance(),
      cancel: () => {
        session.barter.cancel();
        session.barter.close();
      },
    },
    tradeWithNearest(name, nameOf) {
      const m = nearestMerchant(session);
      if (!m) return false;
      session.openBarter(m, { merchantName: name, ...(nameOf ? { nameOf } : {}) });
      return true;
    },
    dispose() {
      for (const u of unsubs) u();
    },
  };
}
