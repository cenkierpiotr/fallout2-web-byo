import { describe, expect, it } from 'vitest';
import { MemoryLayer, VirtualFs } from '@f2/vfs';
import { MessageSource } from '../message-source.js';
import { openGameFolderNode } from '../../../vfs/src/node.js';

const dir = process.env.F2_GAME_DIR;
const patchDir = process.env.F2_PATCH_DIR;
const enc = (s: string) => new TextEncoder().encode(s);

function makeVfs(files: Record<string, string>): VirtualFs {
  return new VirtualFs([
    new MemoryLayer('test', new Map(Object.entries(files).map(([k, v]) => [k, enc(v)]))),
  ]);
}

describe('MessageSource (syntetyczne)', () => {
  const base = {
    'scripts/scripts.lst': 'zero.int ; x\nfoo.int ; y # local_vars=1\n',
    'text/english/dialog/foo.msg': '{1}{}{base1}\n{2}{}{base2}\n',
    'text/english/game/map.msg': '{10}{}{mapa}\n',
  };
  it('test_messageSource_dialog_resolves_by_scripts_lst', async () => {
    const ms = new MessageSource(makeVfs(base), { language: 'english' });
    expect(await ms.get(1, 2)).toBe('base2');
    expect(await ms.get(1, 99)).toBeUndefined();
    expect(await ms.get(0, 1)).toBeUndefined();
    expect(await ms.get(77, 1)).toBeUndefined();
    expect((await ms.game('MAP')).get(10)?.text).toBe('mapa');
  });
  it('test_messageSource_overlayLanguage_falls_back_to_base', async () => {
    const vfs = makeVfs({
      ...base,
      'text/polish/dialog/foo.msg': '{1}{}{pl1}\n',
    });
    const ms = new MessageSource(vfs, { language: 'english', overlayLanguage: 'polish' });
    expect(await ms.get(1, 1)).toBe('pl1');
    expect(await ms.get(1, 2)).toBe('base2');
    expect((await ms.game('MAP')).get(10)?.text).toBe('mapa');
  });
});

describe.skipIf(!dir || !patchDir)('MessageSource na prawdziwych danych', () => {
  it('test_messageSource_dialog_resolves_by_scripts_lst (acklint)', async () => {
    const vfs = await openGameFolderNode(dir!, patchDir);
    try {
      const ms = new MessageSource(vfs, { language: 'english' });
      expect(await ms.get(750, 100)).toBe('You see Klint, a fellow tribesman.');
      expect((await ms.game('proto')).size).toBeGreaterThan(0);
    } finally {
      await vfs.close();
    }
  }, 60_000);
});
