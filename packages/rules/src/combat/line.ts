/**
 * Linia strzalu i oslona przez krytery (specs/combat.md krok 11, D z silnik gry):
 * 0x48b930 (obj_shoot_blocking_at), 0x4163c8 (make_straight_path_func), 0x426cc4 (licznik oslony).
 * Pakiet `rules` nie ma zaleznosci, wiec geometria heksow jest wstrzykiwana (`ShotGeometry`).
 *
 * pixelToHex oryginalu (0x4b1754, tablica 0x66b9c4) jest odtworzone dokladnie: `pixelToHexOriginal` (D).
 */

export const OBJ_TYPE_CRITTER = 1;
export const OBJ_TYPE_SCENERY = 2;
export const OBJ_TYPE_WALL = 3;
export const SHOT_FLAG_HIDDEN = 0x1;
export const SHOT_FLAG_NO_BLOCK = 0x10;
export const SHOT_FLAG_MULTI_HEX = 0x800;
export const SHOT_FLAG_SHOOT_THRU = 0x80000000;

export interface ShotGeometry {
  /** Srodek heksa w pikselach (tile_coord 0x4b1674 + (16, 8)). */
  hexCenter(hex: number): { x: number; y: number };
  /** Piksel -> heks (0x4b1754). */
  pixelToHex(x: number, y: number): number;
  /** Sasiad w kierunku 0..5 (0x4b1a6c z krokiem 1); <0 poza siatka. */
  neighbor(hex: number, dir: number): number;
  /** Kierunek z heksa do heksa (0x4b1abc). */
  directionTo(from: number, to: number): number;
}

/** Minimalny widok obiektu mapy potrzebny linii strzalu. */
export interface ShotObject {
  /** Bity flag obiektu (obj+0x24, jak w MAP/PRO). */
  flags: number;
  /** 1 krytter, 2 scenery, 3 sciana, ... */
  type: number;
  hex: number;
  /** Krytter martwy (obj+0x44 bit 0x80). */
  dead?: boolean;
}

export type BlockFn<O> = (attacker: O | null, hex: number) => O | null;

/** Obiekty na heksie wg kolejnosci listy (elewacja jest juz zawarta w `at`). */
export type ObjectsAt<O> = (hex: number) => readonly O[];

function solidType(t: number): boolean {
  return t === OBJ_TYPE_CRITTER || t === OBJ_TYPE_SCENERY || t === OBJ_TYPE_WALL;
}

/**
 * 0x48b930: pierwszy obiekt blokujacy strzal na heksie. Przebieg 1: obiekty na heksie
 * (pomija ukryte oraz NoBlock+ShootThru). Przebieg 2: 6 sasiadow, tylko obiekty wieloheksowe
 * (pomija ukryte i NoBlock). Zawsze pomija atakujacego; liczy sie typ krytter/scenery/sciana.
 */
export function shootBlockingAt<O extends ShotObject>(
  geo: Pick<ShotGeometry, 'neighbor'>,
  at: ObjectsAt<O>,
  attacker: O | null,
  hex: number,
): O | null {
  if (hex < 0 || hex >= 0x9c40) return null;
  for (const o of at(hex)) {
    if (o.flags & SHOT_FLAG_HIDDEN) continue;
    if ((o.flags & SHOT_FLAG_NO_BLOCK) !== 0 && (o.flags & SHOT_FLAG_SHOOT_THRU) !== 0) continue;
    if (o === attacker) continue;
    if (solidType(o.type)) return o;
  }
  for (let dir = 0; dir < 6; dir++) {
    const n = geo.neighbor(hex, dir);
    if (n < 0 || n >= 0x9c40) continue;
    for (const o of at(n)) {
      if ((o.flags & SHOT_FLAG_MULTI_HEX) === 0) continue;
      if ((o.flags & (SHOT_FLAG_HIDDEN | SHOT_FLAG_NO_BLOCK)) !== 0) continue;
      if (o === attacker) continue;
      if (solidType(o.type)) return o;
    }
  }
  return null;
}

/** Przy trybie a6 = 0x20 obiekt z flaga ShootThru (obj+0x27 & 0x80) nie zatrzymuje linii. */
function passes(o: ShotObject): boolean {
  return (o.flags & SHOT_FLAG_SHOOT_THRU) !== 0;
}

/**
 * 0x4163c8 z a6 = 0x20 i bez bufora sciezki (a4 = NULL): Bresenham w pikselach od srodka `from` do
 * srodka `to` (kroki 2|dx|, 2|dy|, os dominujaca x gdy 2|dx| > 2|dy|); przy zmianie heksa pyta
 * `block`. Zwraca pierwszy obiekt rozny od `prev` (a5) i nie-ShootThru albo null, gdy linia doszla
 * do konca. Heks celu jest sprawdzany (przy wejsciu w niego), pomijany jest tylko sam ostatni piksel.
 */
