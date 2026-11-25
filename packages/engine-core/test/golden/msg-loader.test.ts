import { describe, expect, it } from 'vitest';
import { LangPackLayer } from '../../../vfs/src/lang-layer.js';
import { openGameFolderNode } from '../../../vfs/src/node.js';
import { MsgLoader } from '../../src/index.js';

const dir = process.env.F2_GAME_DIR;
const patchDir = process.env.F2_PATCH_DIR;

describe.skipIf(!dir)('MsgLoader golden (prawdziwe dane gry)', () => {
  it('stat.msg EN z MASTER.DAT, PL pakiet uzupelnia per wpis, reszta z fallbackiem', async () => {
    const vfs = await openGameFolderNode(dir!, patchDir);
    try {
      const pack = new LangPackLayer({
        list: () => ['game/stat.msg'],
        read: async () => new TextEncoder().encode('{100}{}{Siła}'),
      });
      const withPack = Object.assign(Object.create(Object.getPrototypeOf(vfs)), vfs, {
        layers: [...vfs.layers, pack],
      }) as typeof vfs;
      const loader = new MsgLoader(withPack, { language: 'polish', fallback: 'english' });
      const en = await new MsgLoader(vfs, { language: 'english', fallback: 'english' }).load(
        'game/stat',
      );
      expect(en.size).toBeGreaterThan(50);
      expect(en.get(100)?.text).toBeTruthy();
      const pl = await loader.load('game/stat');
      expect(pl.get(100)?.text).toBe('Siła');
      expect(pl.size).toBe(en.size);
      expect(pl.fallbacks).toBe(en.size - 1);
      expect(pl.get(101)?.text).toBe(en.get(101)?.text);
    } finally {
      await vfs.close();
    }
  }, 60_000);

  it.skipIf(!patchDir)(
    'plik MSG z patcha unofficial (overlay) jest ladowany zamiast wersji z DAT',
    async () => {
      const vfs = await openGameFolderNode(dir!, patchDir);
      try {
        const overlayMsg = vfs
          .list('text/english/')
          .find((k) => k.endsWith('.msg') && vfs.resolve(k)?.name === 'overlay');
        expect(overlayMsg).toBeDefined();
        const name = overlayMsg!.slice('text/english/'.length);
        const t = await new MsgLoader(vfs, { language: 'english', fallback: 'english' }).load(name);
        expect(t.size).toBeGreaterThan(0);
      } finally {
        await vfs.close();
      }
    },
    60_000,
  );
});
