import { normalizeDatPath } from '@f2/formats';
import type { VfsLayer } from './layer.js';

export class VirtualFs {
  /** Warstwy od najwyzszego priorytetu. */
  constructor(readonly layers: VfsLayer[]) {}

  resolve(path: string): VfsLayer | undefined {
    const p = normalizeDatPath(path);
    return this.layers.find((l) => l.has(p));
  }

  async open(path: string): Promise<Uint8Array> {
    const layer = this.resolve(path);
    if (!layer) throw new Error(`brak pliku: ${path}`);
    return layer.open(path);
  }

  list(prefix = ''): string[] {
    let p = normalizeDatPath(prefix);
    if (p !== '' && !p.endsWith('/')) p += '/';
    const out = new Set<string>();
    for (const l of this.layers) {
      for (const k of l.keys()) if (k.startsWith(p)) out.add(k);
    }
    return [...out].sort();
  }
}
