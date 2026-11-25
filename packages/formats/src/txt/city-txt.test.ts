import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCityTxt } from './city-txt.js';

const FIX = `[Area 00]   ; Arroyo
area_name=Arroyo
world_pos=184,133   ; x
start_state=On
size=Medium
townmap_art_idx=156
townmap_label_art_idx=370
entrance_0=On,350,275,Arroyo Bridge,-1,-1,3  ; Etc.
;entrance_2=Off,-1,-1,Arroyo Caves,-1,-1,0
entrance_1=Off,-1,-1,Arroyo Caves,-1,-1,0

[Area 01]
area_name=Den
world_pos=1,2
start_state=Off
lock_state=On
size=Large
townmap_art_idx=-1
townmap_label_art_idx=-1
`;

describe('parseCityTxt', () => {
  it('fixture', () => {
    const a = parseCityTxt(FIX);
    expect(a).toHaveLength(2);
    expect(a[0]).toEqual({
      index: 0,
      name: 'Arroyo',
      worldPos: { x: 184, y: 133 },
      startState: 'On',
      size: 'Medium',
      townmapArtIdx: 156,
      townmapLabelArtIdx: 370,
      entrances: [
        {
          state: 'On',
          x: 350,
          y: 275,
          mapLookupName: 'Arroyo Bridge',
          elevation: -1,
          tileNum: -1,
          orientation: 3,
        },
        {
          state: 'Off',
          x: -1,
          y: -1,
          mapLookupName: 'Arroyo Caves',
          elevation: -1,
          tileNum: -1,
          orientation: 0,
        },
      ],
    });
    expect(a[1]?.lockState).toBe('On');
    expect(a[0]?.lockState).toBeUndefined();
  });
  it('zle dane rzucaja FormatError', () => {
    expect(() =>
      parseCityTxt(
        '[Area 00]\narea_name=X\nworld_pos=1,2\nstart_state=On\nsize=Small\ntownmap_art_idx=1\ntownmap_label_art_idx=1\nentrance_0=On,1,2\n',
      ),
    ).toThrow(/entrance_0/);
  });
  it('8 pol w entrance: nadmiar ignorowany', () => {
    const a = parseCityTxt(
      '[Area 00]\narea_name=X\nworld_pos=1,2\nstart_state=On\nsize=Small\ntownmap_art_idx=1\ntownmap_label_art_idx=1\nentrance_0=On,345,230,Golgatha,0,-1,-1,0\n',
    );
    expect(a[0]?.entrances[0]).toMatchObject({
      mapLookupName: 'Golgatha',
      elevation: 0,
      tileNum: -1,
      orientation: -1,
    });
  });
  const dir = process.env.F2_PATCH_DIR;
  it.skipIf(!dir)('golden CITY.TXT', () => {
    const a = parseCityTxt(readFileSync(join(dir!, 'DATA/Data/CITY.TXT'), 'latin1'));
    expect(a).toHaveLength(49);
    expect(a.map((x) => x.index)).toEqual(a.map((_, i) => i));
    expect(a[47]?.name).toContain('Shadow Worlds');
    expect(a.filter((x) => x.lockState !== undefined)).toHaveLength(22);
    expect(a.reduce((n, x) => n + x.entrances.length, 0)).toBe(159);
  });
});
