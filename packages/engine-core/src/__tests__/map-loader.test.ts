import { MemoryLayer, VirtualFs } from '@f2/vfs';
import { openGameFolderNode } from '@f2/vfs/node';
import type { NodeVfs } from '@f2/vfs/node';
import { parseMap, pidType } from '@f2/formats';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type GameMap,
  type GameObject,
  MapLoader,
  ProtoCache,
  hexNeighbors,
  isHexBlocked,
  moveObject,
  objectsAt,
  indexObject,
  openGameFile,
} from '../index.js';

const dir = process.env.F2_GAME_DIR;
const patchDir = process.env.F2_PATCH_DIR;

function emptyMap(): GameMap {
  return {
    name: 'T',
    header: {} as GameMap['header'],
    tiles: [],
    objects: [],
    byHex: new Map(),
    globalVars: new Int32Array(0),
    localVars: new Int32Array(0),
    scripts: [],
    exitGrids: [],
  };
}

function fake(type: number, hex: number, flags = 0, elevation: 0 | 1 | 2 = 0): GameObject {
  return {
    id: 1,
    pid: type << 24,
    fid: 0,
    type,
    hex,
    elevation,
    rotation: 0,
    frame: 0,
    flags,
    protoFlags: 0,
    scriptId: -1,
    localVars: new Int32Array(0),
    inventory: [],
    proto: undefined as never,
    extra: { kind: 'misc', flags: 0 },
    hidden: (flags & 1) !== 0,
  };
}

function put(map: GameMap, o: GameObject): GameObject {
  map.objects.push(o);
  indexObject(map, o);
  return o;
}

describe('hex blocking i moveObject (syntetyczne)', () => {
  it('test_isHexBlocked_wall_blocks_noBlock_doesnt', () => {
    const m = emptyMap();
    const wall = put(m, fake(3, 100));
    put(m, fake(3, 101, 0x10));
    put(m, fake(0, 102));
    put(m, fake(2, 103, 0x1));
    expect(isHexBlocked(m, 0, 100)).toBe(true);
    expect(isHexBlocked(m, 0, 100, wall)).toBe(false);
    expect(isHexBlocked(m, 1, 100)).toBe(false);
    expect(isHexBlocked(m, 0, 101)).toBe(false);
    expect(isHexBlocked(m, 0, 102)).toBe(false);
    expect(isHexBlocked(m, 0, 103)).toBe(false);
    expect(isHexBlocked(m, 0, 104)).toBe(false);
  });

  it('multi-hex blokuje sasiednie heksy', () => {
    const m = emptyMap();
    put(m, fake(1, 5000, 0x800));
    for (const n of hexNeighbors(5000)) expect(isHexBlocked(m, 0, n)).toBe(true);
    expect(isHexBlocked(m, 0, 5000 + 400)).toBe(false);
  });

  it('test_moveObject_updates_byHex', () => {
    const m = emptyMap();
    const o = put(m, fake(1, 100));
    moveObject(m, o, 250);
    expect(o.hex).toBe(250);
    expect(objectsAt(m, 0, 100)).toEqual([]);
    expect(m.byHex.has(100)).toBe(false);
    expect(objectsAt(m, 0, 250)).toEqual([o]);
    moveObject(m, o, 7, 2);
    expect(o.elevation).toBe(2);
    expect(m.byHex.get(2 * 100000 + 7)).toEqual([o]);
    expect(objectsAt(m, 0, 250)).toEqual([]);
  });
});

