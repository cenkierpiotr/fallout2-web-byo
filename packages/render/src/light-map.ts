import { HEX_COUNT, TILE_GRID, makeHex, type GameMap, type Hex } from '@f2/engine-core';
import { OBJ_FLAG_HIDDEN, spreadLight, type LightBlocker } from './light-spread.js';

const MAX_INTENSITY = 0x10000;

/** Obiekt z polami swiatla z MAP (light_radius, light_intensity); GameObject ich jeszcze nie niesie. */
export interface LightEmitter {
  hex: Hex;
  elevation: number;
  flags: number;
  /** Typ obiektu (ObjType: 3 = sciana); brak = scenerie. */
  type?: number;
  /** Flagi prototypu (proto+0x18). */
  protoFlags?: number;
  hidden?: boolean;
  lightRadius?: number;
  lightIntensity?: number;
}

/**
 * Statyczna mapa swiatla poziomu: 200x200, 0..1. Rozchodzenie wg f2_obj_light_apply (0x48dc28, D):
 * pierscien k dostaje I - k*step, step = (I-0x28f)/(R+1) (idiv; ujemny krok = jasniej ku brzegom),
 * z cieniowaniem przez sciany i nieprzezroczyste obiekty (`spreadLight`). Zrodla sumuja sie
 * (obciete do 1); `globalLight` (0..1) to podloga.
 */
export class LightMap {
  private readonly data = new Float32Array(HEX_COUNT);
  /** Wklad samych zrodel (0..1), bez podlogi otoczenia. */
  private readonly sources = new Float32Array(HEX_COUNT);
  private ambient = 1;
  private sourcesOn = true;

  constructor() {
    this.data.fill(1);
  }

  rebuildStatic(map: GameMap, elevation: number, globalLight: number): void {
    const acc = new Float64Array(HEX_COUNT);
    const objects = map.objects as LightEmitter[];
    // lista obiektow per hex (0x639da0), w kolejnosci mapy; tylko ten poziom, hexy w siatce
    const byHex = new Map<Hex, LightBlocker[]>();
    for (const o of objects) {
      if (o.elevation !== elevation || o.hex < 0 || o.hex >= HEX_COUNT) continue;
      const b: LightBlocker = {
        elevation: o.elevation,
        flags: o.hidden ? o.flags | OBJ_FLAG_HIDDEN : o.flags,
        type: o.type ?? 2,
        protoFlags: o.protoFlags ?? 0,
      };
      const l = byHex.get(o.hex);
      if (l) l.push(b);
      else byHex.set(o.hex, [b]);
    }
    const none: LightBlocker[] = [];
    for (const o of objects) {
      if (o.elevation !== elevation) continue;
      spreadLight(
        {
          hex: o.hex,
          elevation: o.elevation,
          radius: o.lightRadius ?? 0,
          intensity: o.lightIntensity ?? 0,
          flags: o.hidden ? o.flags | OBJ_FLAG_HIDDEN : o.flags,
        },
        (h) => byHex.get(h) ?? none,
        (h, v) => {
          acc[h] = (acc[h] as number) + v;
        },
      );
    }
    for (let h = 0; h < HEX_COUNT; h++) {
      this.sources[h] = Math.min(1, (acc[h] as number) / MAX_INTENSITY);
    }
    this.setAmbient(globalLight);
  }

  /**
   * Zmienia swiatlo otoczenia (podloga 0..1, np. dzien/noc z zegara) bez przeliczania zrodel.
   * Tanie (40000 porownan), wolane np. co minute gry.
   */
  setAmbient(globalLight: number): void {
    const floor = Math.min(1, Math.max(0, globalLight));
    this.ambient = floor;
    for (let h = 0; h < HEX_COUNT; h++) {
      this.data[h] = Math.max(floor, this.sourcesOn ? (this.sources[h] as number) : 0);
    }
  }

  /**
   * Wlacza/wylacza wklad zrodel swiatla (diagnostyka i porownania wizualne: wylaczone = sama
   * podloga otoczenia). Domyslnie wlaczone; odswieza teksture swiatla.
   */
  setSourcesEnabled(on: boolean): void {
    this.sourcesOn = on;
    this.setAmbient(this.ambient);
  }

  get sourcesEnabled(): boolean {
    return this.sourcesOn;
  }

  /** Liczba heksow oswietlonych przez zrodla (wklad > 0); do statystyk i testow. */
  litHexCount(): number {
    let n = 0;
    for (let h = 0; h < HEX_COUNT; h++) if ((this.sources[h] as number) > 0) n++;
    return n;
  }

  get ambientLevel(): number {
    return this.ambient;
  }

  /** Swiatlo kafla 0..9999 (heks srodkowy kafla: (2tx+1, 2ty)); poza zakresem 0. */
  intensityAtTile(tile: number): number {
    if (!(tile >= 0 && tile < TILE_GRID * TILE_GRID)) return 0;
    const tx = tile % TILE_GRID;
    const ty = (tile - tx) / TILE_GRID;
    return this.data[makeHex(2 * tx + 1, 2 * ty)] as number;
  }

  intensityAt(hex: Hex): number {
    return hex >= 0 && hex < HEX_COUNT ? (this.data[hex] as number) : 0;
  }

  /** 200*200 wartosci 0..1, indeks = hex (pod uniform tekstury swiatla). */
  texture(): Float32Array {
    return this.data;
  }
}
