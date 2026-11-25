import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseMapsTxt } from './maps-txt.js';

const FIX = `[Map 000]
lookup_name=Desert Encounter 1
map_name=desert1
music=07desert
ambient_sfx=gustwind:20, rattle:15
saved=No  ; x
dead_bodies_age=No
can_rest_here=No,Yes,No
random_start_point_0=elev:0, tile_num:19086
random_start_point_1=elev:1, tile_num:17302

[Map 001]
lookup_name=Arroyo Caves
map_name=arcaves
ambient_sfx=water:40, animal:15 animal:10
pipboy_active=No
saved=Yes
state=On
`;

describe('parseMapsTxt', () => {
  it('fixture', () => {
    const m = parseMapsTxt(FIX);
    expect(m[0]).toEqual({
      index: 0,
      lookupName: 'Desert Encounter 1',
      mapName: 'desert1',
      music: '07desert',
      ambientSfx: [
        { name: 'gustwind', weight: 20 },
        { name: 'rattle', weight: 15 },
      ],
      saved: false,
      deadBodiesAge: false,
      canRestHere: [false, true, false],
      randomStartPoints: [
        { elevation: 0, tileNum: 19086 },
        { elevation: 1, tileNum: 17302 },
      ],
      pipboyActive: true,
    });
    expect(m[1]?.pipboyActive).toBe(false);
    expect(m[1]?.state).toBe('On');
    expect(m[1]?.music).toBeUndefined();
    expect(m[1]?.ambientSfx).toEqual([
      { name: 'water', weight: 40 },
      { name: 'animal', weight: 15 },
      { name: 'animal', weight: 10 },
    ]);
  });
  const dir = process.env.F2_PATCH_DIR;
  it.skipIf(!dir)('golden MAPS.TXT', () => {
    const m = parseMapsTxt(readFileSync(join(dir!, 'DATA/Data/MAPS.TXT'), 'latin1'));
    expect(m).toHaveLength(151);
    expect(m.map((x) => x.index)).toEqual(m.map((_, i) => i));
    expect(m.filter((x) => !x.pipboyActive)).toHaveLength(1);
    expect(m.filter((x) => x.ambientSfx.length > 0)).toHaveLength(137);
    expect(m.reduce((n, x) => n + x.randomStartPoints.length, 0)).toBe(168);
  });
});
