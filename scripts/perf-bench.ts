/**
 * Mikrobenchmarki wczytywania (Node, dane syntetyczne, bez plikow gry):
 *   pnpm exec tsx scripts/perf-bench.ts            (tekst)
 *   pnpm exec tsx scripts/perf-bench.ts --json     (JSON)
 * Kazdy wynik to mediana z kilku powtorzen (ms); nizej = lepiej.
 */
import { zlibSync } from '../packages/formats/node_modules/fflate/esm/browser.js';
import {
  bufferSource,
  frameToRgba,
  parseDat2Tree,
  parseFrm,
  parseMap,
  readDat2Entry,
  readDat2Index,
  type Dat2Entry,
} from '../packages/formats/src/index.js';
import { MapLoader } from '../packages/engine-core/src/map-loader.js';
import { SpriteBatch } from '../packages/render/src/sprite-batch.js';

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function median(a: number[]): number {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)]!;
}

async function time(runs: number, fn: () => unknown): Promise<number> {
  await fn(); // rozgrzewka
  const t: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    await fn();
    t.push(performance.now() - t0);
  }
  return median(t);
}

const u32le = (n: number): number[] => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, n >>> 24];

/** Syntetyczny DAT2: wpisy z kompresowalnymi danymi (jak FRM/PRO/MAP). */
function buildDat(entries: number, unpacked: number, compressed: boolean): Uint8Array {
  const r = rng(7);
  const chunks: Uint8Array[] = [];
  const meta: { name: string; packed: number; unpacked: number; offset: number }[] = [];
  let off = 0;
  for (let i = 0; i < entries; i++) {
    const raw = new Uint8Array(unpacked);
    for (let j = 0; j < unpacked; j++) raw[j] = r() < 0.7 ? 0 : (r() * 40) | 0;
    const data = compressed ? zlibSync(raw) : raw;
    chunks.push(data);
    meta.push({ name: `art\\critters\\file${i}.frm`, packed: data.length, unpacked, offset: off });
    off += data.length;
  }
  const tree: number[] = u32le(entries);
  for (const m of meta) {
    tree.push(...u32le(m.name.length));
    for (const c of m.name) tree.push(c.charCodeAt(0));
    tree.push(compressed ? 1 : 0, ...u32le(m.unpacked), ...u32le(m.packed), ...u32le(m.offset));
  }
  const total = off + tree.length + 8;
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  out.set(tree, p);
  p += tree.length;
  out.set([...u32le(tree.length), ...u32le(total)], p);
  return out;
}

function buildFrm(w: number, h: number, frames: number): Uint8Array {
  const fsz = 12 + w * h;
  const data = frames * fsz * 6;
  const b = new Uint8Array(62 + data);
  const v = new DataView(b.buffer);
  v.setUint32(0, 4);
  v.setUint16(4, 10);
  v.setUint16(8, frames);
  for (let d = 0; d < 6; d++) v.setUint32(34 + d * 4, d * frames * fsz);
  v.setUint32(58, data);
  let p = 62;
  for (let d = 0; d < 6; d++)
    for (let f = 0; f < frames; f++) {
      v.setUint16(p, w);
      v.setUint16(p + 2, h);
      v.setUint32(p + 4, w * h);
      for (let i = 0; i < w * h; i++) b[p + 12 + i] = i & 255;
      p += fsz;
    }
  return b;
}

/** Mapa v20: 1 poziom (flags=12 -> poziomy 1 i 2 brak), 10000 kafli, N obiektow typu misc. */
function buildMap(objects: number, distinctPids = 1): ArrayBuffer {
  const OBJ_U32 = 22; // naglowek obiektu 21 u32 + typeFlags
  const words = 16 + 44 + 10000 + 5 + 4 + objects * OBJ_U32;
  const b = new ArrayBuffer(words * 4);
  const v = new DataView(b);
  let p = 0;
  const w = (n: number): void => {
    v.setUint32(p, n >>> 0);
    p += 4;
  };
  w(20);
  for (let i = 0; i < 4; i++) w(0); // nazwa 16 B
  w(0);
  w(0);
  w(0);
  w(0);
  w(0);
  w(12);
  w(0);
  w(0);
  w(1);
  w(0); // header do `time`
  p += 44 * 4;
  for (let i = 0; i < 10000; i++) w((i & 0xff) | (((i >> 3) & 0xff) << 16));
  for (let t = 0; t < 5; t++) w(0); // skrypty
  w(objects);
  w(objects); // total i liczba obiektow poziomu 0; zera kolejnych 2 liczb czyta parser z poczatku rekordow
  for (let i = 0; i < objects; i++) {
    for (let j = 0; j < 11; j++) w(j === 3 ? i : 0);
    w(0x5000100 + (i % distinctPids)); // pid misc, poza exit grid
    for (let j = 0; j < 9; j++) w(0);
    w(0); // typeFlags
  }
  return b;
}

