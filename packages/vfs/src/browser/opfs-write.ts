import { readBlob } from './file-source.js';
/**
 * Zapis plikow do OPFS z fallbackiem dla Safari/iOS (brak createWritable na watku glownym).
 * Duze pliki (master.dat 300 MB+) sa zapisywane STRUMIENIOWO w kawalkach: w pamieci jest
 * naraz najwyzej jeden kawalek (domyslnie 4 MB), nigdy caly plik.
 */

interface WritableHandle {
  createWritable?: () => Promise<
    WritableStream<Uint8Array> & {
      write(d: string | Blob | Uint8Array): Promise<void>;
      close(): Promise<void>;
      abort?(): Promise<void>;
    }
  >;
}

/** Domyslna wielkosc kawalka zapisu. */
export const WRITE_CHUNK = 4 * 1024 * 1024;

/**
 * Kod workera (createSyncAccessHandle jest w Safari tylko w workerach). Protokol:
 * open{handle} -> write{buf} (kolejno, offset liczy worker) -> close. Kazda wiadomosc dostaje odpowiedz.
 */
const WORKER_SRC = `
let h = null;
let pos = 0;
self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.op === 'open') {
      h = await m.handle.createSyncAccessHandle();
      h.truncate(0);
      pos = 0;
    } else if (m.op === 'write') {
      const u = new Uint8Array(m.buf);
      h.write(u, { at: pos });
      pos += u.byteLength;
    } else if (m.op === 'close') {
      h.flush();
      h.close();
      h = null;
    }
    self.postMessage({ ok: true });
  } catch (err) {
    try { if (h) h.close(); } catch (_) {}
    h = null;
    self.postMessage({ ok: false, error: String(err) });
  }
};`;

export type WriterWorkerFactory = () => Worker;

let factory: WriterWorkerFactory = () =>
  new Worker(URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' })));

/** Do testow: podmiana fabryki workera. */
export function setWriterWorkerFactory(f: WriterWorkerFactory): void {
  factory = f;
}

/** Czy handle ma createWritable (Chrome/Firefox, nowe Safari). */
export function hasCreateWritable(fh: unknown): boolean {
  return typeof (fh as WritableHandle).createWritable === 'function';
}

/** Pisarz sekwencyjny: kolejne write() dopisuja na koniec; close() zatwierdza plik, abort() porzuca. */
export interface OpfsWriter {
  write(chunk: Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
}

function abortError(): Error {
  return new DOMException('Przerwano', 'AbortError');
}

/** Otwiera pisarza (truncate do 0); createWritable gdy jest, inaczej worker + sync access handle. */
export async function openOpfsWriter(fh: FileSystemFileHandle): Promise<OpfsWriter> {
  if (hasCreateWritable(fh)) {
    const w = await (fh as unknown as Required<WritableHandle>).createWritable();
    return {
      write: (c) => w.write(c),
      close: () => w.close(),
      abort: async () => {
        try {
          await (w.abort ? w.abort() : w.close());
        } catch {
          /* ignoruj */
        }
      },
    };
  }
  const worker = factory();
  const call = (msg: Record<string, unknown>, transfer: Transferable[] = []): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<{ ok: boolean; error?: string }>) =>
        e.data.ok ? resolve() : reject(new Error(e.data.error ?? 'zapis OPFS nieudany'));
      worker.onerror = (e) => reject(new Error(e.message || 'blad workera zapisu OPFS'));
      worker.postMessage(msg, transfer);
    });
  try {
    await call({ op: 'open', handle: fh });
  } catch (e) {
    worker.terminate();
    throw e;
  }
  return {
    async write(chunk) {
      // przekazujemy wlasnosc bufora (bez kopii), o ile widok obejmuje caly ArrayBuffer
      const whole = chunk.byteOffset === 0 && chunk.byteLength === chunk.buffer.byteLength;
      const buf = whole ? chunk.buffer : chunk.slice().buffer;
      await call({ op: 'write', buf }, [buf as ArrayBuffer]);
    },
    async close() {
      try {
        await call({ op: 'close' });
      } finally {
        worker.terminate();
      }
    },
    async abort() {
      worker.terminate();
    },
  };
}

export interface WriteOptions {
  /** Wielkosc kawalka (test/strojenie); domyslnie 4 MB. */
  chunkSize?: number;
  /** Przerwanie: zapis konczy sie bledem AbortError, a plik pozostaje niekompletny. */
  signal?: AbortSignal;
  /** Wolane po kazdym zapisanym kawalku (liczba bajtow tego pliku zapisana do tej pory). */
  onBytes?: (written: number) => void;
}

/** Zapisuje caly plik (Blob lub tekst) kawalkami; w pamieci nigdy wiecej niz jeden kawalek. */
export async function writeOpfsFile(
  fh: FileSystemFileHandle,
  data: Blob | string,
  opts: WriteOptions = {},
): Promise<void> {
  const { signal, onBytes } = opts;
  const chunk = Math.max(1, opts.chunkSize ?? WRITE_CHUNK);
  if (signal?.aborted) throw abortError();
  if (typeof data === 'string') {
    if (hasCreateWritable(fh)) {
      const cw = await (fh as unknown as Required<WritableHandle>).createWritable();
      await cw.write(data);
      await cw.close();
      return;
    }
    const w = await openOpfsWriter(fh);
    try {
      await w.write(new TextEncoder().encode(data));
      await w.close();
    } catch (e) {
      await w.abort();
      throw e;
    }
    return;
  }
  const w = await openOpfsWriter(fh);
  try {
    for (let o = 0; o < data.size; o += chunk) {
      if (signal?.aborted) throw abortError();
      await w.write(new Uint8Array(await readBlob(data.slice(o, o + chunk))));
      onBytes?.(Math.min(o + chunk, data.size));
    }
    await w.close();
  } catch (e) {
    await w.abort();
    throw e;
  }
}
