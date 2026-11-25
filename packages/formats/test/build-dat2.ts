import { deflateSync } from 'node:zlib';

interface BuildFile {
  name: string;
  data: Uint8Array;
  compress: boolean;
}

/** Buduje syntetyczny DAT2: dane, drzewo (count + wpisy), stopka (treeSize, dataSize). */
export function buildDat2(files: BuildFile[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const meta: {
    name: string;
    compressed: boolean;
    unpacked: number;
    packed: number;
    offset: number;
  }[] = [];
  let offset = 0;
  for (const f of files) {
    const chunk = f.compress ? new Uint8Array(deflateSync(f.data)) : f.data;
    chunks.push(chunk);
    meta.push({
      name: f.name,
      compressed: f.compress,
      unpacked: f.data.length,
      packed: chunk.length,
      offset,
    });
    offset += chunk.length;
  }
  const names = meta.map((m) => Buffer.from(m.name, 'latin1'));
  const treeSize = 4 + names.reduce((s, n) => s + n.length + 17, 0);
  const total = offset + treeSize + 8;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  dv.setUint32(p, meta.length, true);
  p += 4;
  meta.forEach((m, i) => {
    const n = names[i]!;
    dv.setUint32(p, n.length, true);
    p += 4;
    out.set(n, p);
    p += n.length;
    out[p++] = m.compressed ? 1 : 0;
    dv.setUint32(p, m.unpacked, true);
    dv.setUint32(p + 4, m.packed, true);
    dv.setUint32(p + 8, m.offset, true);
    p += 12;
  });
  dv.setUint32(p, treeSize, true);
  dv.setUint32(p + 4, total, true);
  return out;
}
