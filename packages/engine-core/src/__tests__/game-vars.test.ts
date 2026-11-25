import { describe, expect, it } from 'vitest';
import { openGameFolderNode } from '@f2/vfs/node';
import { GameVars, parseGam } from '../game-vars.js';

const enc = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0));

describe('parseGam', () => {
  it('parsuje sekcje GAME_GLOBAL_VARS i pomija komentarze', () => {
    const v = parseGam(
      enc(
        '// x\nMAP_GLOBAL_VARS:\nA := 9; \nGAME_GLOBAL_VARS:\nGVAR_A := 5; // (0)\n// B := 3;\nGVAR_B:=-2;\n',
      ),
    );
    expect(Array.from(v)).toEqual([5, -2]);
  });
});

describe('GameVars', () => {
  it('get/set/changed i poza zakresem', () => {
    const g = new GameVars(Int32Array.from([1, 2]));
    expect(g.get(1)).toBe(2);
    expect(g.get(10)).toBe(0);
    const c0 = g.changed.value;
    g.set(1, 7);
    g.set(4, 3);
    expect(g.get(1)).toBe(7);
    expect(g.get(4)).toBe(3);
    expect(g.changed.value).toBe(c0 + 2);
  });
});

const dir = process.env.F2_GAME_DIR;
describe.skipIf(!dir)('VAULT13.GAM', () => {
  it('test_parseGam_vault13_count', async () => {
    const vfs = await openGameFolderNode(dir!, process.env.F2_PATCH_DIR);
    try {
      const gv = await GameVars.load(vfs);
      expect(gv.size).toBeGreaterThan(600);
      // niezalezne zliczenie: kazda linia `GVAR_x := n;` poza komentarzami
      const { openGameFile } = await import('../proto-cache.js');
      const bytes = await openGameFile(vfs, 'data/vault13.gam');
      let t = '';
      for (const b of bytes) t += String.fromCharCode(b);
      const n = t.split(/\r\n|\r|\n/).filter((l) => /^\s*GVAR_\w+\s*:=/.test(l)).length;
      expect(gv.size).toBe(n);
    } finally {
      await vfs.close();
    }
  });
});
