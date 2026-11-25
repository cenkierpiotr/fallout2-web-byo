import { describe, expect, it } from 'vitest';
import { lstName, parseLst } from '../../src/lst/index.js';
import { parseProto } from '../../src/pro/index.js';
import { openGameFolderNode } from '../../../vfs/src/node.js';

const dir = process.env.F2_GAME_DIR;
const patchDir = process.env.F2_PATCH_DIR;

/**
 * R8-U3 (W): pierwsze slowo danych drzwi trafia do proto+0x24 (0x4a0fa0 -> 0x4a0ed0), a bit 4
 * tego bajtu decyduje, czy gracz sam wchodzi w drzwi (0x48b2a8). We wszystkich drzwiach = 0.
 * R8-U2 (W): pid 0x20003d9..0x20003dc to scenery ogolne (podtyp 5), nie drzwi.
 */
describe.skipIf(!dir || !patchDir)('PRO scenery: drzwi i pid z kara sciezki', () => {
  it(
    'wszystkie drzwi maja bit 4 pierwszego slowa danych rowny 0',
    { timeout: 120_000 },
    async () => {
      const vfs = await openGameFolderNode(dir!, patchDir);
      try {
        const lst = parseLst(await vfs.open('proto/scenery/scenery.lst'));
        let doors = 0;
        let penalty = 0;
        for (let i = 0; i < lst.length; i++) {
          const p = parseProto(await vfs.open(`proto/scenery/${lstName(lst[i]!)}`));
          if (p.kind !== 'scenery') continue;
          const idx = i + 1;
          if (p.subtype === 0) {
            doors++;
            expect(p.data[0]! & 4, `drzwi ${idx}`).toBe(0);
          }
          if (idx >= 0x3d9 && idx <= 0x3dc) {
            penalty++;
            expect(p.subtype).toBe(5);
          }
        }
        expect(doors).toBeGreaterThan(90);
        expect(penalty).toBe(4);
      } finally {
        await vfs.close?.();
      }
    },
  );
});
