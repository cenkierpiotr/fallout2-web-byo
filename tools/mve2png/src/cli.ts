import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { MveDecoder } from '@f2/video';

const USAGE =
  'uzycie: mve2png <plik.mve> <numerKlatki> -o out.png   (plik wypakowany np. przez dat2 extract)\n';

function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  v.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

export function encodePng(rgba: Uint8Array, w: number, h: number): Uint8Array {
  const raw = new Uint8Array(h * (w * 4 + 1));
  for (let y = 0; y < h; y++)
    raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, w);
  v.setUint32(4, h);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function main(): void {
  const args = process.argv.slice(2);
  const oi = args.indexOf('-o');
  if (args.length < 4 || oi < 0 || !args[oi + 1]) {
    process.stderr.write(USAGE);
    process.exit(2);
  }
  const [file, nStr] = args as [string, string];
  const target = Number(nStr);
  const dec = new MveDecoder(new Uint8Array(readFileSync(file)));
  for (let f = dec.nextFrame(); f; f = dec.nextFrame()) {
    if (f.index === target) {
      writeFileSync(args[oi + 1]!, encodePng(f.rgba, dec.width, dec.height));
      return;
    }
  }
  process.stderr.write(`brak klatki ${target}${dec.error ? `: ${dec.error}` : ''}\n`);
  process.exit(1);
}

main();
