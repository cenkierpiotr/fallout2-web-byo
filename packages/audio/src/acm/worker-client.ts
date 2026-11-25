import type { AcmPcm } from './decoder.js';
import type { AcmHeader } from './header.js';
import type { AcmWorkerRequest, AcmWorkerResponse } from './worker.js';

/** Minimalny interfejs Workera (pozwala wstrzyknac atrape w testach). */
export interface WorkerLike {
  postMessage(msg: AcmWorkerRequest, transfer?: Transferable[]): void;
  addEventListener(type: 'message', fn: (e: { data: AcmWorkerResponse }) => void): void;
  addEventListener(type: 'error', fn: (e: { message?: string }) => void): void;
  terminate(): void;
}

export interface AcmStreamHandle {
  readonly header: AcmHeader;
  read(maxSamples: number): Promise<{ samples: Int16Array; done: boolean }>;
  seek(sample: number): Promise<void>;
  close(): void;
}

interface Pending {
  resolve: (r: AcmWorkerResponse) => void;
  reject: (e: Error) => void;
}

const defaultFactory = (): WorkerLike =>
  new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }) as unknown as WorkerLike;

/** Klient Promise nad jednym workerem; kazde zadanie ma wlasne id. */
export class AcmWorkerClient {
  private readonly worker: WorkerLike;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  constructor(factory: () => WorkerLike = defaultFactory) {
    this.worker = factory();
    this.worker.addEventListener('message', (e) => {
      const m = e.data;
      const p = this.pending.get(m.id);
      if (!p) return;
      this.pending.delete(m.id);
      if (m.type === 'error') p.reject(new Error(m.message));
      else p.resolve(m);
    });
    this.worker.addEventListener('error', (e) => {
      const err = new Error(e.message ?? 'blad workera ACM');
      for (const p of this.pending.values()) p.reject(err);
      this.pending.clear();
    });
  }

  private call(msg: AcmWorkerRequest, transfer: Transferable[] = []): Promise<AcmWorkerResponse> {
    return new Promise((resolve, reject) => {
      this.pending.set(msg.id, { resolve, reject });
      this.worker.postMessage(msg, transfer);
    });
  }

  /** Dekoduje caly plik; `buf` jest przenoszony (po wywolaniu buf.byteLength === 0). */
  async decode(buf: Uint8Array): Promise<AcmPcm> {
    const r = await this.call({ type: 'decode', id: this.nextId++, buf }, [buf.buffer]);
    if (r.type !== 'decoded') throw new Error(`nieoczekiwana odpowiedz: ${r.type}`);
    return { header: r.header, samples: r.samples };
  }

  /** Otwiera strumien; `buf` jest przenoszony. */
  async openStream(buf: Uint8Array): Promise<AcmStreamHandle> {
    const id = this.nextId++;
    const r = await this.call({ type: 'stream-open', id, buf }, [buf.buffer]);
    if (r.type !== 'stream-opened') throw new Error(`nieoczekiwana odpowiedz: ${r.type}`);
    let closed = false;
    // Zadania jednego strumienia ida sekwencyjnie, bo odpowiedzi sa dopasowane po id strumienia.
    let tail: Promise<unknown> = Promise.resolve();
    const serial = <T>(fn: () => Promise<T>): Promise<T> => {
      const p = tail.then(fn, fn);
      tail = p.catch(() => undefined);
      return p;
    };
    return {
      header: r.header,
      read: (maxSamples) =>
        serial(async () => {
          if (closed) throw new Error('strumien zamkniety');
          const c = await this.call({ type: 'stream-read', id, maxSamples });
          if (c.type !== 'stream-chunk') throw new Error(`nieoczekiwana odpowiedz: ${c.type}`);
          return { samples: c.samples, done: c.done };
        }),
      seek: (sample) =>
        serial(async () => {
          if (closed) throw new Error('strumien zamkniety');
          await this.call({ type: 'stream-seek', id, sample });
        }),
      close: () => {
        if (closed) return;
        closed = true;
        this.worker.postMessage({ type: 'stream-close', id });
      },
    };
  }

  terminate(): void {
    this.worker.terminate();
    const err = new Error('worker zakonczony');
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
  }
}
