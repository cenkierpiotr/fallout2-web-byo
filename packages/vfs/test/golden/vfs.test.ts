import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openGameFolderNode } from '../../src/node.js';

const dir = process.env.F2_GAME_DIR;

describe.skipIf(!dir)('VFS golden', () => {
  it('warstwy i pliki folderu gry', async () => {
    const vfs = await openGameFolderNode(dir!);
    expect((await vfs.open('art/tiles/EDG1001.FRM')).length).toBe(2954);
    expect(vfs.resolve('data/city.txt')?.name).toBe('patch000');
    expect(vfs.resolve('art/critters/hmjmpsaa.frm')?.name).toBe('critter');
    expect(vfs.list('art/tiles/').length).toBe(3083); // 3082 FRM + TILES.LST (plan mylnie podawal 3084);
  }, 60_000);

  it('pusty master.dat bez critter.dat -> brak pliku: CRITTER.DAT', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'f2vfs-'));
    await writeFile(join(tmp, 'master.dat'), new Uint8Array(0));
    await expect(openGameFolderNode(tmp)).rejects.toThrow('brak pliku: CRITTER.DAT');
  });

  const patchDir = process.env.F2_PATCH_DIR;
  it.skipIf(!patchDir)(
    'overlay patcha unofficial: 379 plikow MSG zaslania text/...',
    async () => {
      const vfs = await openGameFolderNode(dir!, patchDir);
      try {
        const msgs = vfs.list('text/').filter((k) => k.endsWith('.msg'));
        const fromOverlay = msgs.filter((k) => vfs.resolve(k)?.name === 'overlay');
        expect(fromOverlay.length).toBe(379);
        expect(vfs.list('data/').some((k) => k.startsWith('data/text/'))).toBe(false);
      } finally {
        await vfs.close();
      }
    },
    60_000,
  );
});
