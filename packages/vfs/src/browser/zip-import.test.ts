import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { folderFromZip } from './zip-import.js';

const blob = (z: Uint8Array): Blob => new Blob([z as BlobPart]);
const text = async (f: File | undefined): Promise<string> =>
  new TextDecoder().decode(await f?.arrayBuffer());

describe('folderFromZip', () => {
  it('obcina katalog nadrzedny i filtruje pliki gry', async () => {
    const z = zipSync({
      'Fallout 2/MASTER.DAT': [strToU8('M'.repeat(1000)), { level: 6 }],
      'Fallout 2/critter.dat': [strToU8('C'), { level: 0 }],
      'Fallout 2/DATA/Text/English/a.msg': strToU8('msg'),
      'Fallout 2/MANUAL/x.pdf': strToU8('pdf'),
      'Fallout 2/FALLOUT2.exe': strToU8('exe'),
    });
    let last: [number, number] = [0, 0];
    const r = await folderFromZip(blob(z), (a, b) => (last = [a, b]));
    expect([...r.files.keys()].sort()).toEqual([
      'critter.dat',
      'data/text/english/a.msg',
      'master.dat',
    ]);
    expect(await text(r.files.get('master.dat'))).toBe('M'.repeat(1000));
    expect(await text(r.files.get('critter.dat'))).toBe('C');
    expect(last[0]).toBe(last[1]);
  });
  it('korzen bez prefiksu', async () => {
    const r = await folderFromZip(
      blob(zipSync({ 'MASTER.DAT': strToU8('x'), 'patch000.dat': strToU8('p') })),
    );
    expect([...r.files.keys()].sort()).toEqual(['master.dat', 'patch000.dat']);
  });
  it('zip bez master.dat daje pusty folder', async () => {
    const r = await folderFromZip(blob(zipSync({ 'a/readme.txt': strToU8('x') })));
    expect(r.files.size).toBe(0);
  });
  it('odrzuca zip-slip', async () => {
    await expect(
      folderFromZip(blob(zipSync({ '../evil/master.dat': strToU8('x') }))),
    ).rejects.toThrow('niebezpieczna');
  });
  it('uszkodzone archiwum', async () => {
    await expect(folderFromZip(new Blob([new Uint8Array([1, 2, 3, 4, 5])]))).rejects.toThrow(
      'zip:',
    );
  });
  it('odrzuca archiwum rozpakowujace sie ponad limit (zip-bomb)', async () => {
    const z = zipSync({ 'MASTER.DAT': [strToU8('A'.repeat(100_000)), { level: 9 }] });
    await expect(folderFromZip(blob(z), undefined, 50_000)).rejects.toThrow(/zbyt duze/);
    const ok = await folderFromZip(blob(z), undefined, 200_000);
    expect(ok.files.get('master.dat')?.size).toBe(100_000);
  });
});