describe.skipIf(!dir || !patchDir)('MapLoader na prawdziwej mapie artemple', () => {
  let vfs: NodeVfs;
  let protos: ProtoCache;
  let map: GameMap;
  let loader: MapLoader;

  beforeAll(async () => {
    vfs = await openGameFolderNode(dir!, patchDir);
    protos = new ProtoCache(vfs);
    loader = new MapLoader(vfs, protos);
    map = await loader.load('ARTEMPLE');
  }, 120_000);
  afterAll(async () => {
    await vfs?.close();
  });

  it('test_mapLoader_artemple_loads_objects', async () => {
    // golden map.json dotyczy mapy z MASTER/PATCH000 (bez overlay): ladujemy bez warstwy nieoficjalnej lat
    const plain = await openGameFolderNode(dir!);
    try {
      const l = new MapLoader(plain, new ProtoCache(plain));
      const m = await l.load('ARTEMPLE');
      expect(m.objects.length).toBeGreaterThan(0);
      expect(m.name).toBe('ARTEMPLE');
      expect(m.byHex.size).toBeGreaterThan(0);
      expect(l.warnings).toEqual([]);
    } finally {
      await plain.close();
    }
    // z overlay (nieoficjalna latka) mapa ma o jeden obiekt wiecej, bez ostrzezen
    expect(map.objects.length).toBe(568);
    expect(loader.warnings).toEqual([]);
  });

  it('test_mapLoader_resolves_proto_for_every_object', () => {
    const check = (o: GameObject): void => {
      expect(o.proto.pid).toBe(o.pid);
      expect(o.type).toBe(pidType(o.pid));
      expect(o.hidden).toBe((o.flags & 1) !== 0);
      o.inventory.forEach(check);
    };
    map.objects.forEach(check);
  });

  it('test_exitGrids_artemple', () => {
    const raw = openGameFile(vfs, 'maps/artemple.map');
    return raw.then(async (b) => {
      const table = await protos.subtypeTable();
      const p = parseMap(
        b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer,
        (pid) => table.get(pid)!,
      );
      const expected = p.objects
        .flat()
        .filter((o) => o.pid > 0x500000f && o.pid < 0x5000018)
        .map((o) => (o.extra.kind === 'exitGrid' ? o.extra.destMap : NaN));
      expect(expected.length).toBeGreaterThan(0);
      expect(map.exitGrids.map((g) => g.destMap)).toEqual(expected);
      for (const g of map.exitGrids) {
        expect(g.destOrientation).toBeGreaterThanOrEqual(0);
        expect(g.destOrientation).toBeLessThanOrEqual(5);
        expect(objectsAt(map, g.elevation, g.hex).some((o) => o.extra.kind === 'exitGrid')).toBe(
          true,
        );
      }
    });
  });

  it('prawdziwa mapa: sciana blokuje, brak blokady na pustym heksie', () => {
    const wall = map.objects.find((o) => o.type === 3 && (o.flags & 0x11) === 0);
    expect(wall).toBeDefined();
    expect(isHexBlocked(map, wall!.elevation, wall!.hex)).toBe(true);
    const others = objectsAt(map, wall!.elevation, wall!.hex).filter((o) => o !== wall);
    for (const o of others) expect(o.hidden).toBe((o.flags & 1) !== 0);
  });

  it('test_mapLoader_uses_overlay_first', async () => {
    const real = await openGameFile(vfs, 'maps/artemple.map');
    const overlay = new MemoryLayer('ov', new Map([['maps/artemple.map', real]]));
    const base = new MemoryLayer(
      'base',
      new Map([['maps/artemple.map', new Uint8Array([1, 2, 3])]]),
    );
    const mixed = new VirtualFs([overlay, base, ...vfs.layers]);
    const m = await new MapLoader(mixed, new ProtoCache(mixed)).load('ARTEMPLE');
    expect(m.objects.length).toBe(map.objects.length);
    const swapped = new VirtualFs([base, overlay, ...vfs.layers]);
    await expect(
      new MapLoader(swapped, new ProtoCache(swapped)).load('ARTEMPLE'),
    ).rejects.toThrow();
  });

  it('test_mapLoader_unknown_pid_uses_placeholder_and_logs', async () => {
    const real = await openGameFile(vfs, 'maps/artemple.map');
    const table = await protos.subtypeTable();
    const sub = (pid: number): number => table.get(pid)!;
    const base = parseMap(real.slice().buffer as ArrayBuffer, sub);
    const wall = base.objects.flat().find((o) => pidType(o.pid) === 3)!;
    const pidBytes = [
      wall.pid >>> 24,
      (wall.pid >> 16) & 255,
      (wall.pid >> 8) & 255,
      wall.pid & 255,
    ];
    let patched: Uint8Array | undefined;
    for (let i = 0; i + 4 <= real.length && !patched; i++) {
      if (pidBytes.every((v, k) => real[i + k] === v)) {
        const c = real.slice();
        c.set([3, 0xff, 0xff, 0xff], i);
        try {
          const p = parseMap(c.buffer as ArrayBuffer, sub);
          if (p.endOffset === c.length && p.objects.flat().some((o) => o.pid === 0x03ffffff))
            patched = c;
        } catch {
          /* niewlasciwe miejsce */
        }
      }
    }
    expect(patched).toBeDefined();
    const mem = new VirtualFs([
      new MemoryLayer('syn', new Map([['maps/artemple.map', patched!]])),
      ...vfs.layers,
    ]);
    const l = new MapLoader(mem, new ProtoCache(mem));
    const m = await l.load('ARTEMPLE');
    expect(l.warnings.length).toBe(1);
    const ph = m.objects.find((o) => o.pid === 0x03ffffff)!;
    expect(ph.proto.pid).toBe(0x03ffffff);
    expect(ph.proto.flags & 0x10).toBe(0x10);
  });

  it('test_artemple_south_exit_grids_cut_off_by_single_tree_hex', () => {
    // Z35b: z kieszeni startu (18492) wyjscia do ARVILLAG (destMap 4) leza za jednoheksowym korkiem (drzewo 0x20003b3, hex 21899).
    // To cecha danych zgodna z oryginalem (patrz test nizej: wejscie z wioski 14128 dochodzi do tych wyjsc).
    const START = 18492;
    const seen = new Set<number>([START]);
    const q = [START];
    while (q.length) {
      const c = q.pop()!;
      for (const n of hexNeighbors(c)) {
        if (n < 0 || n >= 40000 || seen.has(n) || isHexBlocked(map, 0, n)) continue;
        seen.add(n);
        q.push(n);
      }
    }
    const reach = (h: number) => seen.has(h) || hexNeighbors(h).some((n) => seen.has(n));
    expect(map.exitGrids.filter((e) => e.destMap === 3).every((e) => reach(e.hex))).toBe(true);
    expect(map.exitGrids.filter((e) => e.destMap === 4).some((e) => reach(e.hex))).toBe(false);
    const plug = objectsAt(map, 0, 21899).find((o) => o.pid === 0x20003b3);
    expect(plug).toBeDefined();
    expect(seen.has(21699)).toBe(true);
  });

  it('test_artemple_south_exit_grids_reachable_from_village_entry_hex', () => {
    // Zamkniecie jest zamierzone: 18492 to kieszen startu nowej gry (pierwsza wizyta, wyjscie do ARCAVES).
    // Wejscie z ARVILLAG (destHex 14128) laczy sie z poludniem i wyjsciami do ARVILLAG.
    const ENTRY = 14128;
    const seen = new Set<number>([ENTRY]);
    const q = [ENTRY];
    while (q.length) {
      const c = q.pop()!;
      for (const n of hexNeighbors(c)) {
        if (n < 0 || n >= 40000 || seen.has(n) || isHexBlocked(map, 0, n)) continue;
        seen.add(n);
        q.push(n);
      }
    }
    const reach = (h: number) => seen.has(h) || hexNeighbors(h).some((n) => seen.has(n));
    expect(isHexBlocked(map, 0, ENTRY)).toBe(false);
    expect(seen.has(21898)).toBe(true);
    expect(map.exitGrids.filter((e) => e.destMap === 4).some((e) => reach(e.hex))).toBe(true);
    // drzewo 0x20003b3 blokuje wg flag instancji (0x1 i 0x10 wyczyszczone), dokladnie jak f2_obj_blocking_at
    const plug = objectsAt(map, 0, 21899).find((o) => o.pid === 0x20003b3)!;
    expect(plug.flags & 0x11).toBe(0);
    expect(isHexBlocked(map, 0, 21899)).toBe(true);
  });

  it('test_artemple_plug_not_bypassed_cave_route_connects_pocket_to_village', async () => {
    // Korek 21899 nie jest omijany: kieszen startu (18492) to wnetrze swiatyni. Z niej droga do wioski
    // prowadzi przez ARCAVES (destMap 3), a ARCAVES konczy sie wyjsciem na ARVILLAG (destMap 4, hex 20517).
    // Powrot z ARCAVES do swiatyni (destMap 126 = ARTEMPLE, hex 16486) laduje w tej samej kieszeni.
    const flood = (start: number): Set<number> => {
      const seen = new Set<number>([start]);
      const q = [start];
      while (q.length) {
        const c = q.pop()!;
        for (const n of hexNeighbors(c)) {
          if (n < 0 || n >= 40000 || seen.has(n) || isHexBlocked(map, 0, n)) continue;
          seen.add(n);
          q.push(n);
        }
      }
      return seen;
    };
    const caves = await loader.load('ARCAVES');
    const back = caves.exitGrids.filter((e) => e.destMap === 126);
    expect(back.length).toBeGreaterThan(0);
    expect(new Set(back.map((e) => e.destHex))).toEqual(new Set([16486]));
    const pocket = flood(18492);
    expect(isHexBlocked(map, 0, 16486)).toBe(false);
    expect(pocket.has(16486)).toBe(true);
    expect(pocket.has(21898)).toBe(false);
    const toVillage = caves.exitGrids.filter((e) => e.destMap === 4);
    expect(toVillage.length).toBeGreaterThan(0);
    expect(toVillage.every((e) => e.destHex === 20517 && e.elevation === 2)).toBe(true);
  }, 120_000);

  it('test_uniquify_object_ids_makes_ids_unique', () => {
    const ids = new Set(map.objects.map((o) => o.id));
    expect(ids.size).toBe(map.objects.length);
  });
});
