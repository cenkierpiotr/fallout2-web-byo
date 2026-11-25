const P: number[] = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26,
  27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 47, 51, 56, 61, 66, 72, 79,
  86, 94, 102, 112, 122, 133, 145, 158, 173, 189, 206, 225, 245, 267, 292, 318, 348, 379, 414, 452,
  493, 538, 587, 640, 699, 763, 832, 908, 991, 1081, 1180, 1288, 1405, 1534, 1673, 1826, 1993, 2175,
  2373, 2590, 2826, 3084, 3365, 3672, 4008, 4373, 4772, 5208, 5683, 6202, 6767, 7385, 8059, 8794,
  9597, 10472, 11428, 12471, 13609, 14851, 16206, 17685, 19298, 21060, 22981, 25078, 27367, 29864,
  32589,
];
// Tablica z silnik gry (plik 0x10d1e0, 256 x i16, zgodna co do wartosci).
// 0..119 rosnaco, 120..127 = -29973..-1, 128..136 = 1,1,5481..29973, 137..255 = -P[119..1].
const MID_NEG = [-29973, -26728, -23186, -19322, -15105, -10503, -5481, -1];
const MID_POS = [1, 1, 5481, 10503, 15105, 19322, 23186, 26728, 29973];

export const MVE_DELTA_TABLE: Int16Array = (() => {
  const t = new Int16Array(256);
  for (let i = 0; i < 120; i++) t[i] = P[i]!;
  for (let i = 0; i < 8; i++) t[120 + i] = MID_NEG[i]!;
  for (let i = 0; i < 9; i++) t[128 + i] = MID_POS[i]!;
  for (let j = 0; j < 119; j++) t[255 - j] = -P[j + 1]!;
  return t;
})();

export interface MveAudioInit {
  sampleRate: number;
  stereo: boolean;
  bits16: boolean;
  compressed: boolean;
}

export function parseMveAudioInit(data: DataView): MveAudioInit {
  if (data.byteLength < 10) throw new Error('MVE audio init za krotki');
  const flags = data.getUint16(2, true);
  return {
    sampleRate: data.getUint16(4, true),
    stereo: (flags & 1) !== 0,
    bits16: (flags & 2) !== 0,
    compressed: (flags & 4) !== 0,
  };
}

// silnik gry 0x4f6992..0x4f699f: `add ax, [tab+bl*2]` (16-bit, zawijanie bez nasycenia).
const wrap16 = (v: number): number => (v << 16) >> 16;

/** Ciało opkodu 08. Zwraca przeplecione L,R; pierwsze dwie probki to predyktory naglowka. */
export function decodeMveAudioFrame(data: DataView): Int16Array {
  if (data.byteLength < 10) throw new Error('MVE audio ramka za krotka');
  const pairs = Math.floor((data.byteLength - 10) / 2);
  const out = new Int16Array(2 + pairs * 2);
  let l = data.getInt16(6, true);
  let r = data.getInt16(8, true);
  out[0] = l;
  out[1] = r;
  for (let i = 0; i < pairs; i++) {
    l = wrap16(l + MVE_DELTA_TABLE[data.getUint8(10 + i * 2)]!);
    r = wrap16(r + MVE_DELTA_TABLE[data.getUint8(11 + i * 2)]!);
    out[2 + i * 2] = l;
    out[3 + i * 2] = r;
  }
  return out;
}
