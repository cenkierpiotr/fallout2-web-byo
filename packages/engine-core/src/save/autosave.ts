import { formatGameDate } from '../game-clock.js';
import { exportFileName, exportSave, importSave } from './export.js';
import { serializeWorld, deserializeWorld } from './serialize.js';
import { isValidSlot, type SaveGame, type SaveMeta, type SaveWorld } from './schema.js';
import type { SaveStore } from './save-store.js';

export interface AutosavePolicy {
  onMapChange: boolean;
  /** liczba slotow auto-N uzywanych rotacyjnie (1..3) */
  rotate: number;
  /** autozapis co N ms czasu rzeczywistego gry (0/brak = tylko przy zmianie mapy); sprawdza `AutosaveTimer` */
  intervalMs?: number;
}

export type AutosaveState = 'saving' | 'done' | 'failed' | 'skipped';

export type SaveFailReason =
  | 'save-in-dialog'
  | 'save-in-combat'
  | 'save-in-encounter'
  | 'bad-slot'
  | 'save-missing'
  | 'save-corrupt'
  | 'save-too-new';
export type SaveResult = { ok: true } | { ok: false; reason: SaveFailReason };

export interface SaveCommandsDeps {
  store: SaveStore;
  getWorld(): SaveWorld;
  /** Podmiana swiata po wczytaniu. */
  setWorld(w: SaveWorld, meta: SaveMeta): void;
  isInDialog(): boolean;
  isInCombat?(): boolean;
  now(): number;
  characterName(): string;
  locale(): 'pl' | 'en';
  engineVersion: string;
  policy: AutosavePolicy;
  /** Miniatura jako data URL (patrz app/thumbnail.ts); null/brak = bez miniatury. */
  getThumbnail?(): Promise<string | null>;
  /** Czas gry rzeczywisty w ms (do metadanych slotu). */
  playTimeMs?(): number;
  /** Powiadomienie o stanie autozapisu (wskaznik w UI). */
  onAutosave?(state: AutosaveState, slot: string | null): void;
}

export class SaveCommands {
  private lastAuto = -1;
  constructor(private readonly d: SaveCommandsDeps) {}

  private blocked(): SaveResult | null {
    if (this.d.isInDialog()) return { ok: false, reason: 'save-in-dialog' };
    if (this.d.isInCombat?.()) return { ok: false, reason: 'save-in-combat' };
    if (this.d.getWorld().currentMap.encounter === true)
      return { ok: false, reason: 'save-in-encounter' };
    return null;
  }

