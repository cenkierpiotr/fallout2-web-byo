/** Atrapa OPFS do testow: tryb 'writable' (createWritable) lub 'sync' (tylko worker + sync access handle). */
import { setWriterWorkerFactory } from './opfs-write.js';

export interface FakeStats {
  /** Najwiekszy pojedynczy zapis/kawalek (bajty) - miara szczytowego bufora. */
  maxChunk: number;
  /** Liczba zapisow na plik (do sprawdzania wznowienia). */
  writes: Map<string, number>;
  workersTerminated: number;
}

export type FakeMode = 'writable' | 'sync';

export class FakeFile {
  kind = 'file' as const;
  data = new Uint8Array(0);
  constructor(
    public name: string,
    private stats: FakeStats,
    private mode: FakeMode,
  ) {
    if (mode === 'sync') delete (this as { createWritable?: unknown }).createWritable;
  }
  async getFile(): Promise<File> {
    return new File([this.data as BlobPart], this.name);
  }
  private note(n: number): void {
    this.stats.maxChunk = Math.max(this.stats.maxChunk, n);
    this.stats.writes.set(this.name, (this.stats.writes.get(this.name) ?? 0) + 1);
  }
  createWritable = async (): Promise<
    WritableStream<Uint8Array> & { write(d: string | Uint8Array): Promise<void> }
  > => {
    const chunks: Uint8Array[] = [];
    const commit = (): void => {
      const out = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0));
      let o = 0;
      for (const c of chunks) {
        out.set(c, o);
        o += c.length;
      }
      this.data = out;
    };
    const push = (c: Uint8Array): void => {
      this.note(c.length);
      chunks.push(c.slice());
    };
    const ws = new WritableStream<Uint8Array>({ write: push, close: commit });
    return Object.assign(ws, {
      write: async (d: string | Uint8Array) => {
        push(typeof d === 'string' ? new TextEncoder().encode(d) : d);
        commit();
      },
    });
  };
  createSyncAccessHandle() {
    let buf = this.data;
    return {
      truncate: (n: number) => void (buf = buf.slice(0, n)),
      write: (u: Uint8Array, o: { at: number }) => {
        this.note(u.byteLength);
        const need = o.at + u.byteLength;
        if (need > buf.length) {
          const nb = new Uint8Array(need);
          nb.set(buf);
          buf = nb;
        }
        buf.set(u, o.at);
        this.data = buf; // zapis widoczny od razu (jak realny sync handle)
        return u.byteLength;
      },
      flush: () => undefined,
      close: () => undefined,
    };
  }
}

export class FakeDir {
  kind = 'directory' as const;
  children = new Map<string, FakeDir | FakeFile>();
  constructor(
    public name: string,
    private stats: FakeStats,
    private mode: FakeMode,
  ) {}
  async getDirectoryHandle(n: string, o?: { create?: boolean }): Promise<FakeDir> {
    let c = this.children.get(n);
    if (!c && o?.create) this.children.set(n, (c = new FakeDir(n, this.stats, this.mode)));
    if (!(c instanceof FakeDir)) throw new Error('NotFound');
    return c;
  }
  async getFileHandle(n: string, o?: { create?: boolean }): Promise<FakeFile> {
    let c = this.children.get(n);
    if (!c && o?.create) this.children.set(n, (c = new FakeFile(n, this.stats, this.mode)));
    if (!(c instanceof FakeFile)) throw new Error('NotFound');
    return c;
  }
  async removeEntry(n: string): Promise<void> {
    if (!this.children.delete(n)) throw new Error('NotFound');
  }
  async *entries(): AsyncGenerator<[string, FakeDir | FakeFile]> {
    yield* [...this.children];
  }
}

/** Instaluje atrape jako navigator.storage + (dla 'sync') fabryke workera z protokolem opfs-write. */
export function installFakeOpfs(mode: FakeMode): { root: FakeDir; stats: FakeStats } {
  const stats: FakeStats = { maxChunk: 0, writes: new Map(), workersTerminated: 0 };
  const root = new FakeDir('', stats, mode);
  Object.defineProperty(globalThis, 'navigator', {
    value: { storage: { getDirectory: async () => root } },
    configurable: true,
  });
  if (mode === 'sync') {
    setWriterWorkerFactory(() => {
      let h: ReturnType<FakeFile['createSyncAccessHandle']> | null = null;
      let pos = 0;
      const w = {
        onmessage: null as ((e: unknown) => void) | null,
        onerror: null as unknown,
        postMessage(msg: Record<string, unknown>, transfer: Transferable[] = []) {
          // jak prawdziwy postMessage: kopia strukturalna z przekazaniem wlasnosci buforow
          const m: Record<string, unknown> = { ...msg };
          if (m.buf) m.buf = structuredClone(m.buf, { transfer }); // handle FS jest klonowalny, atrapa nie
          queueMicrotask(() => {
            try {
              if (m.op === 'open') {
                h = (m.handle as FakeFile).createSyncAccessHandle();
                h.truncate(0);
                pos = 0;
              } else if (m.op === 'write') {
                const u = new Uint8Array(m.buf as ArrayBuffer);
                h!.write(u, { at: pos });
                pos += u.byteLength;
              } else if (m.op === 'close') h!.flush();
              w.onmessage?.({ data: { ok: true } });
            } catch (e) {
              w.onmessage?.({ data: { ok: false, error: String(e) } });
            }
          });
        },
        terminate() {
          stats.workersTerminated++;
        },
      };
      return w as never;
    });
  }
  return { root, stats };
}
