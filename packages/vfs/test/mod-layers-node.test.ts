import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildDat2 } from '../../formats/test/build-dat2.js';
import { openModLayersNode } from '../src/node.js';
import { VirtualFs } from '../src/vfs.js';

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const dat = (files: Record<string, string>): Uint8Array =>
  buildDat2(Object.entries(files).map(([name, v]) => ({ name, data: enc(v), compress: false })));

describe('openModLayersNode', () => {
  it('test_node_mods_from_ddraw_ini_and_mods_order', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'f2-mods-'));
    await mkdir(join(dir, 'Mods'));
    await writeFile(join(dir, 'DDraw.ini'), '[Misc]\r\nPatchFile=Mods\\low.dat\r\n');
    await writeFile(join(dir, 'Mods', 'low.dat'), dat({ 'f.txt': 'low' }));
    await writeFile(join(dir, 'Mods', 'high.dat'), dat({ 'f.txt': 'high' }));
    await writeFile(join(dir, 'Mods', 'mods_order.txt'), '# kolejnosc\nhigh.dat\nnie-ma.dat\n');
    const m = await openModLayersNode(dir);
    try {
      expect(m.skipped).toEqual(['nie-ma.dat']);
      expect(m.layers.map((l) => l.name)).toEqual(['mods/high.dat', 'mods/low.dat']);
      expect(new TextDecoder().decode(await new VirtualFs(m.layers).open('F.TXT'))).toBe('high');
    } finally {
      await m.close();
    }
  });

  it('test_node_no_config_no_mods', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'f2-mods-'));
    const m = await openModLayersNode(dir);
    expect(m.layers).toEqual([]);
    await m.close();
  });
});
