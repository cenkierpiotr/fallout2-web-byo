import { describe, expect, it } from 'vitest';
import { LipFormatError, parseLip } from '../src/speech/lip.js';
import { LipSync, PHONEME_TO_FRAME } from '../src/speech/LipSync.js';
import { buildLip } from './lip-helpers.js';

const base = {
  phonemes: [0, 1, 9],
  markers: [
    [1, 0],
    [0, 100],
    [1, 300],
    [1, 500],
  ] as [number, number][],
  acmName: 'SSA2',
};

describe('parseLip', () => {
  it('parsuje naglowek, fonemy i markery', () => {
    const lip = parseLip(buildLip(base));
    expect(lip.version).toBe(2);
    expect(lip.flags).toBe(0x5800);
    expect(lip.pcmBytes).toBe(500);
    expect(lip.phonemeCount).toBe(3);
    expect(lip.markerCount).toBe(4);
    expect(lip.acmName).toBe('SSA2');
    expect(Array.from(lip.phonemes)).toEqual([0, 1, 9]);
    expect(lip.markers).toEqual([
      { type: 1, offset: 0 },
      { type: 0, offset: 100 },
      { type: 1, offset: 300 },
      { type: 1, offset: 500 },
    ]);
  });

  it('akceptuje zero fonemow i jeden marker', () => {
    const lip = parseLip(buildLip({ phonemes: [], markers: [[1, 0]] }));
    expect(lip.phonemeCount).toBe(0);
    expect(lip.markers).toHaveLength(1);
  });

  it('rzuca LipFormatError dla zbyt krotkiego bufora', () => {
    expect(() => parseLip(new Uint8Array(10))).toThrow(LipFormatError);
    expect(() => parseLip(new Uint8Array(0))).toThrow(LipFormatError);
  });

  it('rzuca dla version != 2', () => {
    expect(() => parseLip(buildLip({ ...base, version: 1 }))).toThrow(LipFormatError);
  });

  it('rzuca gdy markerCount != phonemeCount + 1', () => {
    expect(() => parseLip(buildLip({ ...base, markerCountField: 3 }))).toThrow(LipFormatError);
  });

  it('rzuca gdy rozmiar pliku nie pasuje do licznikow (ucieta lub dluzsza tablica)', () => {
    const ok = buildLip(base);
    expect(() => parseLip(ok.subarray(0, ok.length - 1))).toThrow(LipFormatError);
    expect(() => parseLip(buildLip({ ...base, trailing: 1 }))).toThrow(LipFormatError);
  });

  it('rzuca dla ogromnych licznikow bez alokacji', () => {
    expect(() => parseLip(buildLip({ ...base, phonemeCountField: 0xffffffff }))).toThrow(
      LipFormatError,
    );
  });

  it('rzuca dla typu markera spoza 0..1, nierosnacych offsetow i pierwszego offsetu != 0', () => {
    expect(() =>
      parseLip(
        buildLip({
          ...base,
          markers: [
            [1, 0],
            [2, 100],
            [1, 300],
            [1, 500],
          ],
        }),
      ),
    ).toThrow(LipFormatError);
    expect(() =>
      parseLip(
        buildLip({
          ...base,
          markers: [
            [1, 0],
            [1, 300],
            [1, 200],
            [1, 500],
          ],
        }),
      ),
    ).toThrow(LipFormatError);
    expect(() =>
      parseLip(
        buildLip({
          ...base,
          markers: [
            [1, 5],
            [1, 100],
            [1, 300],
            [1, 500],
          ],
        }),
      ),
    ).toThrow(LipFormatError);
  });

  it('zachowuje fonem spoza zakresu 0..41 (np. 0xCC) bez rzucania', () => {
    const lip = parseLip(
      buildLip({
        phonemes: [204],
        markers: [
          [1, 0],
          [1, 10],
        ],
      }),
    );
    expect(lip.phonemes[0]).toBe(204);
  });
});

describe('LipSync', () => {
  const lip = parseLip(buildLip(base));
  const sync = new LipSync(lip);

  it('tabela fonem -> klatka ma 42 wpisy w zakresie 0..8', () => {
    expect(PHONEME_TO_FRAME).toHaveLength(42);
    expect(Math.max(...PHONEME_TO_FRAME)).toBe(8);
    expect(PHONEME_TO_FRAME[9]).toBe(8);
    expect(PHONEME_TO_FRAME[1]).toBe(3);
  });

  it('przed pierwszym markerem i w pozycji 0 daje klatke pierwszego fonemu', () => {
    expect(sync.frameAt(0)).toBe(PHONEME_TO_FRAME[0]);
    expect(sync.frameAt(-5)).toBe(PHONEME_TO_FRAME[0]);
  });

  it('pozycja rowna offsetowi markera jeszcze nie przelacza (ostra nierownosc)', () => {
    expect(sync.frameAt(100)).toBe(PHONEME_TO_FRAME[0]);
    expect(sync.frameAt(101)).toBe(PHONEME_TO_FRAME[1]);
    expect(sync.frameAt(300)).toBe(PHONEME_TO_FRAME[1]);
    expect(sync.frameAt(301)).toBe(PHONEME_TO_FRAME[9]);
  });

  it('po koncu daje klatke ostatniego fonemu', () => {
    expect(sync.frameAt(500)).toBe(PHONEME_TO_FRAME[9]);
    expect(sync.frameAt(1e9)).toBe(PHONEME_TO_FRAME[9]);
  });

  it('fonem spoza tabeli mapuje sie na klatke 0 (zamkniete usta)', () => {
    const l = parseLip(
      buildLip({
        phonemes: [204, 9],
        markers: [
          [1, 0],
          [1, 10],
          [1, 20],
        ],
      }),
    );
    const s = new LipSync(l);
    expect(s.frameAt(5)).toBe(0);
    expect(s.frameAt(15)).toBe(8);
  });

  it('zero fonemow daje klatke 0', () => {
    const l = parseLip(buildLip({ phonemes: [], markers: [[1, 0]] }));
    expect(new LipSync(l).frameAt(50)).toBe(0);
  });

  it('wlasna tabela fonem -> klatka', () => {
    const custom = new Uint8Array(42).fill(4);
    expect(new LipSync(lip, custom).frameAt(0)).toBe(4);
  });
});
