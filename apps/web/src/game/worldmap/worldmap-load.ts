import type { MapEntry } from '../../screens/map/maps-txt';
import { buildWorldmapData, type WorldmapData } from './worldmap-data';

/** Laduje worldmap.txt i city.txt z gry (przez wstrzykniete `read`) i sklada dane mapy swiata. */
export async function loadWorldmapData(
  read: (path: string) => Promise<string>,
  maps: MapEntry[],
): Promise<WorldmapData> {
  const [wm, city] = await Promise.all([read('data/worldmap.txt'), read('data/city.txt')]);
  return buildWorldmapData(wm, city, maps);
}
