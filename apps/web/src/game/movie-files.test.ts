import { describe, expect, it } from 'vitest';
import { MovieLibrary, decodeCp1252, type MovieFileLike } from './movie-files';

const file = (name: string, bytes: number[]): MovieFileLike => ({
  name,
  arrayBuffer: async () => new Uint8Array(bytes).buffer,
});

describe('decodeCp1252', () => {
  it('dekoduje polskie/rozszerzone znaki cp1252', () => {
    expect(decodeCp1252(new Uint8Array([0x41, 0xe9, 0x80]))).toBe('Aé€');
  });
});

describe('MovieLibrary', () => {
  it('indeksuje po nazwie bazowej bez wzgledu na wielkosc liter', () => {
    const lib = new MovieLibrary([
      file('IPLOGO.mve', [1]),
      file('elder.MVE', [2]),
      file('elder.sve', [3]),
      file('notes.txt', [4]),
    ]);
    expect(lib.names()).toEqual(['elder', 'iplogo']);
    expect(lib.has('IPLOGO')).toBe(true);
    expect(lib.has('intro')).toBe(false);
  });

  it('load zwraca mve, sve (cp1252) i cfg; brak filmu to null', async () => {
    const lib = new MovieLibrary([
      file('elder.mve', [9, 8]),
      file('elder.sve', [0x31, 0x3a, 0xe9]),
      file('elder.cfg', [0x3b]),
    ]);
    const a = await lib.load('elder');
    expect([...a!.mve]).toEqual([9, 8]);
    expect(a!.sve).toBe('1:é');
    expect(a!.cfg).toBe(';');
    expect(await lib.load('intro')).toBeNull();
  });

  it('film bez sve i cfg ma je niezdefiniowane', async () => {
    const a = await new MovieLibrary([file('vsuit.mve', [1])]).load('vsuit');
    expect(a!.sve).toBeUndefined();
    expect(a!.cfg).toBeUndefined();
  });

  it('dla filmu wspolny movie.cfg nie jest uzywany jako cfg filmu', async () => {
    const a = await new MovieLibrary([file('elder.mve', [1]), file('movie.cfg', [0x3b])]).load(
      'elder',
    );
    expect(a!.cfg).toBeUndefined();
  });

  it('bierze nazwe z koncowki sciezki (webkitRelativePath)', () => {
    const lib = new MovieLibrary([{ ...file('x', [1]), name: 'cuts/intro.mve' }]);
    expect(lib.has('intro')).toBe(true);
  });
});
