import { describe, expect, it } from 'vitest';
import { AcmFormatError, parseAcmHeader } from '../src/acm/header.js';

function header(
  over: Partial<{ sig: number; count: number; ch: number; rate: number; attrs: number }> = {},
) {
  const b = new Uint8Array(14);
  const dv = new DataView(b.buffer);
  dv.setUint32(0, over.sig ?? 0x01032897, true);
  dv.setUint32(4, over.count ?? 191928, true);
  dv.setUint16(8, over.ch ?? 2, true);
  dv.setUint16(10, over.rate ?? 22050, true);
  dv.setUint16(12, over.attrs ?? 0x0108, true);
  return b;
}

describe('parseAcmHeader', () => {
  it('czyta pola (profil KILL13B)', () => {
    expect(parseAcmHeader(header())).toEqual({
      signature: 0x01032897,
      sampleCount: 191928,
      channels: 2,
      sampleRate: 22050,
      levels: 8,
      subblocks: 16,
      dataOffset: 14,
    });
  });
  it('odrzuca zla sygnature', () => {
    expect(() => parseAcmHeader(new Uint8Array(14))).toThrow(AcmFormatError);
    expect(() => parseAcmHeader(header({ sig: 0x01032896 }))).toThrow(AcmFormatError);
  });
  it('odrzuca zbyt krotki bufor', () => {
    expect(() => parseAcmHeader(new Uint8Array(13))).toThrow(AcmFormatError);
  });
  it('odrzuca nieobslugiwana liczbe kanalow i subblocks=0', () => {
    expect(() => parseAcmHeader(header({ ch: 3 }))).toThrow(AcmFormatError);
    expect(() => parseAcmHeader(header({ attrs: 0x0007 }))).toThrow(AcmFormatError);
  });
});
