import {
  directionTo,
  hexInDirection,
  hexToWorld,
  objectsAt,
  type Direction,
  type GameMap,
  type GameObject,
} from '@f2/engine-core';
import {
  OBJ_TYPE_CRITTER,
  burstMissRedirect,
  tileBeyond,
  type MissRedirectObject,
  type Rng,
  SHOT_FLAG_MULTI_HEX,
  countCover,
  pixelToHexOriginal,
  shootBlockingAt,
  traceStraightPath,
  type BlockFn,
  type ShotGeometry,
  type ShotObject,
} from '@f2/rules';

const RESULT_DEAD = 0x80;

/** Geometria heksow dla linii strzalu (D: tile_coord + (16, 8); pixelToHex = dokladna 0x4b1754 z tablica 0x66b9c4, D). */
export const SHOT_GEOMETRY: ShotGeometry = {
  hexCenter: (h) => hexToWorld(h),
  pixelToHex: (x, y) => pixelToHexOriginal(x, y),
  neighbor: (h, d) => {
    const n = hexInDirection(h, d as Direction);
    return n;
  },
  directionTo: (a, b) => directionTo(a, b),
};

interface Shot extends ShotObject {
  src: GameObject;
}

function isDead(o: GameObject): boolean {
  return o.extra.kind === 'critter' && ((o.extra.raw[3] ?? 0) & RESULT_DEAD) !== 0;
}

/**
 * Liczba oslon na linii strzalu z `attacker` w `target` (0x426cc4, krok 4 to-hit). Obiekty mapy
 * opakowywane w widok `ShotObject` (flagi, typ, heks, martwy); tozsamosc zachowana w obrebie wywolania.
 */
export function coverCountBetween(map: GameMap, attacker: GameObject, target: GameObject): number {
  const cache = new Map<GameObject, Shot>();
  const wrap = (o: GameObject): Shot => {
    let s = cache.get(o);
    if (!s) {
      s = {
        src: o,
        flags: o.flags >>> 0,
        type: o.type as number,
        hex: o.hex,
        dead: isDead(o),
      };
      cache.set(o, s);
    }
    return s;
  };
  const elev = attacker.elevation;
  const r = countCover<Shot>({
    geo: SHOT_GEOMETRY,
    at: (hex) => objectsAt(map, elev, hex).map(wrap),
    attacker: wrap(attacker),
    fromHex: attacker.hex,
    toHex: target.hex,
    target: wrap(target),
  });
  return r.count;
}

/**
 * Krytterzy trafiani kolejno na linii serii od `attacker` do `endHex` (krok 0x4163c8 z 0x423284; start kolejnego
 * odcinka = heks poprzedniego obiektu, wieloheksowy: krok ku koncowi). Przerywa na obiekcie niebedacym krytterem
 * i po obiekcie stojacym na heksie konca. Martwe zwloki sa pomijane (Z: oryginal liczy je jako przeszkode).
 */
export function critterRay(map: GameMap, attacker: GameObject, endHex: number): GameObject[] {
  const cache = new Map<GameObject, Shot>();
  const wrap = (o: GameObject): Shot => {
    let s = cache.get(o);
    if (!s) {
      s = { src: o, flags: o.flags >>> 0, type: o.type as number, hex: o.hex, dead: isDead(o) };
      cache.set(o, s);
    }
    return s;
  };
  const elev = attacker.elevation;
  const at = (hex: number): Shot[] => objectsAt(map, elev, hex).map(wrap);
  const block: BlockFn<Shot> = (a, hex) => shootBlockingAt(SHOT_GEOMETRY, at, a, hex);
  const me = wrap(attacker);
  const out: GameObject[] = [];
  let start = attacker.hex;
  let obj: Shot | null = me;
  for (let guard = 0; guard < 64; guard++) {
    if (start === endHex) break;
    obj = traceStraightPath(SHOT_GEOMETRY, me, start, endHex, obj, block);
    if (!obj || obj.type !== OBJ_TYPE_CRITTER) break;
    if (!obj.dead) out.push(obj.src);
    if (obj.hex === endHex) break;
    start =
      (obj.flags & SHOT_FLAG_MULTI_HEX) === 0
        ? obj.hex
        : SHOT_GEOMETRY.neighbor(start, SHOT_GEOMETRY.directionTo(start, endHex));
  }
  return out;
}

/**
 * Przekierowanie pudla serii (0x423128, D): heks trafionego obiektu na linii od atakujacego poza cel albo null.
 * `chanceFor` = szansa trafienia krytera (0x4243a8); `range` = zasieg broni (0x478a1c). `0x42dd18` (D, specyfikacja formatu 2026-11-13)
 * to is_dead: kryter z HP (stat 0x23) < 1 lub flaga wyniku +0x44 & 0x80; `hpDead` dostarcza stan HP spoza obiektu mapy,
 * domyslnie liczy sie sama flaga martwego.
 */
export function missRedirectHex(
  map: GameMap,
  attacker: GameObject,
  target: GameObject,
  range: number,
  chanceFor: (o: GameObject) => number,
  rng: Rng,
  hpDead: (o: GameObject) => boolean = () => false,
): number | null {
  type RObj = MissRedirectObject & Shot;
  const cache = new Map<GameObject, RObj>();
  const wrap = (o: GameObject): RObj => {
    let s = cache.get(o);
    if (!s) {
      const critter = (o.type as number) === OBJ_TYPE_CRITTER;
      s = {
        src: o,
        flags: o.flags >>> 0,
        type: o.type as number,
        hex: o.hex,
        dead: isDead(o),
        hidden: ((o.flags >>> 0) & 0x80000000) !== 0, // +0x27 & 0x80 = bit 31 flag
        isCritter: critter,
        isTarget: o === target,
        busy: critter && (isDead(o) || hpDead(o)),
        toHit: critter ? chanceFor(o) : 0,
      };
      cache.set(o, s);
    }
    return s;
  };
  const elev = attacker.elevation;
  const at = (hex: number): RObj[] => objectsAt(map, elev, hex).map(wrap);
  const block: BlockFn<RObj> = (a, hex) => shootBlockingAt(SHOT_GEOMETRY, at, a, hex);
  const me = wrap(attacker);
  const end = tileBeyond(SHOT_GEOMETRY, attacker.hex, target.hex, range);
  const hit = burstMissRedirect<RObj>(
    attacker.hex,
    end,
    (start, prev) => traceStraightPath(SHOT_GEOMETRY, me, start, end, prev ?? me, block),
    rng,
  );
  return hit ? hit.hex : null;
}
