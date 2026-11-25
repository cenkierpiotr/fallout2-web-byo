import { describe, expect, it } from 'vitest';
import { parseEnddeathTable, parseHolodiskTable } from '../../../packages/formats/src/index.js';
import { GvarRegistry, parseGamText as parseGam } from '../../../packages/engine-core/src/index.js';
import { openGame, openGameFile } from '../../map-dump/src/lib.js';
import { dec, missingGvars, renderDump } from './dump.js';

describe('gvar-dump (jednostkowy)', () => {
  it('renderDump daje tabele id/nazwa/wartosc', () => {
    expect(renderDump('GAME_GLOBAL_VARS:\nA:=1;\nB:=2;')).toContain('| 1 | B | 2 |');
  });
  it('missingGvars wykrywa gvar poza rejestrem', () => {
    const reg = GvarRegistry.fromGam(parseGam('A:=0;'));
    expect(
      missingGvars(reg, { endgame: '5, 1, 2, n', enddeath: '', quests: '', holodisk: '' }),
    ).toEqual([5]);
  });
});

describe.skipIf(!process.env['F2_GAME_DIR'] || !process.env['F2_PATCH_DIR'])(
  'golden VFS: tabele z MASTER.DAT i nakladki',
  () => {
    it('enddeath 18 wierszy, holodisk, wszystkie gvary istnieja w GAM', async () => {
      const vfs = await openGame();
      try {
        const get = async (p: string) => dec(await openGameFile(vfs, p));
        const tables = {
          endgame: await get('data/endgame.txt'),
          enddeath: await get('data/enddeath.txt'),
          quests: await get('data/quests.txt'),
          holodisk: await get('data/holodisk.txt'),
        };
        const death = parseEnddeathTable(tables.enddeath);
        expect(death.warnings).toEqual([]);
        expect(death.items.length).toBe(18);
        expect(death.items[12]).toMatchObject({ gvar: 491, value: 1, minLevel: 150, chance: 0 });
        const holo = parseHolodiskTable(tables.holodisk);
        expect(holo.warnings).toEqual([]);
        expect(holo.items.length).toBeGreaterThan(0);
        const reg = GvarRegistry.fromGam(parseGam(await get('data/vault13.gam')));
        expect(reg.size).toBe(708);
        expect(missingGvars(reg, tables)).toEqual([]);
      } finally {
        await vfs.close();
      }
    });
  },
);
