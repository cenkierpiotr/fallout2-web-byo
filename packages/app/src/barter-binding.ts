/**
 * Adapter sesji handlu (`BarterSession` z @f2/engine-core, z wstrzyknietymi regulami @f2/rules)
 * do widoku i komend ekranu handlu z @f2/ui (`BarterView`, `BarterCommands`).
 *
 * Pakiety nie zaleza od siebie: sesja i typy ekranu sa opisane strukturalnie. Wlasciwe
 * `BarterRules` (`{ barterPrice, splitCaps, barterAccept }` z @f2/rules) wstrzykuje korzen
 * kompozycji przy tworzeniu `BarterSession`.
 */

export type BarterCategory = 'weapon' | 'armor' | 'drug' | 'ammo' | 'misc' | 'quest';

/** Dane prezentacyjne przedmiotu (sesja zna tylko id tekstowe, pid, ilosc, wartosc i mase). */
export interface BarterItemMeta {
  /** Liczbowe id uzywane przez UI (musi byc unikalne w obrebie handlu). */
  id: number;
  name: string;
  fid: number;
  category: BarterCategory;
}

interface SessionItem {
  id: string;
  pid: number;
  count: number;
  value: number;
  weight: number;
  blocked?: boolean;
}

export type SessionAcceptResult =
  | 'ok'
  | 'player-cannot-carry'
  | 'merchant-cannot-carry'
  | 'not-tradeable'
  | 'offer-too-low'
  | 'session-closed';

/** Wycinek `BarterSession` potrzebny adapterowi. */
export interface BarterSessionLike {
  readonly playerInv: readonly SessionItem[];
  readonly merchantInv: readonly SessionItem[];
  readonly playerTable: readonly SessionItem[];
  readonly merchantTable: readonly SessionItem[];
  readonly isClosed: boolean;
  addToTable(side: 'player' | 'merchant', id: string, count?: number): boolean;
  removeFromTable(side: 'player' | 'merchant', id: string, count?: number): boolean;
  totals(): { offer: number; merchantValue: number; balanced: boolean };
  accept(): SessionAcceptResult;
  balance(capsPid?: number): 'ok' | 'not-enough-caps' | 'nothing-to-balance';
  cancel(): void;
}

export interface BarterViewItem {
  id: number;
  pid: number;
  name: string;
  fid: number;
  category: BarterCategory;
  count: number;
  weight: number;
  value: number;
  usable: boolean;
  tradeable: boolean;
}

export interface BarterViewParams {
  merchantBarter: number;
  partyBestBarter: number;
  barterMod: number;
  masterTrader: boolean;
}

/** Zgodne strukturalnie z `BarterView` z @f2/ui. */
export interface BarterSnapshot {
  merchantName: string;
  player: BarterViewItem[];
  merchant: BarterViewItem[];
  tablePlayer: BarterViewItem[];
  tableMerchant: BarterViewItem[];
  params: BarterViewParams;
  totals: { offer: number; wanted: number; balanced: boolean };
  containerMode: boolean;
}

export type BarterReason =
  | 'player-cannot-carry'
  | 'merchant-cannot-carry'
  | 'not-tradeable'
  | 'offer-too-low'
  | 'session-closed'
  | 'not-enough-caps'
  | 'nothing-to-balance'
  | 'count-exceeds'
  | 'not-found'
  | 'unknown';

export type BarterCmdResult = { ok: true } | { ok: false; reason: BarterReason };

/** Zgodne strukturalnie z `BarterCommands` z @f2/ui. */
export interface BarterBindingCommands {
  move(
    side: 'player' | 'merchant',
    itemId: number,
    count: number,
    to: 'table' | 'inventory',
  ): BarterCmdResult;
  accept(): BarterCmdResult;
  balance(): BarterCmdResult;
  cancel(): void;
}

export interface BarterBindingOptions {
  merchantName: string;
  /** Dane prezentacyjne wg id tekstowego z sesji. */
  meta: Readonly<Record<string, BarterItemMeta>>;
  /** Parametry pokazywane w opisie cennika (te same, ktore dostala sesja). */
  params: BarterViewParams;
  containerMode?: boolean;
  /** Wolane po kazdej zmianie stanu sesji (ustaw tam sygnal widoku: `view.value = b.snapshot()`). */
  onChange?: () => void;
}

export interface BarterBinding {
  snapshot(): BarterSnapshot;
  commands: BarterBindingCommands;
}

export function createBarterBinding(
  session: BarterSessionLike,
  opts: BarterBindingOptions,
): BarterBinding {
  const byNumeric = new Map<number, string>();
  for (const [key, m] of Object.entries(opts.meta)) {
    if (byNumeric.has(m.id)) throw new Error(`barter: powtorzone id UI ${m.id}`);
    byNumeric.set(m.id, key);
  }

  const toView = (i: SessionItem): BarterViewItem => {
    const m = opts.meta[i.id];
    if (!m) throw new Error(`barter: brak danych prezentacji dla "${i.id}"`);
    return {
      id: m.id,
      pid: i.pid,
      name: m.name,
      fid: m.fid,
      category: m.category,
      count: i.count,
      weight: i.weight,
      value: i.value,
      usable: false,
      tradeable: !i.blocked,
    };
  };

  const containerMode = opts.containerMode === true;

  const snapshot = (): BarterSnapshot => {
    const t = session.totals();
    return {
      merchantName: opts.merchantName,
      player: session.playerInv.map(toView),
      merchant: session.merchantInv.map(toView),
      tablePlayer: session.playerTable.map(toView),
      tableMerchant: session.merchantTable.map(toView),
      params: { ...opts.params },
      totals: { offer: t.offer, wanted: t.merchantValue, balanced: t.balanced },
      containerMode,
    };
  };

  const changed = () => opts.onChange?.();

  const commands: BarterBindingCommands = {
    move(side, itemId, count, to) {
      const key = byNumeric.get(itemId);
      if (key === undefined) return { ok: false, reason: 'not-found' };
      const inv = side === 'player' ? session.playerInv : session.merchantInv;
      const table = side === 'player' ? session.playerTable : session.merchantTable;
      const src = (to === 'table' ? inv : table).find((i) => i.id === key);
      if (!src) return { ok: false, reason: 'not-found' };
      if (!Number.isInteger(count) || count < 1 || count > src.count) {
        return { ok: false, reason: 'count-exceeds' };
      }
      if (to === 'table' && src.blocked) return { ok: false, reason: 'not-tradeable' };
      const done =
        to === 'table'
          ? session.addToTable(side, key, count)
          : session.removeFromTable(side, key, count);
      if (!done) return { ok: false, reason: session.isClosed ? 'session-closed' : 'unknown' };
      changed();
      return { ok: true };
    },
    accept() {
      const res = session.accept();
      if (res !== 'ok') return { ok: false, reason: res };
      changed();
      return { ok: true };
    },
    balance() {
      const res = session.balance();
      if (res !== 'ok') return { ok: false, reason: res };
      changed();
      return { ok: true };
    },
    cancel() {
      session.cancel();
      changed();
    },
  };

  return { snapshot, commands };
}
