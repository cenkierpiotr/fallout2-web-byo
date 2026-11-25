import { describe, expect, it } from 'vitest';
import { hdPackFromFiles } from './hd-pack';

const manifest = JSON.stringify({
  version: 1,
  generatedAt: 'x',
  entries: {
    'art/walls/a.frm': { source: 'flux', approved: true },
    'art/walls/b.frm': { source: 'xbrz', approved: true },
    'art/critters/c.frm': { source: 'flux', approved: false },
  },
});
const mk = (keys: string[]): Map<string, File> =>
  new Map(keys.map((k) => [k, new File([k.endsWith('manifest.json') ? manifest : 'png'], k)]));

describe('hdPackFromFiles', () => {
  it.each([
    ['gamedir', 'data/assets-hd/'],
    ['DATA', 'assets-hd/'],
    ['assets-hd', ''],
  ])('rozpoznaje uklad %s i mapuje sciezki assets-hd/', async (_n, p) => {
    const pack = await hdPackFromFiles(mk([`${p}manifest.json`, `${p}hd/atlas-0000.png`]), 'final');
    expect(pack).not.toBeNull();
    expect(pack!.entries).toBe(3);
    expect(pack!.hdEntries).toBe(1);
    const key = pack!.reader.resolve('assets-hd/hd/atlas-0000.png');
    expect(key).toBe(`${p}hd/atlas-0000.png`);
    expect(new TextDecoder().decode(await pack!.reader.read(key!))).toBe('png');
    expect(pack!.reader.resolve('assets-hd/hd/brak.png')).toBeUndefined();
    expect(pack!.reader.resolve('art/x.frm')).toBeUndefined();
  });
  it('null bez manifestu albo z zlym manifestem', async () => {
    expect(await hdPackFromFiles(mk(['hd/a.png']), 'x')).toBeNull();
    const bad = new Map([['manifest.json', new File(['{"version":2}'], 'm')]]);
    expect(await hdPackFromFiles(bad, 'x')).toBeNull();
    const junk = new Map([['manifest.json', new File(['nie json'], 'm')]]);
    expect(await hdPackFromFiles(junk, 'x')).toBeNull();
  });
});
