import type { Frm } from '@f2/formats';
import type { DecodeRequest, DecodeResponse, PickedFolder } from './protocol.js';

type Pending = { resolve: (r: DecodeResponse) => void; reject: (e: Error) => void };
type Body<T> = T extends unknown ? Omit<T, 'id'> : never;

export class DecodeClient {
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  constructor(private readonly worker: Worker) {
    worker.onmessage = (ev: MessageEvent<DecodeResponse>) => {
      const p = this.pending.get(ev.data.id);
      if (!p) return;
      this.pending.delete(ev.data.id);
      if (ev.data.type === 'error') p.reject(new Error(ev.data.message));
      else p.resolve(ev.data);
    };
    worker.onerror = (ev) => {
      const err = new Error(ev.message || 'blad workera');
      for (const p of this.pending.values()) p.reject(err);
      this.pending.clear();
    };
  }

  private call(body: Body<DecodeRequest>): Promise<DecodeResponse> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ ...body, id });
    });
  }

  async init(folder: PickedFolder): Promise<{ entries: number; layers: string[] }> {
    const r = await this.call({ type: 'init', folder });
    if (r.type !== 'init') throw new Error('zla odpowiedz workera');
    return { entries: r.entries, layers: r.layers };
  }

  async loadFrm(path: string): Promise<Frm> {
    const r = await this.call({ type: 'frm', path });
    if (r.type !== 'frm') throw new Error('zla odpowiedz workera');
    return r.frm;
  }

  async read(path: string): Promise<Uint8Array> {
    const r = await this.call({ type: 'read', path });
    if (r.type !== 'read') throw new Error('zla odpowiedz workera');
    return r.data;
  }

  async list(prefix: string): Promise<string[]> {
    const r = await this.call({ type: 'list', prefix });
    if (r.type !== 'list') throw new Error('zla odpowiedz workera');
    return r.names;
  }

  terminate(): void {
    this.worker.terminate();
  }
}
