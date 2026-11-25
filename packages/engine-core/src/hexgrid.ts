/**
 * Geometria siatki heksow 200x200 i kafli 100x100 wg dokumentacja techniczna
 * Czysta arytmetyka, bez zaleznosci.
 *
 * Uklad swiata: lewy gorny rog obrysu 32x16 heksa o kolumnie ekranowej c=0 i wierszu r=0
 * (czyli x=199, y=0) lezy w (0,0). Wzgledne przesuniecia sa zgodne z silnikiem (D);
 * absolutny poczatek jest konwencja tego modulu (silnik liczy wzgledem srodka widoku).
 */

export const HEX_GRID_WIDTH = 200;
export const HEX_GRID_HEIGHT = 200;
export const HEX_COUNT = 40000;
export const TILE_GRID = 100;
export const ELEVATIONS = 3;

/** Numer heksa 0..39999 (hex = y * 200 + x). */
export type Hex = number;
/** 0 NE, 1 E, 2 SE, 3 SW, 4 W, 5 NW. */
export type Direction = 0 | 1 | 2 | 3 | 4 | 5;

/** Przyrosty (x, y) wg kierunku; tablice [kierunek] dla parzystego i nieparzystego x. */
const DX_EVEN = [-1, -1, 0, 1, 1, 0] as const;
const DY_EVEN = [0, 1, 1, 1, 0, -1] as const;
const DX_ODD = [-1, -1, 0, 1, 1, 0] as const;
const DY_ODD = [-1, 0, 1, 0, -1, -1] as const;

function valid(h: Hex): boolean {
  return Number.isInteger(h) && h >= 0 && h < HEX_COUNT;
}

/** Kolumna x heksa (0..199) lub -1 poza zakresem. */
export function hexX(h: Hex): number {
  return valid(h) ? h % HEX_GRID_WIDTH : -1;
}

/** Wiersz y heksa (0..199) lub -1 poza zakresem. */
export function hexY(h: Hex): number {
  return valid(h) ? Math.floor(h / HEX_GRID_WIDTH) : -1;
}

/** Numer heksa z (x, y) lub -1 poza siatka. */
export function makeHex(x: number, y: number): Hex {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return -1;
  if (x < 0 || x >= HEX_GRID_WIDTH || y < 0 || y >= HEX_GRID_HEIGHT) return -1;
  return y * HEX_GRID_WIDTH + x;
}

/** Lewy gorny rog obrysu 32x16 dla (x, y); dziala tez poza siatka (bez ograniczen). */
function posX(x: number, y: number): number {
  const c = 199 - x;
  return 24 * c + 8 * (c & 1) + 16 * y;
}
function posY(x: number, y: number): number {
  const c = 199 - x;
  return -6 * c + 6 * (c & 1) + 12 * y;
}

/** Srodek heksa w pikselach oryginalu. RangeError poza zakresem. */
export function hexToWorld(h: Hex): { x: number; y: number } {
  if (!valid(h)) throw new RangeError(`hexToWorld: heks poza zakresem: ${h}`);
  const x = h % HEX_GRID_WIDTH;
  const y = (h - x) / HEX_GRID_WIDTH;
  return { x: posX(x, y) + 16, y: posY(x, y) + 8 };
}

/** Piksel -> najblizszy (srodkiem) heks; -1 poza siatka. */
export function worldToHex(px: number, py: number): Hex {
  if (!Number.isFinite(px) || !Number.isFinite(py)) return -1;
  const x0 = px - 16;
  const y0 = py - 8;
  // Odwrocenie wzoru dla parzystych kolumn ekranowych c=2k: (48k+16r, -12k+12r).
  const r0 = Math.floor((x0 + 4 * y0) / 64);
  const k0 = Math.floor((x0 - 16 * r0) / 48);
  let best = Infinity;
  let bc = 0;
  let br = 0;
  for (let c = 2 * k0 - 2; c <= 2 * k0 + 3; c++) {
    for (let r = r0 - 2; r <= r0 + 2; r++) {
      const cx = 24 * c + 8 * (c & 1) + 16 * r + 16;
      const cy = -6 * c + 6 * (c & 1) + 12 * r + 8;
      const d = (px - cx) * (px - cx) + (py - cy) * (py - cy);
      if (d < best) {
        best = d;
        bc = c;
        br = r;
      }
    }
  }
  return makeHex(199 - bc, br);
}

/** Kierunek z przesuniecia pikselowego (dx, dy) wg f2_tile_dir_from_to. */
function dirFromDelta(dx: number, dy: number): Direction {
  if (dx === 0) return dy < 0 ? 0 : 2;
  const th = Math.trunc(Math.atan2(-dy, dx) * 180.0 * 0.3183098861837907);
  let v = 90 - th;
  if (v < 0) v = 450 - th;
  return Math.min(Math.trunc(v / 60), 5) as Direction;
}

