import type { AreaDef, TileDef, WorldmapConfig } from '@f2/formats';
import type { WorldmapData } from './worldmap-data';

const cell = (terrain: string, enc = 'T') => ({
  terrain,
  fill: 'No_Fill' as const,
  morning: 'None',
  afternoon: 'None',
  night: 'None',
  encTable: enc,
});
const tile = (index: number, terrain: string): TileDef => ({
  index,
  artIdx: 339 + index,
  encounterDifficulty: 0,
  cells: Array.from({ length: 6 }, () => Array.from({ length: 7 }, () => cell(terrain))),
});
const area = (i: number, name: string, x: number, y: number, on: 'On' | 'Off'): AreaDef => ({
  index: i,
  name,
  worldPos: { x, y },
  startState: on,
  size: 'Small',
  townmapArtIdx: -1,
  townmapLabelArtIdx: -1,
  entrances: [
    {
      state: 'On',
      x: 0,
      y: 0,
      mapLookupName: `${name} Main`,
      elevation: 0,
      tileNum: 100,
      orientation: 0,
    },
    {
      state: 'Off',
      x: 0,
      y: 0,
      mapLookupName: `${name} Cave`,
      elevation: 0,
      tileNum: 200,
      orientation: 0,
    },
  ],
});
const cfg = {
  data: {
    frequencies: { Forced: 100, Frequent: 65, Common: 55, Uncommon: 50, Rare: 45, None: 0 },
    terrainTypes: { Desert: 1, Mountain: 2 },
  },
  randomMaps: { Desert: [], Mountain: [], City: [], Ocean: [] },
  encounters: new Map(),
  tables: [],
  tiles: Array.from({ length: 20 }, (_, i) => tile(i, i === 1 ? 'Mountain' : 'Desert')),
} as unknown as WorldmapConfig;
export const wmData: WorldmapData = {
  cfg,
  areas: [
    area(0, 'Arroyo', 100, 100, 'On'),
    area(1, 'Klamath', 200, 100, 'On'),
    area(2, 'Den', 300, 100, 'Off'),
  ],
  maps: [
    { index: 0, name: 'ARMAIN', lookup: 'Arroyo Main' },
    { index: 1, name: 'KLMAIN', lookup: 'Klamath Main' },
  ],
};
