import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDdrawIni } from '../../src/mods/ddraw-ini.js';
import { openModLayersNode } from '../../src/node.js';

const patch = process.env['F2_PATCH_DIR'];

describe.skipIf(!patch)('mody: overlay 1.02.25 (golden)', () => {
  it('ddraw.ini patcha: ScriptExtender=1, brak PatchFile, 17 filmow', async () => {
    const ini = parseDdrawIni(
      new TextDecoder('latin1').decode(await readFile(join(patch as string, 'ddraw.ini'))),
    );
    expect(ini.patchFiles).toEqual([]);
    expect(ini.sections['Misc']?.['ScriptExtender']).toBe('1');
    expect(
      Object.keys(ini.sections['Misc'] ?? {}).filter((k) => /^Movie\d+$/.test(k)),
    ).toHaveLength(17);
  });

  it('openModLayersNode na folderze patcha: bez modow, bez bledow', async () => {
    const m = await openModLayersNode(patch as string);
    expect(m.layers).toEqual([]);
    expect(m.skipped).toEqual([]);
    await m.close();
  });
});
