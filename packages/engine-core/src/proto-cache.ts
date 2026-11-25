import { lstName, parseLst, parseProto, pidIndex, pidType, ProtoFlags } from '@f2/formats';
import type { Proto } from '@f2/formats';
import type { VirtualFs } from '@f2/vfs';
import { applyProtoFixes } from '@f2/rules';

const DIRS = ['items', 'critters', 'scenery', 'walls', 'tiles', 'misc'] as const;

/**
 * Otwiera plik gry. Warstwa overlay trzyma klucze `data/...`, reszta bez prefiksu, wiec sprawdzamy
 * oba warianty i bierzemy ten z warstwy o wyzszym priorytecie (overlay > PATCH000 > MASTER).
 */
export async function openGameFile(vfs: VirtualFs, path: string): Promise<Uint8Array> {
  const plain = vfs.resolve(path);
  const over = vfs.resolve(`data/${path}`);
  if (over && (!plain || vfs.layers.indexOf(over) <= vfs.layers.indexOf(plain))) {
    return vfs.open(`data/${path}`);
  }
  return vfs.open(path);
}

export class ProtoCache {
  private readonly cache = new Map<number, Proto>();
  private readonly lsts = new Map<number, Promise<string[]>>();
  private subtypes: Promise<Map<number, number>> | undefined;

  /**
   * `fixes`: flagi `rules.fixes.*` (ADR-0004); gdy podane, prototypy z patcha 1.02.25 dostaja wartosci
   * wlaczonych poprawek, a wylaczonych wracaja do vanilli. Bez flag: dane takie, jak w plikach.
   */
  constructor(
    private readonly vfs: VirtualFs,
    private readonly fixes?: Readonly<Record<string, boolean>>,
  ) {}

  private lst(type: number): Promise<string[]> {
    let p = this.lsts.get(type);
    if (!p) {
      const dir = DIRS[type];
      if (dir === undefined) return Promise.reject(new Error(`zly typ obiektu ${type}`));
      p = openGameFile(this.vfs, `proto/${dir}/${dir}.lst`).then((b) => parseLst(b).map(lstName));
      this.lsts.set(type, p);
    }
    return p;
  }

  /** Synchroniczny odczyt z cache (undefined, gdy prototyp nie byl jeszcze zaladowany). */
  peek(pid: number): Proto | undefined {
    return this.cache.get(pid);
  }

  async get(pid: number): Promise<Proto> {
    const hit = this.cache.get(pid);
    if (hit) return hit;
    const type = pidType(pid);
    const names = await this.lst(type);
    const name = names[pidIndex(pid) - 1];
    if (name === undefined || name === '')
      throw new Error(`brak prototypu pid ${pid.toString(16)}`);
    const bytes = await openGameFile(this.vfs, `proto/${DIRS[type]}/${name}`);
    const parsed = parseProto(bytes);
    const proto = this.fixes ? applyProtoFixes(parsed, this.fixes) : parsed;
    this.cache.set(pid, proto);
    return proto;
  }

  /**
   * Synchroniczny subtypeOf(pid) dla parseMap: tablica podtypow (u32 @0x20 pliku PRO) dla items i scenery.
   * Budowana raz, leniwie.
   */
  subtypeTable(): Promise<Map<number, number>> {
    this.subtypes ??= (async () => {
      const table = new Map<number, number>();
      for (const type of [0, 2]) {
        const names = await this.lst(type);
        const dir = DIRS[type]!;
        const bytes = await Promise.all(
          names.map((n) => (n === '' ? undefined : openGameFile(this.vfs, `proto/${dir}/${n}`))),
        );
        bytes.forEach((b, i) => {
          if (!b) return;
          const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
          table.set(type * 0x1000000 + i + 1, dv.getUint32(0x20, false));
        });
      }
      return table;
    })();
    return this.subtypes;
  }

  /** Prototyp zastepczy dla nieznanego pid: nie blokuje, niewidoczny dla logiki, bez skryptu. */
  placeholderFor(pid: number): Proto {
    const type = pidType(pid);
    const base = {
      pid,
      type,
      index: pidIndex(pid),
      textId: 0,
      fid: (type << 24) >>> 0,
      lightDistance: 0,
      lightIntensity: 0,
      flags: ProtoFlags.noBlock | ProtoFlags.flat,
    };
    switch (type) {
      case 0:
        return {
          ...base,
          kind: 'item',
          extFlags: 0,
          scriptId: -1,
          subtype: 5,
          material: 0,
          size: 0,
          weight: 0,
          cost: 0,
          invFid: -1,
          soundId: 0,
          data: [0, 0, 0],
          tail: [],
        };
      case 1:
        return {
          ...base,
          kind: 'critter',
          extFlags: 0,
          scriptId: -1,
          headFid: -1,
          aiPacket: 0,
          team: 0,
          critterFlags: 0,
          baseStats: [],
          bonusStats: [],
          skills: [],
          bodyType: 0,
          expForKill: 0,
          killType: 0,
          damageType: undefined,
        };
      case 2:
        return {
          ...base,
          kind: 'scenery',
          actionFlags: 0,
          scriptId: -1,
          subtype: 5,
          material: 0,
          soundId: 0,
          data: [0],
        };
      case 3:
        return { ...base, kind: 'wall', actionFlags: 0, scriptId: -1, material: 0 };
      case 4:
        return { ...base, kind: 'tile', material: 0 };
      default:
        return { ...base, kind: 'misc', extFlags: 0 };
    }
  }
}