/** Heks po `steps` krokach w kierunku d; zatrzymuje sie na krawedzi siatki (f2_tile_num_in_direction). */
export function hexInDirection(h: Hex, d: Direction, steps = 1): Hex {
  if (!valid(h)) return -1;
  let x = h % HEX_GRID_WIDTH;
  let y = (h - x) / HEX_GRID_WIDTH;
  for (let i = 0; i < steps; i++) {
    if (x === 0 || x === 199 || y === 0 || y === 199) break;
    if ((x & 1) === 0) {
      x += DX_EVEN[d];
      y += DY_EVEN[d];
    } else {
      x += DX_ODD[d];
      y += DY_ODD[d];
    }
  }
  return y * HEX_GRID_WIDTH + x;
}

/** Sasiedzi w kolejnosci kierunkow 0..5, bez tych poza siatka. */
export function hexNeighbors(h: Hex): Hex[] {
  if (!valid(h)) return [];
  const x = h % HEX_GRID_WIDTH;
  const y = (h - x) / HEX_GRID_WIDTH;
  const out: Hex[] = [];
  for (let d = 0; d < 6; d++) {
    const nx = x + ((x & 1) === 0 ? DX_EVEN[d]! : DX_ODD[d]!);
    const ny = y + ((x & 1) === 0 ? DY_EVEN[d]! : DY_ODD[d]!);
    const n = makeHex(nx, ny);
    if (n >= 0) out.push(n);
  }
  return out;
}

/** Odleglosc (f2_tile_dist): chciwy marsz; 9999 gdy argument poza siatka. Bez alokacji. */
export function hexDistance(a: Hex, b: Hex): number {
  if (!valid(a) || !valid(b)) return 9999;
  const bx = b % HEX_GRID_WIDTH;
  const by = (b - bx) / HEX_GRID_WIDTH;
  const bpx = posX(bx, by);
  const bpy = posY(bx, by);
  let x = a % HEX_GRID_WIDTH;
  let y = (a - x) / HEX_GRID_WIDTH;
  let n = 0;
  while (x !== bx || y !== by) {
    if (n > 2 * HEX_GRID_WIDTH + 2 * HEX_GRID_HEIGHT)
      throw new Error('hexDistance: marsz nie dochodzi do celu');
    const d = dirFromDelta(bpx - posX(x, y), bpy - posY(x, y));
    if ((x & 1) === 0) {
      x += DX_EVEN[d];
      y += DY_EVEN[d];
    } else {
      x += DX_ODD[d];
      y += DY_ODD[d];
    }
    n++;
  }
  return n;
}

/** Kierunek z heksa `from` do `to` (f2_tile_dir_from_to); from == to daje 2. */
export function directionTo(from: Hex, to: Hex): Direction {
  if (!valid(from) || !valid(to)) throw new RangeError('directionTo: heks poza zakresem');
  const fx = from % HEX_GRID_WIDTH;
  const fy = (from - fx) / HEX_GRID_WIDTH;
  const tx = to % HEX_GRID_WIDTH;
  const ty = (to - tx) / HEX_GRID_WIDTH;
  return dirFromDelta(posX(tx, ty) - posX(fx, fy), posY(tx, ty) - posY(fx, fy));
}

/** Lewy gorny rog obrysu 80x36 kafla `i` (0..9999): pozycja heksa (2tx+1, 2ty) + (-16, -2). */
export function tileIndexToWorld(i: number): { x: number; y: number } {
  if (!Number.isInteger(i) || i < 0 || i >= TILE_GRID * TILE_GRID) {
    throw new RangeError(`tileIndexToWorld: kafel poza zakresem: ${i}`);
  }
  const tx = i % TILE_GRID;
  const ty = (i - tx) / TILE_GRID;
  return { x: posX(2 * tx + 1, 2 * ty) - 16, y: posY(2 * tx + 1, 2 * ty) - 2 };
}

/** Kafel zawierajacy heks: (y>>1)*100 + ((x-1)>>1); -1 dla x == 0 lub poza zakresem. */
export function hexToTile(h: Hex): number {
  if (!valid(h)) return -1;
  const x = h % HEX_GRID_WIDTH;
  if (x === 0) return -1;
  const y = (h - x) / HEX_GRID_WIDTH;
  return (y >> 1) * TILE_GRID + ((x - 1) >> 1);
}

/** Czy heks lezy w prostokacie wspolrzednych heksow (granice wlacznie). */
export function isHexInRect(
  h: Hex,
  rect: { x0: number; y0: number; x1: number; y1: number },
): boolean {
  if (!valid(h)) return false;
  const x = h % HEX_GRID_WIDTH;
  const y = (h - x) / HEX_GRID_WIDTH;
  return x >= rect.x0 && x <= rect.x1 && y >= rect.y0 && y <= rect.y1;
}