async function main(): Promise<void> {
  const res: Record<string, number> = {};

  const datC = buildDat(2000, 6000, true);
  const datIdx = buildDat(30000, 16, false);

  // 1) Parsowanie drzewa DAT (30 000 wpisow, tak jak w master.dat)
  const idx = await readDat2Index(bufferSource(datIdx));
  const treeBytes = datIdx.subarray(datIdx.length - 8 - idx.treeSize, datIdx.length - 8);
  res['dat_tree_parse_30000'] = await time(7, () => parseDat2Tree(treeBytes));
  res['dat_index_build_30000'] = await time(7, () => readDat2Index(bufferSource(datIdx)));

  // 2) Rozpakowanie wpisow (2000 wpisow po 6 KB)
  const src = bufferSource(datC);
  const idxC = await readDat2Index(src);
  const ents: Dat2Entry[] = idxC.entries;
  res['dat_inflate_2000x6KB'] = await time(3, async () => {
    for (const e of ents) await readDat2Entry(src, e);
  });

  // 3) FRM + RGBA
  const frm = buildFrm(80, 60, 8);
  res['frm_parse_x2000'] = await time(5, () => {
    for (let i = 0; i < 2000; i++) parseFrm(frm);
  });
  const parsed = parseFrm(frm);
  const pal = new Uint8Array(1024).map((_, i) => (i * 7) & 255);
  const out = new Uint8ClampedArray(80 * 60 * 4);
  res['frm_to_rgba_x2000_frames'] = await time(5, () => {
    const f = parsed.directions[0]![0]!;
    for (let i = 0; i < 2000; i++) frameToRgba(f, pal, out);
  });

  // 4) Parsowanie mapy (10000 kafli + 4000 obiektow)
  const map = buildMap(4000);
  res['map_parse_4000obj'] = await time(9, () => parseMap(map, () => 0));

  // 4b) Cale wczytanie mapy: 4000 obiektow, 300 roznych prototypow, 1 ms opoznienia na odczyt PRO
  // (VFS na prawdziwej przegladarce: OPFS/File = asynchroniczny odczyt + rozpakowanie).
  const bigMap = buildMap(4000, 300);
  const cache = new Map<number, unknown>();
  const protos = {
    peek: (pid: number) => cache.get(pid),
    get: async (pid: number) => {
      const hit = cache.get(pid);
      if (hit) return hit;
      await new Promise((r) => setTimeout(r, 1));
      const proto = { fid: 0, flags: 0 };
      cache.set(pid, proto);
      return proto;
    },
    subtypeTable: async () => new Map<number, number>(),
    placeholderFor: () => ({ fid: 0, flags: 0 }),
  };
  const vfs = {
    layers: [],
    resolve: (p: string) => (p.startsWith('data/') ? undefined : {}),
    open: async () => new Uint8Array(bigMap),
  };
  res['map_load_4000obj_300proto_1ms'] = await time(3, async () => {
    cache.clear();
    await new MapLoader(vfs as never, protos as never).load('X');
  });

  // 5) SpriteBatch w stanie ustalonym: 200 klatek x 6000 sprite'ow, pomiar sterty
  const batch = new SpriteBatch();
  const tex = [1, 2, 3].map((id) => ({ id, width: 2048, height: 2048, linear: false }));
  const frame = (): void => {
    batch.clear();
    for (let i = 0; i < 6000; i++)
      batch.pushRect(tex[i % 3] as never, i & 63, i & 31, 80, 36, i, i, 80, 36);
    batch.groups();
  };
  for (let i = 0; i < 20; i++) frame();
  const g = (globalThis as { gc?: () => void }).gc;
  g?.();
  const h0 = process.memoryUsage().heapUsed;
  const t0 = performance.now();
  for (let i = 0; i < 200; i++) frame();
  res['sprite_batch_frame_6000_ms'] = (performance.now() - t0) / 200;
  res['sprite_batch_alloc_kb_per_frame'] = (process.memoryUsage().heapUsed - h0) / 200 / 1024;

  if (process.argv.includes('--json')) console.log(JSON.stringify(res, null, 2));
  else for (const [k, v] of Object.entries(res)) console.log(k.padEnd(34), v.toFixed(2));
}

void main();
