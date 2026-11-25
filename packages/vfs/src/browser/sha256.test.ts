import { createHash } from 'node:crypto';
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Sha256, hashFile } from './sha256.js';

const ref = (d: Uint8Array): string => createHash('sha256').update(d).digest('hex');
const u8 = (b: Buffer): Uint8Array => new Uint8Array(b);

describe('Sha256', () => {
  it('pusty i abc', () => {
    expect(new Sha256().digestHex()).toBe(ref(new Uint8Array()));
    const abc = new TextEncoder().encode('abc');
    expect(new Sha256().update(abc).digestHex()).toBe(ref(abc));
  });
  it('granice bloku', () => {
    for (const n of [1, 55, 56, 57, 63, 64, 65, 119, 120, 128]) {
      const d = u8(randomBytes(n));
      expect(new Sha256().update(d).digestHex()).toBe(ref(d));
    }
  });
  it('losowe kawalki 1 MB', () => {
    const d = u8(randomBytes(1 << 20));
    const h = new Sha256();
    for (let o = 0; o < d.length;) {
      const n = 1 + Math.floor(Math.random() * 5000);
      h.update(d.subarray(o, o + n));
      o += n;
    }
    expect(h.digestHex()).toBe(ref(d));
  });
  it('hashFile z postepem', async () => {
    const d = u8(randomBytes(10 << 20));
    let last: [number, number] = [0, 0];
    const hex = await hashFile(new Blob([d]), (a, b) => (last = [a, b]), 1 << 20);
    expect(hex).toBe(ref(d));
    expect(last[0]).toBe(last[1]);
  });
});
