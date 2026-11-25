import { describe, it, expect } from 'vitest';
import { MVE_DELTA_TABLE as T, decodeMveAudioFrame, parseMveAudioInit } from './mve-audio.js';

function frame(pl: number, pr: number, deltas: number[]): DataView {
  const v = new DataView(new ArrayBuffer(10 + deltas.length));
  v.setInt16(6, pl, true);
  v.setInt16(8, pr, true);
  deltas.forEach((d, i) => v.setUint8(10 + i, d));
  return v;
}

describe('MVE_DELTA_TABLE', () => {
  it('ma 256 wpisow i znane wartosci', () => {
    expect(T.length).toBe(256);
    expect([T[0], T[43], T[119], T[127], T[128], T[129], T[136], T[137], T[255], T[254]]).toEqual([
      0, 43, 32589, -1, 1, 1, 29973, -32589, -1, -2,
    ]);
  });
});

describe('parseMveAudioInit', () => {
  it('flagi 0xaa9f', () => {
    const v = new DataView(new ArrayBuffer(10));
    v.setUint16(2, 0xaa9f, true);
    v.setUint16(4, 22050, true);
    expect(parseMveAudioInit(v)).toEqual({
      sampleRate: 22050,
      stereo: true,
      bits16: true,
      compressed: true,
    });
  });
  it('za krotki', () => {
    expect(() => parseMveAudioInit(new DataView(new ArrayBuffer(9)))).toThrow();
  });
});

describe('decodeMveAudioFrame', () => {
  it('dekoduje delty L/R z predyktorami jako pierwszymi probkami', () => {
    expect([...decodeMveAudioFrame(frame(100, -100, [1, 2, 2, 1]))]).toEqual([
      100, -100, 101, -98, 103, -97,
    ]);
  });
  it('zawija 16-bitowo (jak add ax w exe), bez nasycenia', () => {
    expect([...decodeMveAudioFrame(frame(32000, 0, [119, 0]))]).toEqual([32000, 0, -947, 0]);
  });
  it('nieparzysty bajt jest pomijany', () => {
    expect([...decodeMveAudioFrame(frame(0, 0, [1]))]).toEqual([0, 0]);
  });
  it('za krotka ramka rzuca', () => {
    expect(() => decodeMveAudioFrame(new DataView(new ArrayBuffer(9)))).toThrow();
  });
});
