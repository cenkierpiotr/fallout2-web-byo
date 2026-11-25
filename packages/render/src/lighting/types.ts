/** Zrodlo swiatla z PRO/obiektow mapy (kontrakt M6). intensity 0..65536. */
export interface MapLightSource {
  hex: number;
  elevation: number;
  intensity: number;
  radius: number;
  /** Opcjonalny kolor RGB 0..255 (domyslnie bialy). */
  color?: readonly [number, number, number];
}

/** Swiatlo punktowe w pikselach swiata. */
export interface PointLight {
  x: number;
  y: number;
  z: number;
  color: [number, number, number];
  radius: number;
  intensity: number;
}

export type Vec3 = readonly [number, number, number];

/** Prostokat w koordynatach hex (kolumna x, wiersz y), wlacznie. */
export interface HexRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const MAX_POINT_LIGHTS = 16;

/**
 * Stan oswietlenia 2.5D dla jednej klatki, przekazywany do urzadzenia (`GfxDevice.setLighting`).
 * `enabled: false` albo brak stanu = klasyczna sciezka rysowania, bit w bit jak przed M9.
 */
export interface LitFrameState {
  enabled: boolean;
  ambient: Vec3;
  sunDir: Vec3;
  normalStrength: number;
  lightCount: number;
  /** UBO swiatel: 16 * [x,y,z,radius, r,g,b,intensity] (packLights). */
  lightsUbo: Float32Array;
  /** Tekstura swiatla per hex (RGB8, w*h*3); `version` rosnie przy zmianie danych. */
  lightMap?: { data: Uint8Array; width: number; height: number; version: number };
  /** Parallax: przesuniecie kamery i wspolczynnik (zerowe gdy wylaczony). */
  cameraDelta: [number, number];
  parallaxFactor: number;
  time: number;
}
