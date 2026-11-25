/**
 * Telemetria lokalna (Zadanie 38): zdarzenia, bledy, wydajnosc. Dane zostaja w przegladarce
 * (IndexedDB), nic nie jest wysylane; uzytkownik eksportuje je recznie (JSON lines).
 */
export type TelemetryKind =
  'error' | 'vm_error' | 'perf' | 'save' | 'load' | 'map_enter' | 'movie' | 'update';

export interface TelemetryEvent {
  t: string;
  kind: TelemetryKind;
  data: Record<string, string | number | boolean>;
}

export interface TelemetryBackend {
  load(): Promise<TelemetryEvent[]>;
  save(events: TelemetryEvent[]): Promise<void>;
  clear(): Promise<void>;
}

export class MemoryBackend implements TelemetryBackend {
  private events: TelemetryEvent[] = [];
  async load(): Promise<TelemetryEvent[]> {
    return [...this.events];
  }
  async save(events: TelemetryEvent[]): Promise<void> {
    this.events = [...events];
  }
  async clear(): Promise<void> {
    this.events = [];
  }
}

const DB_NAME = 'f2-telemetry';
const STORE = 'telemetry';
const KEY = 'events';

function reqDone<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** IndexedDB: jeden rekord z cala tablica. Brak IndexedDB lub blad => cichy no-op. */
export class IdbBackend implements TelemetryBackend {
  private openDb(): Promise<IDBDatabase> {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    return reqDone(req);
  }

  private async run<T>(
    mode: IDBTransactionMode,
    fn: (s: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T | undefined> {
    if (typeof indexedDB === 'undefined') return undefined;
    try {
      const db = await this.openDb();
      try {
        return await reqDone(fn(db.transaction(STORE, mode).objectStore(STORE)));
      } finally {
        db.close();
      }
    } catch {
      return undefined;
    }
  }

  async load(): Promise<TelemetryEvent[]> {
    const r = await this.run('readonly', (s) => s.get(KEY));
    return Array.isArray(r) ? (r as TelemetryEvent[]) : [];
  }
  async save(events: TelemetryEvent[]): Promise<void> {
    await this.run('readwrite', (s) => s.put(events, KEY));
  }
  async clear(): Promise<void> {
    await this.run('readwrite', (s) => s.delete(KEY));
  }
}

export interface LocalTelemetryOptions {
  backend?: TelemetryBackend;
  maxEvents?: number;
  maxBytes?: number;
  now?: () => Date;
  flushMs?: number;
}

const sizeOf = (e: TelemetryEvent): number => JSON.stringify(e).length;

export class LocalTelemetry {
  private readonly maxEvents: number;
  private readonly maxBytes: number;
  private readonly now: () => Date;
  private readonly flushMs: number;
  private readonly backend: TelemetryBackend;
  private events: TelemetryEvent[] = [];
  private bytes = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: LocalTelemetryOptions = {}) {
    this.maxEvents = opts.maxEvents ?? 10_000;
    this.maxBytes = opts.maxBytes ?? 5 * 1024 * 1024;
    this.now = opts.now ?? (() => new Date());
    this.flushMs = opts.flushMs ?? 2000;
    this.backend = opts.backend ?? new MemoryBackend();
  }

  get storageBytes(): number {
    return this.bytes;
  }
  get size(): number {
    return this.events.length;
  }

  /** Synchroniczne; ring buffer wycina najstarsze po przekroczeniu limitu zdarzen lub bajtow. */
  record(ev: { kind: TelemetryKind; data: TelemetryEvent['data']; t?: string }): void {
    const e: TelemetryEvent = {
      t: ev.t ?? this.now().toISOString(),
      kind: ev.kind,
      data: { ...ev.data },
    };
    this.events.push(e);
    this.bytes += sizeOf(e);
    this.trim();
    this.schedule();
  }

  async init(): Promise<void> {
    const loaded = await this.backend.load();
    this.events = [...loaded, ...this.events];
    this.bytes = this.events.reduce((n, e) => n + sizeOf(e), 0);
    this.trim();
  }

  async flush(): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    try {
      await this.backend.save(this.events);
    } catch {
      /* telemetria nie moze psuc gry */
    }
  }

  async query(filter: { kind?: TelemetryKind; since?: Date } = {}): Promise<TelemetryEvent[]> {
    const since = filter.since?.getTime();
    return this.events.filter(
      (e) =>
        (filter.kind === undefined || e.kind === filter.kind) &&
        (since === undefined || Date.parse(e.t) >= since),
    );
  }

  async export(): Promise<Blob> {
    const text =
      this.events.map((e) => JSON.stringify(e)).join('\n') + (this.events.length ? '\n' : '');
    return new Blob([text], { type: 'application/x-ndjson' });
  }

  async clear(): Promise<void> {
    this.events = [];
    this.bytes = 0;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.backend.clear();
  }

  perfSummary(): { avgFps: number; minFps: number; samples: number } {
    const fps = this.events
      .filter((e) => e.kind === 'perf' && typeof e.data['fps'] === 'number')
      .map((e) => e.data['fps'] as number);
    if (fps.length === 0) return { avgFps: 0, minFps: 0, samples: 0 };
    return {
      avgFps: fps.reduce((a, b) => a + b, 0) / fps.length,
      minFps: Math.min(...fps),
      samples: fps.length,
    };
  }

  recordVmError(info: {
    script: string;
    proc: string;
    opcode: number | string;
    message: string;
  }): void {
    this.record({
      kind: 'vm_error',
      data: {
        script: info.script,
        proc: info.proc,
        opcode: String(info.opcode),
        message: info.message,
      },
    });
  }

  recordPerfSample(fps: number): void {
    this.record({ kind: 'perf', data: { fps } });
  }

  private trim(): void {
    let drop = 0;
    while (
      this.events.length - drop > 1 &&
      (this.events.length - drop > this.maxEvents || this.bytes > this.maxBytes)
    ) {
      this.bytes -= sizeOf(this.events[drop]!);
      drop++;
    }
    if (drop > 0) this.events.splice(0, drop);
  }

  private schedule(): void {
    if (this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.flushMs);
  }
}

export interface ErrorTarget {
  addEventListener(type: string, fn: (e: never) => void): void;
}

/** Podpina window.onerror / unhandledrejection do telemetrii (target = window). */
export function installGlobalErrorCapture(tel: LocalTelemetry, target: ErrorTarget): void {
  target.addEventListener('error', ((e: {
    message?: string;
    filename?: string;
    lineno?: number;
  }) => {
    tel.record({
      kind: 'error',
      data: {
        message: String(e.message ?? ''),
        source: String(e.filename ?? ''),
        line: e.lineno ?? 0,
      },
    });
  }) as (e: never) => void);
  target.addEventListener('unhandledrejection', ((e: { reason?: unknown }) => {
    const r = e.reason;
    const message = r instanceof Error ? r.message : String(r);
    tel.record({ kind: 'error', data: { message } });
  }) as (e: never) => void);
}
