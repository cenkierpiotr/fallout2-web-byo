import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openGameFolderNode } from '@f2/vfs/node';
import type { NodeVfs } from '@f2/vfs/node';
import { Skill } from '@f2/rules';
import { parseMapsTxt } from '@f2/formats';
import { MapLoader, ProtoCache, openGameFile, type GameMap, type GameObject } from '../index.js';
import { DOOR_LOCKED_BIT, isDoor } from '../doors.js';
import { skillsUsableOn } from '../skill-actions.js';

const dir = process.env.F2_GAME_DIR;
const patchDir = process.env.F2_PATCH_DIR;

/** Golden na prawdziwych mapach: zamki drzwi/pojemnikow z .map daja Lockpick, skille krytera i przedmiotu. */
describe.skipIf(!dir)('skille na obiektach: prawdziwe mapy', () => {
  let vfs: NodeVfs;
  const maps: GameMap[] = [];
  beforeAll(async () => {
    vfs = await openGameFolderNode(dir!, patchDir);
    const loader = new MapLoader(vfs, new ProtoCache(vfs));
    const defs = parseMapsTxt(
      new TextDecoder('latin1').decode(await openGameFile(vfs, 'data/maps.txt')),
    );
    for (const d of defs.slice(0, 60)) {
      try {
        const m = await loader.load(d.mapName);
        maps.push(m);
        if (maps.length >= 12) break;
      } catch {
        // mapa moze nie istniec w danej wersji danych
      }
    }
  }, 120_000);
  afterAll(() => vfs?.close?.());

  it('mapy sie wczytaly', () => {
    expect(maps.length).toBeGreaterThan(0);
  });

  it('drzwi z prawdziwych map: Lockpick dopiero po zamknieciu na klucz (bit 0x2 jak obj_lock)', () => {
    const user = {
      type: 1,
      id: -1,
      inventory: [],
      raw: [],
      hidden: false,
    } as unknown as GameObject;
    let doors = 0;
    for (const m of maps) {
      for (const o of m.objects) {
        if (!isDoor(o)) continue;
        doors++;
        // Z: statyczne dane MAP nie niosa zamkow (0 z 1116 drzwi w 146 mapach), zamyka je skrypt przez obj_lock
        expect(skillsUsableOn(o, user)).not.toContain(Skill.Lockpick);
        if (doors <= 3 && o.extra.kind === 'door') {
          const bit = o.extra.raw[0] ?? 0;
          o.extra.raw[0] = bit | DOOR_LOCKED_BIT;
          expect(skillsUsableOn(o, user)).toContain(Skill.Lockpick);
          expect(skillsUsableOn(o, user)).toContain(Skill.Traps);
          o.extra.raw[0] = bit;
        }
      }
    }
    expect(doors).toBeGreaterThan(0);
  });

  it('krytery: pierwsza pomoc i leczenie, kradziez tylko cudza', () => {
    const user = {
      type: 1,
      id: -1,
      inventory: [],
      raw: [],
      hidden: false,
    } as unknown as GameObject;
    const m = maps[0]!;
    const c = m.objects.find((o) => o.type === 1 && !o.hidden);
    if (!c) return;
    const list = skillsUsableOn(c, user);
    expect(list).toContain(Skill.FirstAid);
    expect(list).toContain(Skill.Doctor);
    expect(list).toContain(Skill.Steal);
  });
});
