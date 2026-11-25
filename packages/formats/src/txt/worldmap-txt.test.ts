import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findEncounter, parseWorldmapTxt } from './worldmap-txt.js';

const FIX = `[Data]
Forced=100%
Frequent=65%
Common=55%
Uncommon=50%
Rare=45%
None=0%
terrain_types=Desert:1, Mountain:2, City:1, Ocean:1

[Random Maps: Desert]
map_00=Desert Encounter 1
map_01=Desert Encounter 2

[Encounter: Rat]  ; x
type_00=Ratio:60%, pid:16777251, Item:(1-3)41{Wielded}, Script:433, Distance:5, If (Player(Level) > 4)
type_01=Dead, pid:5, Item:7 Item:(2-4)9
type_02=pid:271, Distance:10, If (Rand(5%))
position=huddle, Spacing:2, distance:4
team_num=45

[Encounter: Plain]
type_00=pid:1
position=Surrounding, Spacing:5, Distance:Player(Perception)

[Encounter Table 0]
lookup_name=DstN
maps=Desert Encounter 1, Desert Encounter 2
enc_00=Chance:35%,Enc:(2-4) Rat AMBUSH Player,Scenery:Normal
enc_01=Chance:10%,Enc:(3-8) Rat AND (5-7) Plain AMBUSH Player, If(Player(Level) > 4) And If(Global(3) < 1)
enc_02=Chance:20%,Enc:(1-2) Rat FIGHTING (6-10) Plain
enc_03=Chance:1%,Counter:1,Special,Map:Special Bridge Encounter,Enc:Special1, If(Global(605) < 1)

[Tile Data]
num_horizontal_tiles=4

[Tile 0]
art_idx=339
encounter_difficulty=0
walk_mask_name=wrldmp00
0_0=Desert,No_Fill,Rare,Uncommon,Common,Arro_M
6_5=Ocean,Fill_W,None,None,None,Fish_O
`;

describe('parseWorldmapTxt', () => {
  const w = parseWorldmapTxt(FIX);
  it('data i losowe mapy', () => {
    expect(w.data.frequencies.Forced).toBe(100);
    expect(w.data.frequencies.None).toBe(0);
    expect(w.data.terrainTypes.Mountain).toBe(2);
    expect(w.randomMaps.Desert).toEqual(['Desert Encounter 1', 'Desert Encounter 2']);
    expect(w.randomMaps.Ocean).toEqual([]);
  });
  it('encounter', () => {
    const e = w.encounters.get('Rat')!;
    expect(e.name).toBe('Rat');
    expect(e.types[0]).toMatchObject({
      ratio: 60,
      pid: 16777251,
      script: 433,
      distance: 5,
      dead: false,
      items: [{ pid: 41, min: 1, max: 3, wielded: true }],
    });
    expect(e.types[0]?.condition).toBeDefined();
    expect(e.types[1]).toMatchObject({
      dead: true,
      items: [
        { pid: 7, min: 1, max: 1, wielded: false },
        { pid: 9, min: 2, max: 4, wielded: false },
      ],
    });
    expect(e.types[2]?.condition).toEqual({ kind: 'rand', pct: 5 });
    expect(e.teamNum).toBe(45);
    expect(e.position).toEqual({ kind: 'huddle', spacing: 2, distance: 4 });
    expect(w.encounters.get('Plain')?.position.distance).toEqual({
      kind: 'player',
      stat: 'Perception',
    });
  });
  it('tabela', () => {
    const t = w.tables[0]!;
    expect(t.index).toBe(0);
    expect(t.lookupName).toBe('DstN');
    expect(t.maps).toEqual(['Desert Encounter 1', 'Desert Encounter 2']);
    expect(t.entries[0]).toMatchObject({
      chance: 35,
      encounters: [{ name: 'Rat', min: 2, max: 4 }],
      relation: 'AMBUSH',
      scenery: 'Normal',
      special: false,
    });
    expect(t.entries[1]?.encounters).toHaveLength(2);
    expect(t.entries[1]?.relation).toBe('AND');
    expect(t.entries[1]?.condition).toMatchObject({ op: 'and' });
    expect(t.entries[2]?.relation).toBe('FIGHTING');
    expect(t.entries[3]).toMatchObject({
      special: true,
      chance: 1,
      counter: 1,
      map: 'Special Bridge Encounter',
      specialName: 'Special1',
    });
  });
  it('kafel', () => {
    const t = w.tiles[0]!;
    expect(t).toMatchObject({
      index: 0,
      artIdx: 339,
      encounterDifficulty: 0,
      walkMaskName: 'wrldmp00',
    });
    expect(t.cells).toHaveLength(6);
    expect(t.cells[0]).toHaveLength(7);
    expect(t.cells[0]?.[0]).toEqual({
      terrain: 'Desert',
      fill: 'No_Fill',
      morning: 'Rare',
      afternoon: 'Uncommon',
      night: 'Common',
      encTable: 'Arro_M',
    });
    expect(t.cells[5]?.[6]?.terrain).toBe('Ocean');
  });
  const dir = process.env.F2_PATCH_DIR;
  it.skipIf(!dir)('golden WORLDMAP.TXT', () => {
    const g = parseWorldmapTxt(readFileSync(join(dir!, 'DATA/Data/WORLDMAP.TXT'), 'latin1'));
    expect(g.tiles).toHaveLength(20);
    expect(g.tables).toHaveLength(76);
    expect(g.data.frequencies.Forced).toBe(100);
    expect(g.data.terrainTypes.Mountain).toBe(2);
    expect(g.encounters.size).toBeGreaterThanOrEqual(100);
    for (const t of g.tiles) {
      expect(t.cells).toHaveLength(6);
      for (const row of t.cells) for (const c of row) expect(c).toBeDefined();
    }
    expect(g.tables.reduce((n, t) => n + t.entries.length, 0)).toBe(1694); // 1695 linii enc_N, ale enc_11 w Encounter Table 68 jest zduplikowany (ostatni wygrywa, jak w INI)
    for (const t of g.tables)
      for (const e of t.entries)
        for (const x of e.encounters) expect(findEncounter(g, x.name)).toBeDefined();
  });
});
