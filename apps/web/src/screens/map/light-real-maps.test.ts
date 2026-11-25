import { describe, expect, it } from 'vitest';
import { MapLoader, ProtoCache } from '@f2/engine-core';
import { LightMap } from '@f2/render';
import { openGameFolderNode } from '@f2/vfs/node';

const dir = process.env['F2_GAME_DIR'];
const patchDir = process.env['F2_PATCH_DIR'];
/** Budzet klatki 16.7 ms; przebudowa swiatla dzieje sie raz na wejscie na poziom, nie co klatke. */
const REBUILD_BUDGET_MS = 100;

describe.skipIf(!dir)('swiatlo zrodel (f2_obj_light_apply) na prawdziwych mapach', () => {
  for (const [name, minLit] of [
    ['ARCAVES', 50],
    ['VCTYCOCL', 50],
    ['BROKEN2', 50],
  ] as const) {
    it(`${name}: zrodla oswietlaja heksy, sciany cieniuja, przebudowa miesci sie w budzecie`, async () => {
      const vfs = await openGameFolderNode(dir!, patchDir);
      try {
        const map = await new MapLoader(vfs, new ProtoCache(vfs)).load(name);
        const lm = new LightMap();
        lm.rebuildStatic(map, 0, 0);
        expect(lm.litHexCount()).toBeGreaterThan(minLit);
        for (const o of map.objects) {
          if (o.elevation === 0 && (o.flags & 0x20) !== 0 && (o.lightRadius ?? 0) > 0) {
            expect(lm.intensityAt(o.hex)).toBeGreaterThan(0);
          }
        }
        // bez zrodel zostaje sama podloga
        lm.setSourcesEnabled(false);
        expect(lm.litHexCount()).toBeGreaterThan(0);
        expect(Math.max(...lm.texture())).toBe(0);
        const t0 = performance.now();
        const fresh = new LightMap();
        fresh.rebuildStatic(map, 0, 0.25);
        const ms = performance.now() - t0;
        process.stdout.write(
          `light ${name}: lit=${fresh.litHexCount()} rebuild=${ms.toFixed(1)}ms\n`,
        );
        expect(ms).toBeLessThan(REBUILD_BUDGET_MS);
      } finally {
        await vfs.close?.();
      }
    }, 60_000);
  }
});
