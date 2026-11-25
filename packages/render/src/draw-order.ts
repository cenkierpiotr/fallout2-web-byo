import { hexToWorld, type GameObject } from '@f2/engine-core';

/**
 * Klucz kolejnosci rysowania obiektow (specs/render-order.md): poziom, flat przed nie-flat
 * (globalnie na poziomie), kolejnosc komorek widoku (skan ekranu: y, potem x srodka heksa; Z),
 * w heksie klucz wstawiania (y, x) z przesunieciem klatki FRM, remis = kolejnosc na liscie (stabilnie).
 */
export interface DrawKey {
  elevation: number;
  flat: 0 | 1;
  hexY: number;
  hexX: number;
  shiftY: number;
  shiftX: number;
  order: number;
}

export interface FrameShift {
  x: number;
  y: number;
}

const FLAG_FLAT = 0x8;
const NO_SHIFT: FrameShift = { x: 0, y: 0 };

export function drawKey(
  obj: GameObject,
  orderInHex: number,
  shift: FrameShift = NO_SHIFT,
): DrawKey {
  // obiekty bez heksa (-1) laduja na koncu danego poziomu/flat
  const p = obj.hex >= 0 ? hexToWorld(obj.hex) : { x: Infinity, y: Infinity };
  return {
    elevation: obj.elevation,
    flat: (obj.flags & FLAG_FLAT) !== 0 ? 1 : 0,
    hexY: p.y,
    hexX: p.x,
    shiftY: shift.y,
    shiftX: shift.x,
    order: orderInHex,
  };
}

/** Flat ma byc rysowany PRZED nie-flat, czyli flat=1 jest "mniejszy" w kolejnosci rysowania. */
export function compareDrawKeys(a: DrawKey, b: DrawKey): number {
  if (a.elevation !== b.elevation) return a.elevation - b.elevation;
  if (a.flat !== b.flat) return b.flat - a.flat;
  if (a.hexY !== b.hexY) return a.hexY < b.hexY ? -1 : 1;
  if (a.hexX !== b.hexX) return a.hexX < b.hexX ? -1 : 1;
  if (a.shiftY !== b.shiftY) return a.shiftY - b.shiftY;
  if (a.shiftX !== b.shiftX) return a.shiftX - b.shiftX;
  return a.order - b.order;
}

/**
 * Nowa tablica w kolejnosci rysowania. Kolejnosc wejsciowa obiektow w tym samym heksie
 * (i o rownym kluczu) jest zachowana. `shiftOf` dostarcza przesuniecie klatki dla rotacji obiektu.
 */
export function sortForDraw(
  objs: readonly GameObject[],
  shiftOf?: (obj: GameObject) => FrameShift | undefined,
): GameObject[] {
  const counters = new Map<number, number>();
  const keyed = objs.map((obj) => {
    const n = counters.get(obj.hex) ?? 0;
    counters.set(obj.hex, n + 1);
    return { obj, key: drawKey(obj, n, shiftOf?.(obj)) };
  });
  keyed.sort((a, b) => compareDrawKeys(a.key, b.key));
  return keyed.map((k) => k.obj);
}