  /** Serializuje zapisy (quick/auto/manual) w kolejke, zeby sie nie nakladaly. */
  private chain: Promise<unknown> = Promise.resolve();
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.catch(() => undefined);
    return run;
  }

  save(slot: string, name = ''): Promise<SaveResult> {
    // migawka powstaje synchronicznie w chwili wywolania; kolejka porzadkuje tylko zapis
    const snap = this.snapshot(slot, name);
    if ('ok' in snap) return Promise.resolve(snap);
    return this.enqueue(() => this.commit(slot, snap));
  }

  /** Walidacja + serializacja + meta atomowo (bez await). */
  private snapshot(slot: string, name: string): SaveGame | SaveResult {
    if (!isValidSlot(slot)) return { ok: false, reason: 'bad-slot' };
    const b = this.blocked();
    if (b) return b;
    const w = this.d.getWorld();
    const meta: SaveMeta = {
      slot,
      name: name || slot,
      characterName: this.d.characterName(),
      level: w.player.progress.level,
      location: w.currentMap.name,
      gameDate: formatGameDate(w.clock, this.d.locale()),
      realTime: this.d.now(),
      thumbnail: null,
      engineVersion: this.d.engineVersion,
      ...(this.d.playTimeMs ? { playTimeMs: Math.max(0, Math.floor(this.d.playTimeMs())) } : {}),
    };
    return serializeWorld(w, meta);
  }

  private async commit(slot: string, snapshot: SaveGame): Promise<SaveResult> {
    snapshot.meta.thumbnail = (await this.d.getThumbnail?.()) ?? null;
    await this.d.store.write(slot, snapshot);
    return { ok: true };
  }

  /** Wczytanie idzie przez ta sama kolejke co zapisy (nie czyta w trakcie zapisu). */
  load(slot: string): Promise<SaveResult> {
    if (!isValidSlot(slot)) return Promise.resolve({ ok: false, reason: 'bad-slot' });
    return this.enqueue(() => this.loadNow(slot));
  }

  private async loadNow(slot: string): Promise<SaveResult> {
    const r = await this.d.store.readChecked(slot);
    if (r === null) return { ok: false, reason: 'save-missing' };
    if ('error' in r) return { ok: false, reason: r.error };
    this.d.setWorld(deserializeWorld(r), r.meta);
    return { ok: true };
  }

  quickSave(): Promise<SaveResult> {
    return this.save('quick', 'quick');
  }
  quickLoad(): Promise<SaveResult> {
    return this.load('quick');
  }

  /** Zapis do najstarszego (lub pustego) z slotow auto-0..rotate-1. */
  autosave(): Promise<SaveResult> {
    return this.enqueue(() => this.autosaveNow());
  }

  private async autosaveNow(): Promise<SaveResult> {
    const b = this.blocked();
    if (b) {
      this.d.onAutosave?.('skipped', null);
      return b;
    }
    const n = Math.min(3, Math.max(1, Math.floor(this.d.policy.rotate)));
    const times = new Map((await this.d.store.list()).map((m) => [m.slot, m.realTime]));
    let best = 0;
    let bestT = Infinity;
    for (let k = 1; k <= n; k++) {
      const i = (this.lastAuto + k) % n;
      const t = times.get(`auto-${i}`) ?? -Infinity;
      if (t < bestT) {
        best = i;
        bestT = t;
      }
    }
    const slot = `auto-${best}`;
    const snap = this.snapshot(slot, slot);
    if ('ok' in snap) {
      this.d.onAutosave?.('skipped', null);
      return snap;
    }
    // slot wybrany dopiero po udanej migawce (po await store.list)
    this.lastAuto = best;
    this.d.onAutosave?.('saving', slot);
    try {
      const r = await this.commit(slot, snap);
      this.d.onAutosave?.('done', slot);
      return r;
    } catch (e) {
      this.d.onAutosave?.('failed', slot);
      throw e;
    }
  }

  async onMapChange(): Promise<SaveResult | null> {
    return this.d.policy.onMapChange ? this.autosave() : null;
  }

  readonly saves = {
    list: (): Promise<SaveMeta[]> => this.d.store.list(),
    delete: (slot: string): Promise<void> => this.enqueue(() => this.d.store.delete(slot)),
    export: (
      slot: string,
    ): Promise<
      { ok: true; blob: Blob; fileName: string } | { ok: false; reason: SaveFailReason }
    > =>
      this.enqueue(async () => {
        const r = await this.d.store.readChecked(slot);
        if (r === null) return { ok: false, reason: 'save-missing' };
        if ('error' in r) return { ok: false, reason: r.error };
        return { ok: true, blob: await exportSave(r), fileName: exportFileName(r) } as const;
      }),
    import: (file: Blob, slot: string): Promise<SaveResult> => {
      if (!isValidSlot(slot)) return Promise.resolve({ ok: false, reason: 'bad-slot' });
      return this.enqueue(async (): Promise<SaveResult> => {
        const r = await importSave(file);
        if ('error' in r) return { ok: false, reason: r.error };
        await this.d.store.write(slot, r);
        return { ok: true };
      });
    },
  };
}

/**
 * Cykliczny autozapis wg `policy.intervalMs`: wolany z petli gry (`tick(nowMs)`), bez wlasnych timerow
 * (testowalny, nie dziala w tle). Odlicza czas rzeczywisty; po wywolaniu autozapisu (takze nieudanego
 * lub zablokowanego dialogiem/walka) kolejna proba dopiero po kolejnym interwale, a przy
 * zablokowaniu ponawia po `retryMs`.
 */
export class AutosaveTimer {
  private next: number | null = null;
  constructor(
    private readonly commands: Pick<SaveCommands, 'autosave'>,
    private readonly policy: () => AutosavePolicy,
    private readonly retryMs = 30_000,
  ) {}

  /** Zeruje odliczanie (np. po recznym zapisie albo zmianie mapy). */
  reset(nowMs: number): void {
    const i = this.policy().intervalMs ?? 0;
    this.next = i > 0 ? nowMs + i : null;
  }

  async tick(nowMs: number): Promise<SaveResult | null> {
    const i = this.policy().intervalMs ?? 0;
    if (i <= 0) {
      this.next = null;
      return null;
    }
    if (this.next === null) {
      this.next = nowMs + i;
      return null;
    }
    if (nowMs < this.next) return null;
    this.next = nowMs + i;
    const r = await this.commands
      .autosave()
      .catch((): SaveResult => ({ ok: false, reason: 'bad-slot' }));
    if (!r.ok) this.next = nowMs + Math.min(i, this.retryMs);
    return r;
  }
}
