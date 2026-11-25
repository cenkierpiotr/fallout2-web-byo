import { bufferSource } from '@f2/formats';
import { describe, expect, it } from 'vitest';
import { buildDat2 } from '../../formats/test/build-dat2.js';
import { MemoryLayer } from '../src/memory-layer.js';
import { buildModLayers, withModLayers } from '../src/mods/mod-layers.js';
import type { ModFs, ModFsEntry } from '../src/mods/mod-layers.js';
import { VirtualFs } from '../src/vfs.js';

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const dec = (b: Uint8Array): string => new TextDecoder().decode(b);
const dat = (files: Record<string, string>): Uint8Array =>
  buildDat2(Object.entries(files).map(([name, v]) => ({ name, data: enc(v), compress: false })));

/** ModFs w pamieci: klucze to sciezki plikow ('mods/rpu.dat'), katalogi wyprowadzane z kluczy. */
function memFs(files: Record<string, Uint8Array>): ModFs & { closes: number; opened: number } {
  const state = { closes: 0, opened: 0 };
  const fs: ModFs = {
    async readDir(path) {
      const prefix = path === '' ? '' : `${path}/`;
      const out = new Map<string, ModFsEntry>();
      let any = path === '';
      for (const k of Object.keys(files)) {
        if (!k.startsWith(prefix)) continue;
        any = true;
        const rest = k.slice(prefix.length);
        const i = rest.indexOf('/');
        if (i === -1) out.set(rest, { name: rest, kind: 'file' });
        else out.set(rest.slice(0, i), { name: rest.slice(0, i), kind: 'directory' });
      }
      return any ? [...out.values()] : undefined;
    },
    async readFile(path) {
      const f = files[path];
      if (!f) throw new Error(`brak: ${path}`);
      return f;
    },
    async openSource(path) {
      const f = files[path];
      if (!f) throw new Error(`brak: ${path}`);
      state.opened++;
      return {
        ...bufferSource(f),
        close: async () => {
          state.closes++;
        },
      };
    },
  };
  return Object.defineProperties(fs, {
    closes: { get: () => state.closes },
    opened: { get: () => state.opened },
  }) as ModFs & { closes: number; opened: number };
}

