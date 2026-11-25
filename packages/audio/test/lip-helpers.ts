/** Buduje syntetyczny plik LIP v2 (big-endian) do testow. */
export interface LipSpec {
  version?: number;
  pcmBytes?: number;
  phonemes: number[];
  /** Pary [type, offset]; domyslnie phonemes.length + 1 markerow. */
  markers: [number, number][];
  acmName?: string;
  phonemeCountField?: number;
  markerCountField?: number;
  trailing?: number;
}

export function buildLip(s: LipSpec): Uint8Array {
  const n = s.phonemes.length;
  const m = s.markers.length;
  const buf = new Uint8Array(44 + n + 8 * m + (s.trailing ?? 0));
  const dv = new DataView(buf.buffer);
  dv.setUint32(0, s.version ?? 2);
  dv.setUint32(4, 0x5800);
  dv.setUint32(16, s.pcmBytes ?? s.markers[m - 1]?.[1] ?? 0);
  dv.setUint32(20, s.phonemeCountField ?? n);
  dv.setUint32(28, s.markerCountField ?? m);
  const name = s.acmName ?? 'TEST';
  for (let i = 0; i < name.length && i < 8; i++) buf[32 + i] = name.charCodeAt(i);
  buf.set([0x56, 0x4f, 0x43, 0], 40);
  buf.set(s.phonemes, 44);
  s.markers.forEach(([t, o], i) => {
    dv.setUint32(44 + n + 8 * i, t);
    dv.setUint32(44 + n + 8 * i + 4, o);
  });
  return buf;
}
