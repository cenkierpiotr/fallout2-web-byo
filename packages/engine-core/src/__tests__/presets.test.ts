import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openGameFolderNode, type NodeVfs } from '@f2/vfs/node';
import { loadPresets, type Preset } from '../presets.js';

const dir = process.env.F2_GAME_DIR;
const patchDir = process.env.F2_PATCH_DIR;

describe.skipIf(!dir)('loadPresets na prawdziwych plikach', () => {
  let vfs: NodeVfs;
  let presets: Preset[];
  beforeAll(async () => {
    vfs = await openGameFolderNode(dir!, patchDir);
    presets = await loadPresets(vfs);
  }, 120_000);
  afterAll(async () => {
    await vfs?.close();
  });

  it('3 presety z imionami, fid i biografia', () => {
    expect(presets.map((p) => [p.id, p.gcd.name, p.fid])).toEqual([
      ['combat', 'Narg', 201],
      ['stealth', 'Mingan', 202],
      ['diplomat', 'Chitsa', 203],
    ]);
    for (const p of presets) expect(p.bio.length).toBeGreaterThan(100);
    expect(presets[0]!.bio).toContain('NARG');
  });
  it('pula SPECIAL premade = 0 (suma 40)', () => {
    for (const p of presets) {
      expect(p.gcd.baseStats.reduce((a, b) => a + b, 0)).toBe(40);
      expect(p.gcd.unspentSpecialPoints).toBe(0);
    }
  });
});
