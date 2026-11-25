import {
  hexDistance,
  isDoor as engineIsDoor,
  isDoorLocked,
  DOOR_LOCKED_BIT,
  isDoorOpen,
  objectsAt,
  toggleDoor,
  moveObject,
  type GameMap,
  type GameObject,
} from '@f2/engine-core';
import type { ActionMessage } from './object-actions';

const isDoor = (o: GameObject): boolean => !!o.extra && engineIsDoor(o);
const TYPE_ITEM = 0;
const TYPE_CRITTER = 1;
const TYPE_SCENERY = 2;
const ITEM_CONTAINER = 1;
const FLAG_NO_BLOCK = 0x10;
const FLAG_CONTAINER_LOCKED = 0x2;

export const isChestItem = (o: GameObject): boolean =>
  o.type === TYPE_ITEM && o.proto?.kind === 'item' && o.proto.subtype === ITEM_CONTAINER;
/** Skrzynia/szafka: przedmiot-pojemnik albo sceneria z zawartoscia. */
export const isContainer = (o: GameObject): boolean =>
  isChestItem(o) || (o.type === TYPE_SCENERY && (o.inventory?.length ?? 0) > 0);
const isContainerLocked = (o: GameObject): boolean =>
  o.extra !== undefined &&
  (o.extra.kind === 'item' || o.extra.kind === 'scenery') &&
  (o.extra.flags & FLAG_CONTAINER_LOCKED) !== 0;

/** Kod klucza zamka drzwi z proto scenerii (dane podtypu 0, drugi u32); undefined = brak (-1/0, Z: 0 traktowane jak brak). */
export function doorKeyId(door: GameObject): number | undefined {
  const p = door.proto;
  if (!p || p.kind !== 'scenery' || p.subtype !== 0) return undefined;
  const k = (p.data[1] ?? -1) | 0;
  return k > 0 ? k : undefined;
}

/** Czy gracz niesie klucz (przedmiot podtypu 6) o kodzie pasujacym do zamka drzwi. */
export function hasKeyFor(player: GameObject, door: GameObject): boolean {
  const id = doorKeyId(door);
  if (id === undefined) return false;
  return player.inventory.some(
    (i) =>
      i.proto?.kind === 'item' && i.proto.subtype === 6 && ((i.proto.data[0] ?? -1) | 0) === id,
  );
}

/**
 * Cel przejscia schodow/drabiny. mapIndex 0 = przesuniecie na te sama mape (D: 0x49c900/0x49c9a4/0x49ca48,
 * gdy +0x3c <= 0 wywolywane jest obj_move_to_tile zamiast zadania wyjscia z mapy).
 */
export interface TransitionTarget {
  mapIndex: number;
  hex: number;
  elevation: number;
  rotation: number;
}
/**
 * Dekodowanie pola "zbudowanego kafla" (obj+0x40): kafel = bity 0-25, obrot = bity 26-28 (0x1c000000 >> 26),
 * kondygnacja = bity 29-31 (0xe0000000 >> 29). D: 0x49c900/0x49c9a4/0x49ca48, te same trzy funkcje dla
 * schodow (podtyp 1) i drabin (podtypy 3, 4; dispatch w 0x49c740 po podtypie proto).
 * Kolejnosc pol w pliku mapy (W, z danych 157 obiektow w MASTER/PATCH000): drabina [mapa, kafel],
 * schody [kafel, mapa]; w pamieci +0x3c = mapa, +0x40 = kafel. -1 w polu kafla = brak efektu.
 */
export function stairsTarget(o: GameObject): TransitionTarget | undefined {
  const e = o.extra;
  if (o.type !== TYPE_SCENERY || !e || (e.kind !== 'stairs' && e.kind !== 'ladder'))
    return undefined;
  const ladder = e.kind === 'ladder';
  const map = (ladder ? e.raw[0] : e.raw[1]) ?? -1;
  const built = (ladder ? e.raw[1] : e.raw[0]) ?? -1;
  if (built === -1) return undefined;
  return {
    mapIndex: map > 0 ? map : 0,
    hex: built & 0x3ffffff,
    elevation: (built >>> 29) & 7,
    rotation: (built & 0x1c000000) >>> 26,
  };
}

