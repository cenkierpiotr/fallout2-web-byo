/**
 * Smoke Z31: uklad modu RPU (Restoration Project Unofficial) w folderze gry.
 * Prawdziwych plikow RPU nie ma lokalnie (patrz dokumentacja techniczna), wiec test uzywa
 * SYNTETYCZNEGO modu o tym samym ukladzie: DDraw.ini z PatchFile, mods/mods_order.txt, kilka DAT
 * RPU, luzny katalog data/ i nakladka na prawdziwa baze gry (jesli F2_GAME_DIR jest ustawione).
 */
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildDat2 } from '../../formats/test/build-dat2.js';
import { openGameFolderNode, openModLayersNode } from '../src/node.js';
import { withModLayers } from '../src/mods/mod-layers.js';
import { VirtualFs } from '../src/vfs.js';

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const dec = (b: Uint8Array): string => new TextDecoder().decode(b);
const dat = (files: Record<string, string>): Uint8Array =>
  buildDat2(Object.entries(files).map(([name, v]) => ({ name, data: enc(v), compress: false })));

async function rpuGame(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'f2-rpu-'));
  await mkdir(join(dir, 'mods'));
  await mkdir(join(dir, 'mods', 'rpu_loose', 'data', 'text', 'english', 'game'), {
    recursive: true,
  });
  await writeFile(join(dir, 'ddraw.ini'), '[Misc]\r\nPatchFile=mods\\RPU_base.dat\r\n');
  await writeFile(
    join(dir, 'mods', 'RPU_base.dat'),
    dat({
      'data/maps/arvillag.map': 'rpu-base-map',
      'data/proto/items/00000001.pro': 'rpu-base-pro',
      'data/text/english/game/pro_item.msg': 'rpu-base-msg',
    }),
  );
  await writeFile(
    join(dir, 'mods', 'RPU_fixes.dat'),
    dat({ 'data/maps/arvillag.map': 'rpu-fixes-map', 'data/art/critters/hmwarr.frm': 'rpu-frm' }),
  );
  await writeFile(
    join(dir, 'mods', 'RPU_zepsuty.dat'),
    new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
  );
  await writeFile(
    join(dir, 'mods', 'rpu_loose', 'data', 'text', 'english', 'game', 'pro_item.msg'),
    'rpu-loose-msg',
  );
  // baza gry trzyma teksty bez prefiksu data/ (MASTER.DAT: text/english/game/...)
  await mkdir(join(dir, 'mods', 'rpu_loose', 'text', 'english', 'game'), { recursive: true });
  await writeFile(
    join(dir, 'mods', 'rpu_loose', 'text', 'english', 'game', 'pro_item.msg'),
    'rpu-loose-msg',
  );
  await writeFile(
    join(dir, 'mods', 'mods_order.txt'),
    '# RPU\nRPU_fixes.dat\nRPU_zepsuty.dat\nrpu_loose\nRPU_brak.dat\n',
  );
  return dir;
}

describe('RPU smoke (modul syntetyczny, uklad RPU)', () => {
  it('test_rpu_layers_priority_skipped_and_loose_dir', async () => {
    const m = await openModLayersNode(await rpuGame());
    try {
      // najwyzszy priorytet pierwszy: luzny katalog > fixes > base (PatchFile na samym dole)
      expect(m.layers.map((l) => l.name)).toEqual([
        'mods/rpu_loose/',
        'mods/rpu_fixes.dat',
        'mods/rpu_base.dat',
      ]);
      // uszkodzony DAT i brakujacy wpis nie przerywaja ladowania
      expect(m.skipped.sort()).toEqual(['RPU_brak.dat', 'RPU_zepsuty.dat']);
      const v = new VirtualFs(m.layers);
      expect(dec(await v.open('DATA\\MAPS\\ARVILLAG.MAP'))).toBe('rpu-fixes-map');
      expect(dec(await v.open('data/proto/items/00000001.pro'))).toBe('rpu-base-pro');
      expect(dec(await v.open('data/art/critters/hmwarr.frm'))).toBe('rpu-frm');
      expect(dec(await v.open('data/text/english/game/pro_item.msg'))).toBe('rpu-loose-msg');
    } finally {
      await m.close();
    }
  });

  const gameDir = process.env['F2_GAME_DIR'];
  it.skipIf(!gameDir)(
    'test_rpu_overlay_on_real_game_base',
    async () => {
      const base = await openGameFolderNode(gameDir as string, process.env['F2_PATCH_DIR']);
      const m = await openModLayersNode(await rpuGame());
      try {
        const vfs = withModLayers(base, m);
        // mod nadpisuje plik bazowy, a reszta bazy pozostaje widoczna
        expect(dec(await vfs.open('text/english/game/pro_item.msg'))).toBe('rpu-loose-msg');
        expect(
          (await new VirtualFs(base.layers).open('text/english/game/pro_item.msg')).length,
        ).toBeGreaterThan(1000);
        expect((await vfs.open('text/english/game/perk.msg')).length).toBeGreaterThan(1000);
      } finally {
        await m.close();
        await base.close();
      }
    },
    60_000,
  );
});