describe('buildModLayers', () => {
  it('test_layer_resolution_mod_overrides_patch', async () => {
    const fs = memFs({
      'a.dat': dat({ 'data/x.txt': 'a' }),
      'mods/b.dat': dat({ 'data/x.txt': 'b' }),
    });
    const mods = await buildModLayers(fs, { patchFiles: ['a.dat'], modsOrder: ['b.dat'] });
    const base = new VirtualFs([new MemoryLayer('patch', new Map([['data/x.txt', enc('base')]]))]);
    const vfs = withModLayers(base, mods);
    expect(dec(await vfs.open('data/x.txt'))).toBe('b');
    expect(vfs.layers.map((l) => l.name)).toEqual(['mods/b.dat', 'a.dat', 'patch']);
  });

  it('test_patchfile_overrides_base_but_below_mods', async () => {
    const fs = memFs({ 'a.dat': dat({ 'data/x.txt': 'a' }) });
    const mods = await buildModLayers(fs, { patchFiles: ['a.dat'] });
    const base = new VirtualFs([new MemoryLayer('patch', new Map([['data/x.txt', enc('base')]]))]);
    expect(dec(await withModLayers(base, mods).open('data/x.txt'))).toBe('a');
  });

  it('test_layer_case_insensitive_backslash', async () => {
    const fs = memFs({ 'mods/rpu.dat': dat({ 'data/x.txt': 'r' }) });
    const mods = await buildModLayers(fs, { patchFiles: ['MODS\\RPU.DAT'] });
    expect(mods.skipped).toEqual([]);
    expect(dec(await new VirtualFs(mods.layers).open('DATA\\X.TXT'))).toBe('r');
  });

  it('test_mods_order_later_has_higher_priority', async () => {
    const fs = memFs({
      'mods/a.dat': dat({ 'f.txt': 'a' }),
      'mods/b.dat': dat({ 'f.txt': 'b' }),
    });
    const ab = await buildModLayers(fs, { patchFiles: [], modsOrder: ['a.dat', 'b.dat'] });
    expect(dec(await new VirtualFs(ab.layers).open('f.txt'))).toBe('b');
    const ba = await buildModLayers(fs, { patchFiles: [], modsOrder: ['B.DAT', 'A.dat'] });
    expect(dec(await new VirtualFs(ba.layers).open('f.txt'))).toBe('a');
  });

  it('test_mods_no_order_loads_all_dat_alphabetical', async () => {
    const fs = memFs({
      'mods/Z.dat': dat({ 'f.txt': 'z' }),
      'mods/a.dat': dat({ 'f.txt': 'a' }),
      'mods/readme.txt': enc('x'),
      'mods/dirmod/f.txt': enc('dir'),
    });
    const m = await buildModLayers(fs, { patchFiles: [] });
    expect(m.layers.map((l) => l.name)).toEqual(['mods/z.dat', 'mods/a.dat']);
    expect(dec(await new VirtualFs(m.layers).open('f.txt'))).toBe('z');
  });

  it('test_mods_order_defined_ignores_unlisted', async () => {
    const fs = memFs({ 'mods/a.dat': dat({ 'f.txt': 'a' }), 'mods/b.dat': dat({ 'g.txt': 'b' }) });
    const m = await buildModLayers(fs, { patchFiles: [], modsOrder: ['a.dat'] });
    expect(new VirtualFs(m.layers).resolve('g.txt')).toBeUndefined();
    const empty = await buildModLayers(fs, { patchFiles: [], modsOrder: [] });
    expect(empty.layers).toEqual([]);
  });

  it('test_missing_entries_reported_in_skipped', async () => {
    const fs = memFs({ 'mods/a.dat': dat({ 'f.txt': 'a' }) });
    const m = await buildModLayers(fs, {
      patchFiles: ['Nie\\Ma.dat'],
      modsOrder: ['a.dat', 'Brak.dat'],
    });
    expect(m.skipped).toEqual(['Nie\\Ma.dat', 'Brak.dat']);
    expect(m.layers).toHaveLength(1);
  });

  it('test_no_mods_dir_is_not_an_error', async () => {
    const fs = memFs({ 'master.dat': new Uint8Array(1) });
    const m = await buildModLayers(fs, { patchFiles: [] });
    expect(m.layers).toEqual([]);
    expect(m.skipped).toEqual([]);
  });

  it('test_corrupt_dat_skipped_and_closed', async () => {
    const fs = memFs({
      'mods/bad.dat': enc('to nie jest dat'),
      'mods/ok.dat': dat({ 'f.txt': 'k' }),
    });
    const m = await buildModLayers(fs, { patchFiles: [] });
    expect(m.skipped).toEqual(['bad.dat']);
    expect(m.layers).toHaveLength(1);
    expect(fs.opened).toBe(2);
    expect(fs.closes).toBe(1);
    await m.close();
    expect(fs.closes).toBe(2);
  });

  it('test_mod_directory_layer', async () => {
    const fs = memFs({ 'mods/Dirmod/Data/X.txt': enc('d'), 'mods/Dirmod/art/a.frm': enc('f') });
    const m = await buildModLayers(fs, { patchFiles: [], modsOrder: ['dirmod'] });
    expect(m.skipped).toEqual([]);
    const vfs = new VirtualFs(m.layers);
    expect(dec(await vfs.open('data/x.txt'))).toBe('d');
    expect(vfs.list('art/')).toEqual(['art/a.frm']);
  });

  it('test_close_idempotent_closes_sources', async () => {
    const fs = memFs({ 'a.dat': dat({ 'f.txt': 'a' }), 'mods/b.dat': dat({ 'f.txt': 'b' }) });
    const m = await buildModLayers(fs, { patchFiles: ['a.dat'], modsOrder: ['b.dat'] });
    await m.close();
    await m.close();
    expect(fs.closes).toBe(2);
  });

  it('test_duplicate_entry_loaded_once_later_position_wins', async () => {
    const fs = memFs({
      'mods/a.dat': dat({ 'f.txt': 'a' }),
      'mods/b.dat': dat({ 'f.txt': 'b' }),
    });
    const m = await buildModLayers(fs, {
      patchFiles: ['mods/a.dat'],
      modsOrder: ['b.dat', 'a.dat'],
    });
    expect(fs.opened).toBe(2);
    expect(m.layers.map((l) => l.name)).toEqual(['mods/a.dat', 'mods/b.dat']);
  });
});