/** Czy obiekt ma domyslna akcje Uzyj bez skryptu: drzwi, pojemniki, schody/drabiny z celem w proto. */
export function hasDefaultUse(o: GameObject): boolean {
  return isDoor(o) || isContainer(o) || stairsTarget(o) !== undefined;
}

export const isLiveCritter = (o: GameObject): boolean =>
  o.type === TYPE_CRITTER && (o.flags & FLAG_NO_BLOCK) === 0;

export interface DefaultUseDeps {
  map(): GameMap;
  player(): GameObject;
  /** Otwarcie pojemnika (okno lootu); wynik jak przy podnoszeniu. */
  openContainer?(o: GameObject): { ok: boolean; reason?: string };
  /** Przejscie do innej mapy (schody/drabina). */
  travel?(t: TransitionTarget): void;
}

/** Domyslne Uzyj: drzwi (otwarcie/zamkniecie), pojemnik (loot), schody/drabina. null = wykonano. */
export function defaultUse(obj: GameObject, d: DefaultUseDeps): ActionMessage | null | undefined {
  if (isDoor(obj)) {
    if (isDoorLocked(obj)) {
      // klucz pasujacy do zamka: odblokuj (bit zamka) i otworz w tym samym Uzyj
      if (!hasKeyFor(d.player(), obj)) return { key: 'menu.locked' };
      const e = obj.extra;
      if (e.kind === 'door') e.raw[0] = (e.raw[0] ?? 0) & ~DOOR_LOCKED_BIT;
    }
    if (isDoorOpen(obj)) {
      // zamykanie blokuje obiekt stojacy w przejsciu (krytera, gracz, przedmiot)
      const inDoorway = objectsAt(d.map(), obj.elevation, obj.hex).some(
        (x) => x !== obj && !x.hidden && (x.type === TYPE_CRITTER || x.type === TYPE_ITEM),
      );
      if (inDoorway) return { key: 'menu.doorBlocked' };
    }
    const r = toggleDoor(d.map(), obj);
    return r.ok ? null : { key: 'menu.locked' };
  }
  if (isContainer(obj)) {
    if (isContainerLocked(obj)) return { key: 'menu.locked' };
    if (!d.openContainer) return { key: 'menu.noEffect' };
    const r = d.openContainer(obj);
    return r.ok ? null : { key: r.reason === 'too-far' ? 'menu.tooFar' : 'menu.noEffect' };
  }
  const st = stairsTarget(obj);
  if (st && d.travel) {
    d.travel(st);
    return null;
  }
  return undefined;
}

/**
 * Domyslne Pchnij bez nadpisania skryptu: towarzysz druzyny zamienia sie miejscami z graczem,
 * reszta nie reaguje (Z: oryginalne zachowanie nie zweryfikowane w dokumentacja techniczna ani specyfikacja formatu).
 */
export function defaultPush(
  obj: GameObject,
  d: { map(): GameMap; player(): GameObject; isParty?(o: GameObject): boolean },
): ActionMessage | null {
  const p = d.player();
  if (!isLiveCritter(obj) || obj === p) return { key: 'menu.noEffect' };
  if (!d.isParty?.(obj)) return { key: 'menu.pushNoEffect' };
  if (obj.elevation !== p.elevation || hexDistance(p.hex, obj.hex) > 1)
    return { key: 'menu.tooFar' };
  const a = p.hex;
  const b = obj.hex;
  moveObject(d.map(), obj, -1);
  moveObject(d.map(), p, b);
  moveObject(d.map(), obj, a);
  return null;
}
