import { describe, expect, it } from 'vitest';
import { readGameMsg } from './msg-read';

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const vfs = { open: async (): Promise<Uint8Array> => enc('{100}{}{Strength}\n{101}{}{Agility}\n') };

describe('readGameMsg', () => {
  it('czyta angielski bez pakietu', async () => {
    const m = await readGameMsg(vfs, 'stat');
    expect(m.get(100)).toBe('Strength');
  });
  it('nakłada pakiet PL (UTF-8) przy pl', async () => {
    const pack = async (): Promise<Uint8Array> => enc('{100}{}{Siła}\n');
    const m = await readGameMsg(vfs, 'stat', { pl: true, pack });
    expect(m.get(100)).toBe('Siła');
    expect(m.get(101)).toBe('Agility');
  });
  it('ignoruje pakiet gdy nie pl lub brak pliku', async () => {
    const pack = async (): Promise<Uint8Array> => enc('{100}{}{Siła}\n');
    expect((await readGameMsg(vfs, 'stat', { pl: false, pack })).get(100)).toBe('Strength');
    expect((await readGameMsg(vfs, 'stat', { pl: true, pack: async () => null })).get(100)).toBe(
      'Strength',
    );
  });
});
