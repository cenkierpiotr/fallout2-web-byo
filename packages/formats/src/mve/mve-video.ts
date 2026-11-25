/** Dekoder blokow wideo MVE (opkod 0x11). Patrz dokumentacja techniczna (tryby 8, 9, A: status Z). */
export class MveVideoError extends Error {}

export const MVE_VIDEO_HEADER_SIZE = 14;

export interface MveVideoInput {
  /** Cale cialo opkodu 0x11 (z naglowkiem). */
  data: Uint8Array;
  /** Cialo opkodu 0x0F: polbajty, mlodszy pierwszy. */
  map: Uint8Array;
  cur: Uint8Array;
  prev: Uint8Array;
  width: number;
  blocksW: number;
  blocksH: number;
}

export function decodeMveVideoData(o: MveVideoInput): { consumed: number } {
  const { data, map, cur, prev, width, blocksW, blocksH } = o;
  const height = Math.floor(cur.length / width);
  let pos = MVE_VIDEO_HEADER_SIZE;

  const u8 = (): number => {
    if (pos >= data.length) throw new MveVideoError('dane bloku urwane');
    return data[pos++]!;
  };
  const i8 = (): number => (u8() << 24) >> 24;
  /** Czyta n bajtow flag jako tablice bitow LSB-first. */
  const flagBits = (n: number): Uint8Array => {
    const bits = new Uint8Array(n * 8);
    for (let i = 0; i < n; i++) {
      const b = u8();
      for (let k = 0; k < 8; k++) bits[i * 8 + k] = (b >> k) & 1;
    }
    return bits;
  };
  /** Wartosc 2-bitowa o numerze n z tablicy bitow. */
  const two = (bits: Uint8Array, n: number): number => bits[2 * n]! | (bits[2 * n + 1]! << 1);

  let x0 = 0;
  let y0 = 0;
  const put = (px: number, py: number, c: number): void => {
    cur[(y0 + py) * width + x0 + px] = c;
  };
  const copy = (src: Uint8Array, dx: number, dy: number): void => {
    const sx = x0 + dx;
    const sy = y0 + dy;
    if (sx < 0 || sy < 0 || sx + 8 > width || sy + 8 > height)
      throw new MveVideoError('kopia poza obrazem');
    const tmp = new Uint8Array(64);
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) tmp[y * 8 + x] = src[(sy + y) * width + sx + x]!;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) put(x, y, tmp[y * 8 + x]!);
  };
  const motion = (b: number): [number, number] =>
    b < 56
      ? [8 + (b % 7), Math.floor(b / 7)]
      : [-14 + ((b - 56) % 29), 8 + Math.floor((b - 56) / 29)];

  const fill = (fn: (px: number, py: number) => number): void => {
    for (let py = 0; py < 8; py++) for (let px = 0; px < 8; px++) put(px, py, fn(px, py));
  };

  const mode7 = (): void => {
    const p0 = u8();
    const p1 = u8();
    if (p0 <= p1) {
      const f = flagBits(8);
      fill((px, py) => (f[py * 8 + px] ? p1 : p0));
    } else {
      const f = flagBits(2);
      fill((px, py) => (f[(py >> 1) * 4 + (px >> 1)] ? p1 : p0));
    }
  };

  const mode8 = (): void => {
    const p0 = u8();
    const p1 = u8();
    if (p0 <= p1) {
      let a = p0;
      let b = p1;
      for (let q = 0; q < 4; q++) {
        if (q > 0) {
          a = u8();
          b = u8();
        }
        const f = flagBits(2);
        const qx = (q >> 1) * 4;
        const qy = (q & 1) * 4;
        for (let y = 0; y < 4; y++)
          for (let x = 0; x < 4; x++) put(qx + x, qy + y, f[y * 4 + x] ? b : a);
      }
    } else {
      // uklad: P0,P1, 4 B flag, P2,P3, 4 B flag; polowa = pierwsza (P0,P1) i druga (P2,P3)
      const fa = flagBits(4);
      const p2 = u8();
      const p3 = u8();
      const fb = flagBits(4);
      if (p2 <= p3) {
        // podzial pionowy: polowa 4x8, indeks bitu y*4+x (bajt = dwa wiersze)
        fill((px, py) => {
          const f = px < 4 ? fa : fb;
          const bit = f[py * 4 + (px & 3)];
          return px < 4 ? (bit ? p1 : p0) : bit ? p3 : p2;
        });
      } else {
        // podzial poziomy: polowa 8x4, bajt = wiersz
        fill((px, py) => {
          const f = py < 4 ? fa : fb;
          const bit = f[(py & 3) * 8 + px];
          return py < 4 ? (bit ? p1 : p0) : bit ? p3 : p2;
        });
      }
    }
  };

  const mode9 = (): void => {
    const p = [u8(), u8(), u8(), u8()];
    const a = p[0]! <= p[1]!;
    const b = p[2]! <= p[3]!;
    if (a && b) {
      const f = flagBits(16);
      fill((px, py) => p[two(f, py * 8 + px)]!);
    } else if (a) {
      const f = flagBits(4);
      fill((px, py) => p[two(f, (py >> 1) * 4 + (px >> 1))]!);
    } else if (b) {
      const f = flagBits(8);
      fill((px, py) => p[two(f, py * 4 + (px >> 1))]!);
    } else {
      const f = flagBits(8);
      fill((px, py) => p[two(f, (py >> 1) * 8 + px)]!);
    }
  };

  const modeA = (): void => {
    let p = [u8(), u8(), u8(), u8()];
    if (p[0]! <= p[1]!) {
      for (let q = 0; q < 4; q++) {
        if (q > 0) p = [u8(), u8(), u8(), u8()];
        const f = flagBits(4);
        const qx = (q >> 1) * 4;
        const qy = (q & 1) * 4;
        for (let y = 0; y < 4; y++)
          for (let x = 0; x < 4; x++) put(qx + x, qy + y, p[two(f, y * 4 + x)]!);
      }
    } else {
      // uklad: P0..P3, 8 B flag (rowna polowa), P4..P7, 8 B flag
      const fa = flagBits(8);
      const r = [u8(), u8(), u8(), u8()];
      const fb = flagBits(8);
      if (r[0]! <= r[1]!) {
        // podzial pionowy: polowa 4x8, indeks y*4+x
        fill((px, py) => (px < 4 ? p : r)[two(px < 4 ? fa : fb, py * 4 + (px & 3))]!);
      } else {
        // podzial poziomy: polowa 8x4, 2 B na wiersz
        fill((px, py) => (py < 4 ? p : r)[two(py < 4 ? fa : fb, (py & 3) * 8 + px)]!);
      }
    }
  };

  const total = blocksW * blocksH;
  for (let i = 0; i < total; i++) {
    x0 = (i % blocksW) * 8;
    y0 = Math.floor(i / blocksW) * 8;
    if (y0 + 8 > height || x0 + 8 > width) throw new MveVideoError('blok poza obrazem');
    const mode = ((map[i >> 1] ?? 0) >> ((i & 1) * 4)) & 15;
    switch (mode) {
      case 0:
        copy(prev, 0, 0);
        break;
      case 1:
      case 6:
        break;
      case 2: {
        const [dx, dy] = motion(u8());
        copy(cur, dx, dy);
        break;
      }
      case 3: {
        const [dx, dy] = motion(u8());
        copy(cur, -dx, -dy);
        break;
      }
      case 4: {
        const b = u8();
        copy(prev, -8 + (b & 15), -8 + (b >> 4));
        break;
      }
      case 5: {
        const dx = i8();
        const dy = i8();
        copy(prev, dx, dy);
        break;
      }
      case 7:
        mode7();
        break;
      case 8:
        mode8();
        break;
      case 9:
        mode9();
        break;
      case 10:
        modeA();
        break;
      case 11:
        fill(() => u8());
        break;
      case 12: {
        const c = Array.from({ length: 16 }, () => u8());
        fill((px, py) => c[(py >> 1) * 4 + (px >> 1)]!);
        break;
      }
      case 13: {
        const c = Array.from({ length: 4 }, () => u8());
        fill((px, py) => c[(py >> 2) * 2 + (px >> 2)]!);
        break;
      }
      case 14: {
        const c = u8();
        fill(() => c);
        break;
      }
      default: {
        const p0 = u8();
        const p1 = u8();
        fill((px, py) => ((px + py) & 1 ? p1 : p0));
      }
    }
  }
  return { consumed: pos - MVE_VIDEO_HEADER_SIZE };
}
