import { FormatError } from '../errors.js';
import { ByteReader } from '../io/reader.js';

export interface FrmFrame {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  pixels: Uint8Array;
}

export interface Frm {
  version: number;
  fps: number;
  actionFrame: number;
  framesPerDirection: number;
  shiftX: Int16Array;
  shiftY: Int16Array;
  directionOffsets: Uint32Array;
  dataSize: number;
  directions: FrmFrame[][];
  distinctDirections: number;
}

export const FRM_HEADER_SIZE = 62;
export const FRM_MAX_FRAMES_PER_DIRECTION = 512;
export const FRM_MAX_FRAME_PIXELS = 16_777_216;

export function parseFrm(bytes: Uint8Array, opts?: { singleDirection?: number }): Frm {
  if (bytes.length < FRM_HEADER_SIZE) {
    throw new FormatError('frm', 'plik krotszy niz naglowek (62 B)', 0);
  }
  const r = new ByteReader(bytes);
  const version = r.u32be();
  if (version !== 4) throw new FormatError('frm', `version: oczekiwano 4, otrzymano ${version}`, 0);
  const fps = r.u16be();
  const actionFrame = r.u16be();
  const framesPerDirection = r.u16be();
  if (framesPerDirection < 1 || framesPerDirection > FRM_MAX_FRAMES_PER_DIRECTION) {
    throw new FormatError('frm', `framesPerDirection: ${framesPerDirection} poza zakresem`, 8);
  }
  const shiftX = new Int16Array(6);
  const shiftY = new Int16Array(6);
  const directionOffsets = new Uint32Array(6);
  for (let i = 0; i < 6; i++) shiftX[i] = r.i16be();
  for (let i = 0; i < 6; i++) shiftY[i] = r.i16be();
  for (let i = 0; i < 6; i++) directionOffsets[i] = r.u32be();
  const dataSize = r.u32be();

  const single = opts?.singleDirection;
  if (single !== undefined) {
    if (!Number.isInteger(single) || single < 0 || single > 5) {
      throw new FormatError('frm', `singleDirection: ${single} poza zakresem 0..5`);
    }
  } else if (dataSize !== bytes.length - FRM_HEADER_SIZE) {
    throw new FormatError(
      'frm',
      `dataSize: ${dataSize} != ${bytes.length - FRM_HEADER_SIZE} (rozmiar pliku - 62)`,
      58,
    );
  }

  const directions: FrmFrame[][] = [[], [], [], [], [], []];
  const cache = new Map<number, FrmFrame[]>();
  for (let d = 0; d < 6; d++) {
    if (single !== undefined && d !== single) continue;
    const off = directionOffsets[d]!;
    const cached = cache.get(off);
    if (cached) {
      directions[d] = cached;
      continue;
    }
    const start = FRM_HEADER_SIZE + off;
    if (start > bytes.length) {
      throw new FormatError('frm', `dirOffset[${d}]: ${off} poza plikiem`, 46 + d * 4);
    }
    const fr = new ByteReader(bytes, start);
    const frames: FrmFrame[] = [];
    for (let i = 0; i < framesPerDirection; i++) {
      if (fr.remaining < 12) {
        throw new FormatError('frm', `klatka ${i} kierunku ${d}: obciety naglowek`, fr.pos);
      }
      const hdrPos = fr.pos;
      const width = fr.u16be();
      const height = fr.u16be();
      const size = fr.u32be();
      const offsetX = fr.i16be();
      const offsetY = fr.i16be();
      if (size !== width * height) {
        throw new FormatError(
          'frm',
          `size: ${size} != width*height (${width}x${height})`,
          hdrPos + 4,
        );
      }
      if (size > FRM_MAX_FRAME_PIXELS) {
        throw new FormatError('frm', `size: ${size} przekracza limit klatki`, hdrPos + 4);
      }
      if (size > fr.remaining) {
        throw new FormatError(
          'frm',
          `pixels: klatka ${i} kierunku ${d} wychodzi poza plik`,
          fr.pos,
        );
      }
      frames.push({ width, height, offsetX, offsetY, pixels: fr.bytes(size) });
    }
    cache.set(off, frames);
    directions[d] = frames;
  }

  return {
    version,
    fps,
    actionFrame,
    framesPerDirection,
    shiftX,
    shiftY,
    directionOffsets,
    dataSize,
    directions,
    distinctDirections: cache.size,
  };
}

/** `.fr0`..`.fr5` -> 0..5; `.frm` i inne -> undefined. */
export function frmExtensionDirection(name: string): number | undefined {
  const m = /\.fr([0-5])$/i.exec(name);
  return m ? Number(m[1]) : undefined;
}