export function traceStraightPath<O extends ShotObject>(
  geo: Pick<ShotGeometry, 'hexCenter' | 'pixelToHex'>,
  attacker: O | null,
  from: number,
  to: number,
  prev: O | null,
  block: BlockFn<O>,
): O | null {
  const first = block(attacker, from);
  if (first && first !== prev && !passes(first)) return first;
  const s = geo.hexCenter(from);
  const e = geo.hexCenter(to);
  let x = s.x;
  let y = s.y;
  const dx2 = Math.abs(e.x - x) * 2;
  const dy2 = Math.abs(e.y - y) * 2;
  const sx = Math.sign(e.x - x);
  const sy = Math.sign(e.y - y);
  let prevHex = from;
  const xDominant = dx2 > dy2;
  let err = xDominant ? dy2 - (dx2 >> 1) : dx2 - (dy2 >> 1);
  // limit bezpieczenstwa: oryginal przerywa po 200 probkach co 32 piksele
  for (let guard = 0; guard < 200 * 32 + 1; guard++) {
    const hex = geo.pixelToHex(x, y);
    if (xDominant ? x === e.x : y === e.y) return null;
    if (xDominant) {
      if (err >= 0) {
        err -= dx2;
        y += sy;
      }
      x += sx;
      err += dy2;
    } else {
      if (err >= 0) {
        err -= dy2;
        x += sx;
      }
      y += sy;
      err += dx2;
    }
    if (hex === prevHex) continue;
    const o = block(attacker, hex);
    if (o && o !== prev && !passes(o)) return o;
    prevHex = hex;
  }
  return null;
}

export interface CoverInput<O extends ShotObject> {
  geo: ShotGeometry;
  at: ObjectsAt<O>;
  attacker: O;
  /** Heks atakujacego i heks celu. */
  fromHex: number;
  toHex: number;
  target: O | null;
}

/**
 * 0x426cc4: liczba oslon na linii strzalu. `blocked` = funkcja zwrocila 1: nie-krytter inny niz cel
 * zaslania linie. Licznik: za kazdego krytera na linii innego niz cel, o ile CEL nie jest martwy
 * (D: test 0x426d45 dotyczy argumentu celu, nie przeszkody), +1 gdy cel jest wieloheksowy
 * (obj+0x25 & 8). Po krytterze linia startuje od jego heksa (wieloheksowy: krok od startu ku celowi).
 */
export function countCover<O extends ShotObject>(
  i: CoverInput<O>,
): { blocked: boolean; count: number } {
  const { geo, at, attacker, toHex, target } = i;
  let count = 0;
  let start = i.fromHex;
  let obj: O | null = attacker;
  const block: BlockFn<O> = (a, hex) => shootBlockingAt(geo, at, a, hex);
  for (let guard = 0; guard < 400; guard++) {
    if (!obj || start === toHex) return { blocked: false, count };
    obj = traceStraightPath(geo, attacker, start, toHex, obj, block);
    if (!obj) return { blocked: false, count };
    if (obj.type !== OBJ_TYPE_CRITTER && obj !== target) return { blocked: true, count };
    if (target && obj !== target && !target.dead) {
      count++;
      if ((target.flags & SHOT_FLAG_MULTI_HEX) !== 0) count++;
    }
    start =
      (obj.flags & SHOT_FLAG_MULTI_HEX) === 0
        ? obj.hex
        : geo.neighbor(start, geo.directionTo(start, toHex));
  }
  return { blocked: false, count };
}

/**
 * Tablica 16x32 bajtow z 0x66b9c4 (D, generator przy 0x4b0d92..0x4b0e45): kody korekty piksela
 * w obrebie kafla 64x12. Wiersze 0..3: 1 gdy (64-4j) > esi (kolumny 0..15), 2 gdy 4k > esi
 * (kolumny 16..31), esi = 0,16,32,48; wiersze 4..11 zerowe; wiersze 12..15: 3 gdy !(edx>esi),
 * potem 4 gdy !(edx>esi), edx = 0..60 i 64..4 co 4.
 */
export const PIXEL_HEX_TABLE: Uint8Array = (() => {
  const t = new Uint8Array(16 * 32);
  for (let r = 0; r < 4; r++) {
    const esi = r * 16;
    for (let j = 0; j < 16; j++) t[r * 32 + j] = 64 - 4 * j > esi ? 1 : 0;
    for (let k = 0; k < 16; k++) t[r * 32 + 16 + k] = 4 * k > esi ? 2 : 0;
  }
  for (let r = 12; r < 16; r++) {
    const esi = (r - 12) * 16;
    for (let j = 0; j < 16; j++) t[r * 32 + j] = 4 * j > esi ? 0 : 3;
    for (let k = 0; k < 16; k++) t[r * 32 + 16 + k] = 64 - 4 * k > esi ? 0 : 4;
  }
  return t;
})();

/**
 * 0x4b1754 (D): piksel -> heks, siatka 200x200, ramka tile_coord przy Ox=Oy=Hc=Hr=0
 * (zgodna z hexgrid.ts). -1 poza siatka. Dokladna odwrotnosc srodkow heksow (dowod: 40000/40000).
 */
export function pixelToHexOriginal(px: number, py: number): number {
  if (!Number.isFinite(px) || !Number.isFinite(py)) return -1;
  let x = Math.floor(px);
  const y0 = Math.floor(py);
  let row = Math.floor(y0 / 12);
  x -= row * 16;
  const yres = y0 - 12 * row;
  const q = Math.floor(x / 64);
  row += q;
  x -= q * 64;
  let col = 2 * q;
  if (x >= 32) {
    x -= 32;
    col++;
  }
  const v = PIXEL_HEX_TABLE[x + yres * 32] ?? 0;
  if (v === 1) row -= 1;
  else if (v === 2) {
    col += 1;
    if (col & 1) row -= 1;
  } else if (v === 3) {
    col -= 1;
    if (!(col & 1)) row += 1;
  } else if (v === 4) row += 1;
  const xh = 199 - col;
  if (xh < 0 || xh > 199 || row < 0 || row > 199) return -1;
  return row * 200 + xh;
}
