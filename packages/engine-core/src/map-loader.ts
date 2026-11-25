import { parseMap, pidType } from '@f2/formats';
import type { MapObject, Proto } from '@f2/formats';
import type { VirtualFs } from '@f2/vfs';
import { exitGridOf } from './exit-grid.js';
import { indexObject } from './game-map.js';
import type { ExitGrid, GameMap } from './game-map.js';
import type { GameObject } from './game-object.js';
import type { Direction } from './hexgrid.js';
import { openGameFile, type ProtoCache } from './proto-cache.js';

/** Pierwszy id przydzielany duplikatom (ponizej id gracza 0x7fff0000 i dzieci execScript 0x7f000000). */
const FIRST_SYNTHETIC_ID = 0x10000000;

/**
 * Id obiektow w plikach map nie sa unikalne (ARVILLAG: ~270 kolizji); oryginal wiaze skrypt z obiektem przez
 * script id (sid), nie przez id. Runtime adresuje obiekty po id, wiec duplikaty dostaja nowe, unikalne id.
 * Obiekty ze skryptem zachowuja oryginalny id w pierwszej kolejnosci (krytterzy przed reszta).
 */
export function uniquifyObjectIds(objects: GameObject[]): void {
  const taken = new Set<number>();
  const rest: GameObject[] = [];
  const pass = (o: GameObject): void => {
    if (taken.has(o.id)) rest.push(o);
    else taken.add(o.id);
  };
  for (const o of objects) if (o.scriptId !== -1) pass(o);
  for (const o of objects) if (o.scriptId === -1) pass(o);
  let next = FIRST_SYNTHETIC_ID;
  for (const o of rest) {
    while (taken.has(next)) next++;
    o.id = next;
    taken.add(next++);
  }
}

/** Ile prototypow czytamy naraz przy wczytywaniu mapy. */
const PREFETCH_CONCURRENCY = 32;

export class MapLoader {
  /** Ostrzezenia z ostatnich wczytan (np. nieznany pid zastapiony prototypem zastepczym). */
  readonly warnings: string[] = [];

  constructor(
    private readonly vfs: VirtualFs,
    private readonly protos: ProtoCache,
  ) {}

  /** "ARTEMPLE" -> maps/artemple.map (warstwy: overlay > PATCH000 > MASTER, przez VFS). */
  async load(mapName: string): Promise<GameMap> {
    const base = mapName.replace(/\.map$/i, '');
    const bytes = await openGameFile(this.vfs, `maps/${base.toLowerCase()}.map`);
    const buf = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    const subtypes = await this.protos.subtypeTable();
    const parsed = parseMap(buf, (pid) => {
      const v = subtypes.get(pid);
      if (v === undefined) throw new Error(`brak prototypu pid ${pid.toString(16)}`);
      return v;
    });

    const map: GameMap = {
      name: base.toUpperCase(),
      header: parsed.header,
      tiles: parsed.tiles,
      objects: [],
      byHex: new Map(),
      globalVars: parsed.globalVars,
      localVars: parsed.localVars,
      scripts: parsed.scripts,
      exitGrids: [],
    };
    await this.prefetchProtos(parsed.objects);
    const exitGrids: ExitGrid[] = [];
    for (const level of parsed.objects) {
      for (const mo of level) {
        const obj = await this.build(mo, mo.elevation as 0 | 1 | 2, map.name);
        map.objects.push(obj);
        indexObject(map, obj);
        const eg = exitGridOf(obj);
        if (eg) exitGrids.push(eg);
      }
    }
    map.exitGrids = exitGrids;
    uniquifyObjectIds(map.objects);
    return map;
  }

  /**
   * Wczytuje prototypy wszystkich roznych pidow mapy rownolegle (z limitem), zanim `build` zacznie
   * je po kolei dopisywac do GameMap. Bez tego kazdy nowy pid czekal na odczyt z VFS osobno,
   * jeden po drugim. Bledy pomijamy tu po cichu: `protoFor` powtorzy zapytanie i zapisze ostrzezenie
   * dokladnie tak jak dotychczas.
   */
  private async prefetchProtos(levels: readonly (readonly MapObject[])[]): Promise<void> {
    const pids = new Set<number>();
    const walk = (list: readonly MapObject[]): void => {
      for (const mo of list) {
        if (this.protos.peek(mo.pid) === undefined) pids.add(mo.pid);
        if (mo.inventory.length > 0) walk(mo.inventory);
      }
    };
    for (const level of levels) walk(level);
    const queue = [...pids];
    const worker = async (): Promise<void> => {
      for (let pid = queue.pop(); pid !== undefined; pid = queue.pop()) {
        await this.protos.get(pid).catch(() => undefined);
      }
    };
    await Promise.all(Array.from({ length: Math.min(PREFETCH_CONCURRENCY, queue.length) }, worker));
  }

