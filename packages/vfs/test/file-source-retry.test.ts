import { describe, expect, it } from 'vitest';
import { readBlob } from '../src/browser/file-source.js';
import { hashFile } from '../src/browser/sha256.js';

function flaky(failures: number, name: string): Blob {
  let n = 0;
  return {
    arrayBuffer: async () => {
      if (n++ < failures) throw Object.assign(new Error('x'), { name });
      return new Uint8Array([1, 2]).buffer;
    },
  } as unknown as Blob;
}

describe('readBlob', () => {
  it('ponawia przejsciowy NotFoundError', async () => {
    expect(new Uint8Array(await readBlob(flaky(2, 'NotFoundError')))).toEqual(
      new Uint8Array([1, 2]),
    );
  });
  it('po wyczerpaniu prob rzuca blad, inne bledy od razu', async () => {
    await expect(readBlob(flaky(99, 'NotFoundError'), [1, 1])).rejects.toMatchObject({
      name: 'NotFoundError',
    });
    const b = flaky(1, 'SecurityError');
    await expect(readBlob(b)).rejects.toMatchObject({ name: 'SecurityError' });
  });
  it('hashFile przezywa przejsciowy NotFoundError (odczyt przez readBlob)', async () => {
    const f = flaky(2, 'NotFoundError') as unknown as { size: number; slice: () => Blob };
    f.size = 2;
    f.slice = () => flaky(2, 'NotFoundError');
    expect(await hashFile(f as unknown as Blob)).toMatch(/^[0-9a-f]{64}$/);
  });
});
