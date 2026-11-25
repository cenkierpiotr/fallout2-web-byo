import { deflateSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FormatError } from '../errors.js';
import { inflateZlib } from './inflate.js';

const sample = new Uint8Array(5000).map((_, i) => (i * 7) % 251);

describe('inflateZlib', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('rozpakowuje poprawny strumien', async () => {
    const out = await inflateZlib(new Uint8Array(deflateSync(sample)), sample.length);
    expect(out).toEqual(sample);
  });

  it('rzuca FormatError gdy dlugosc != expectedSize', async () => {
    const packed = new Uint8Array(deflateSync(sample));
    await expect(inflateZlib(packed, sample.length + 1)).rejects.toThrow(FormatError);
  });

  it('fallback fflate gdy brak DecompressionStream', async () => {
    vi.stubGlobal('DecompressionStream', undefined);
    const out = await inflateZlib(new Uint8Array(deflateSync(sample)), sample.length);
    expect(out).toEqual(sample);
  });

  it('fallback fflate gdy strumien rzuca blad', async () => {
    vi.stubGlobal(
      'DecompressionStream',
      class {
        constructor() {
          throw new Error('boom');
        }
      },
    );
    const out = await inflateZlib(new Uint8Array(deflateSync(sample)), sample.length);
    expect(out).toEqual(sample);
  });

  it('fallback: zla dlugosc nadal FormatError', async () => {
    vi.stubGlobal('DecompressionStream', undefined);
    const packed = new Uint8Array(deflateSync(sample));
    await expect(inflateZlib(packed, 10)).rejects.toThrow(FormatError);
  });

  it('uszkodzone dane -> FormatError', async () => {
    await expect(inflateZlib(new Uint8Array([1, 2, 3, 4]), 10)).rejects.toThrow(FormatError);
  });

  it('zip-bomb (natywnie): wynik > expectedSize -> FormatError', async () => {
    const bomb = new Uint8Array(deflateSync(new Uint8Array(50_000_000)));
    await expect(inflateZlib(bomb, 1000)).rejects.toThrow(FormatError);
  });

  it('zip-bomb (fflate): wynik > expectedSize -> FormatError', async () => {
    vi.stubGlobal('DecompressionStream', undefined);
    const bomb = new Uint8Array(deflateSync(new Uint8Array(5_000_000)));
    await expect(inflateZlib(bomb, 1000)).rejects.toThrow(FormatError);
  });

  it('blad "za duzo danych" nie wpada w fallback', async () => {
    const bomb = new Uint8Array(deflateSync(new Uint8Array(100_000)));
    await expect(inflateZlib(bomb, 10)).rejects.toThrow(/przekracza/);
  });
  it('odrzuca ogromny lub niepoprawny expectedSize bez alokacji', async () => {
    await expect(inflateZlib(new Uint8Array(4), 0xffffffff)).rejects.toMatchObject({
      name: 'FormatError',
    });
    await expect(inflateZlib(new Uint8Array(4), -1)).rejects.toMatchObject({ name: 'FormatError' });
  });
});
