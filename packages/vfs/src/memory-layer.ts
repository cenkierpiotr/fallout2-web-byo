import { normalizeDatPath } from '@f2/formats';
import type { VfsLayer } from './layer.js';

type Content = Uint8Array | (() => Promise<Uint8Array>);

export class MemoryLayer implements VfsLayer {
  private readonly files = new Map<string, Content>();

  constructor(
    readonly name: string,
    files: Map<string, Content>,
  ) {
    for (const [k, v] of files) this.files.set(normalizeDatPath(k), v);
  }

  has(path: string): boolean {
    return this.files.has(normalizeDatPath(path));
  }

  async open(path: string): Promise<Uint8Array> {
    const f = this.files.get(normalizeDatPath(path));
    if (f === undefined) throw new Error(`brak pliku: ${path}`);
    return typeof f === 'function' ? f() : f;
  }

  keys(): Iterable<string> {
    return this.files.keys();
  }
}
