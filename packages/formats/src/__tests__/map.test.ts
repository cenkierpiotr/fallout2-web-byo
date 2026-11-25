import { describe, expect, it } from 'vitest';
import { FormatError } from '../errors.js';
import { hasElevation, parseMap } from '../map.js';
import { buildSubtypeOf } from '../../test/golden/map-subtype.js';
import { openGameFolderNode } from '../../../vfs/src/node.js';
import type { NodeVfs } from '../../../vfs/src/node.js';

const dir = process.env.F2_GAME_DIR;
const patchDir = process.env.F2_PATCH_DIR;

function toBuf(u: Uint8Array): ArrayBuffer {
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
}

async function loadMap(vfs: NodeVfs, name: string) {
  const bytes = await vfs.open(`maps/${name}`);
  const buf = toBuf(bytes);
  return { buf, parsed: parseMap(buf, await buildSubtypeOf(vfs)) };
}

describe('hasElevation', () => {
  it('test_hasElevation_flags12', () => {
    expect(hasElevation(12, 0)).toBe(true);
    expect(hasElevation(12, 1)).toBe(false);
    expect(hasElevation(12, 2)).toBe(false);
    expect(hasElevation(0, 2)).toBe(true);
    expect(hasElevation(2, 0)).toBe(false);
    expect(hasElevation(8, 1)).toBe(true);
  });
});

describe.skipIf(!dir || !patchDir)('parseMap na prawdziwych mapach', () => {
  it('test_parseMap_artemple_header + consumes_whole_file', async () => {
    const vfs = await openGameFolderNode(dir!, patchDir);
    try {
      const { buf, parsed } = await loadMap(vfs, 'artemple.map');
      expect(parsed.header.version).toBe(20);
      expect(parsed.header.name).toBe('ARTEMPLE.MAP');
      expect(parsed.header.playerHex).toBe(18492);
      expect(parsed.header.scriptId).toBe(745);
      expect(parsed.header.flags).toBe(12);
      expect(parsed.header.mapId).toBe(126);
      expect(parsed.tiles[0]).not.toBeNull();
      expect(parsed.tiles[1]).toBeNull();
      expect(parsed.endOffset).toBe(buf.byteLength);
    } finally {
      await vfs.close();
    }
  }, 60_000);

  it('test_parseMap_arvillag_vars + inventory_nested + truncated', async () => {
    const vfs = await openGameFolderNode(dir!, patchDir);
    try {
      const { buf, parsed } = await loadMap(vfs, 'arvillag.map');
      expect(parsed.globalVars.length).toBe(5);
      expect(parsed.localVars.length).toBe(1);
      expect(parsed.endOffset).toBe(buf.byteLength);
      const crit = parsed.objects.flat().find((o) => o.pid >>> 24 === 1 && o.inventory.length > 0);
      expect(crit).toBeDefined();
      expect(crit!.inventory[0]!.quantity).toBeGreaterThan(0);
      const subtypeOf = await buildSubtypeOf(vfs);
      expect(() => parseMap(buf.slice(0, buf.byteLength - 100), subtypeOf)).toThrow(FormatError);
    } finally {
      await vfs.close();
    }
  }, 60_000);
});
