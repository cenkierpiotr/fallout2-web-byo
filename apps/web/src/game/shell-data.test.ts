import { describe, expect, it } from 'vitest';
import { readPresetBio } from './shell-data';

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

describe('readPresetBio', () => {
  it('PL: bierze UTF-8 z pakietu i normalizuje CRLF', async () => {
    const pack = async (rel: string) =>
      rel === 'premade/combat.bio' ? enc('Opowiesc Narga:\r\nzażółć\r\n') : null;
    expect(await readPresetBio('combat', { pl: true, pack }, 'EN')).toBe('Opowiesc Narga:\nzażółć');
  });
  it('brak pliku, pusty plik lub jezyk EN: angielski fallback', async () => {
    expect(await readPresetBio('combat', { pl: true, pack: async () => null }, 'EN')).toBe('EN');
    expect(await readPresetBio('combat', { pl: true, pack: async () => enc('  ') }, 'EN')).toBe(
      'EN',
    );
    expect(await readPresetBio('combat', { pl: false, pack: async () => enc('PL') }, 'EN')).toBe(
      'EN',
    );
    expect(await readPresetBio('combat', { pl: true }, 'EN')).toBe('EN');
  });
  it('wyjatek czytnika: fallback', async () => {
    const pack = async () => {
      throw new Error('x');
    };
    expect(await readPresetBio('combat', { pl: true, pack }, 'EN')).toBe('EN');
  });
});