  /** Id obiektow tworzonych w trakcie gry (create_object); poza zakresem id z map i id syntetycznych. */
  private spawnId = 0x20000000;

  /**
   * Synchroniczne tworzenie obiektu w locie (opkod create_object). Prototyp z cache albo zastepczy;
   * w drugim wypadku prototyp jest doladowywany w tle i podmieniany na obiekcie (fid/flagi).
   */
  spawn(
    pid: number,
    hex: number,
    elevation: 0 | 1 | 2,
    /** Id juz zajete poza mapa (np. przedmioty w ekwipunkach zarejestrowane przez InventoryModel). */
    isTaken?: (id: number) => boolean,
  ): GameObject {
    if (isTaken) while (isTaken(this.spawnId)) this.spawnId++;
    const cached = this.protos.peek(pid);
    const proto = cached ?? this.protos.placeholderFor(pid);
    const type = pidType(pid);
    const sub = 'subtype' in proto ? (proto.subtype as number) : 0;
    const extra: GameObject['extra'] =
      type === 1
        ? { kind: 'critter', flags: 0, raw: new Int32Array(10) }
        : type === 0
          ? { kind: 'item', subtype: sub, flags: 0, raw: new Int32Array(0) }
          : type === 2
            ? { kind: 'scenery', subtype: sub, flags: 0, raw: new Int32Array(0) }
            : { kind: 'misc', flags: 0 };
    const obj: GameObject = {
      id: this.spawnId++,
      pid,
      fid: proto.fid,
      type,
      hex,
      elevation,
      rotation: 0,
      frame: 0,
      // flagi instancji nowego obiektu startuja od flag PRO (W: na mapach instancje maja flagi rowne PRO, np. drzewo
      // 0x80008000; zniszczone drzwi 0x20003a5 z create_object musza miec NoBlock 0x10, inaczej mur po wybuchu dalej blokuje)
      flags: proto.flags,
      protoFlags: proto.flags,
      scriptId: -1,
      localVars: new Int32Array(0),
      inventory: [],
      quantity: 1,
      proto,
      extra,
      hidden: false,
    };
    if (!cached) {
      const initialFlags = obj.flags;
      this.protos
        .get(pid)
        .then((real) => {
          obj.proto = real;
          obj.fid = real.fid;
          obj.protoFlags = real.flags;
          if (obj.flags === initialFlags) obj.flags = real.flags;
        })
        .catch(() => undefined);
    }
    return obj;
  }

  private async protoFor(pid: number, mapName: string): Promise<Proto> {
    try {
      return await this.protos.get(pid);
    } catch (e) {
      this.warnings.push(
        `${mapName}: pid ${pid.toString(16)} bez prototypu (${(e as Error).message}), uzyto zastepczego`,
      );
      return this.protos.placeholderFor(pid);
    }
  }

  private async build(mo: MapObject, elevation: 0 | 1 | 2, mapName: string): Promise<GameObject> {
    const proto = await this.protoFor(mo.pid, mapName);
    const inventory: GameObject[] = [];
    for (const it of mo.inventory) inventory.push(await this.build(it, elevation, mapName));
    return {
      id: mo.objectId,
      pid: mo.pid,
      fid: mo.fid,
      type: pidType(mo.pid),
      hex: mo.hex,
      elevation,
      rotation: mo.rotation as Direction,
      frame: mo.frame,
      flags: mo.flags,
      protoFlags: proto.flags,
      scriptId: mo.scriptId,
      localVars: mo.localVars,
      inventory,
      quantity: mo.quantity,
      proto,
      extra: mo.extra,
      hidden: (mo.flags & 1) !== 0,
      lightRadius: mo.lightRadius,
      lightIntensity: mo.lightIntensity,
    };
  }
}
