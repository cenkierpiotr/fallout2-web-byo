import { afterEach, describe, expect, it } from 'vitest';
import { copyToOpfs, openOpfsFolder } from './opfs-copy.js';
import type { PickedFolder } from './pick-folder.js';

/** Minimalny OPFS w pamieci: katalogi, pliki, zapis przez createWritable/pipeTo. */
class FakeDir {
  kind = 'directory';
  children = new Map<string, FakeDir | FakeFile>();
  constructor(public name = '') {}
  async getDirectoryHandle(n: string, o?: { create?: boolean }): Promise<FakeDir> {
    let c = this.children.get(n);
    if (!c && o?.create) this.children.set(n, (c = new FakeDir(n)));
    if (!(c instanceof FakeDir)) throw new Error('NotFound');
    return c;
  }
  async getFileHandle(n: string, o?: { create?: boolean }): Promise<FakeFile> {
    let c = this.children.get(n);
    if (!c && o?.create) this.children.set(n, (c = new FakeFile(n)));
    if (!(c instanceof FakeFile)) throw new Error('NotFound');
    return c;
  }
  async removeEntry(n: string): Promise<void> {
    this.children.delete(n);
  }
  async *entries(): AsyncGenerator<[string, FakeDir | FakeFile]> {
    yield* this.children;
  }
}
class FakeFile {
  kind = 'file';
  data = new Uint8Array(0);
  constructor(public name: string) {}
  async getFile(): Promise<File> {
    return new File([this.data], this.name);
  }
  async createWritable(): Promise<
    WritableStream<Uint8Array> & { write(d: string): Promise<void> }
  > {
    const chunks: Uint8Array[] = [];
    const ws = new WritableStream<Uint8Array>({
      write: (c) => void chunks.push(c),
      close: () => {
        if (chunks.length > 0) this.data = new Uint8Array(chunks.flatMap((c) => [...c]));
      },
    });
    return Object.assign(ws, {
      write: async (d: string) => {
        this.data = new TextEncoder().encode(d);
      },
    });
  }
}

const folder = (names: string[]): PickedFolder => ({
  kind: 'files',
  files: new Map(names.map((n) => [n, new File(['abc'], n)])),
});

function install(root: FakeDir): void {
  Object.defineProperty(globalThis, 'navigator', {
    value: { storage: { getDirectory: async () => root } },
    configurable: true,
  });
}

describe('copyToOpfs / openOpfsFolder', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).navigator;
  });
  it('pelna kopia jest otwierana', async () => {
    install(new FakeDir());
    await copyToOpfs(folder(['master.dat', 'critter.dat', 'data/a.msg']), () => undefined);
    const r = await openOpfsFolder();
    expect(r?.files.size).toBe(3);
  });
  it('przerwana kopia (brak znacznika) -> null', async () => {
    const root = new FakeDir();
    install(root);
    await copyToOpfs(folder(['master.dat']), () => undefined);
    const base = await root.getDirectoryHandle('fallout2-game');
    base.children.delete('.complete');
    expect(await openOpfsFolder()).toBeNull();
  });
  it('niezgodna liczba plikow -> null', async () => {
    const root = new FakeDir();
    install(root);
    await copyToOpfs(folder(['master.dat', 'critter.dat']), () => undefined);
    const base = await root.getDirectoryHandle('fallout2-game');
    base.children.delete('critter.dat');
    expect(await openOpfsFolder()).toBeNull();
  });
});

describe('clearOpfs', () => {
  it('usuwa kopie i nie rzuca gdy jej nie ma', async () => {
    const root = new FakeDir();
    install(root);
    await copyToOpfs(folder(['master.dat', 'critter.dat']), () => {});
    expect(root.children.size).toBe(1);
    const { clearOpfs } = await import('./opfs-copy.js');
    await clearOpfs();
    expect(root.children.size).toBe(0);
    await expect(clearOpfs()).resolves.toBeUndefined();
  });
});
