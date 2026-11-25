import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { checkDat2Footer, verifyGameFiles, KNOWN_EDITIONS, type KnownEdition } from './verify.js';
import type { PickedFolder } from './pick-folder.js';

/** Syntetyczny DAT2: tresc + stopka [tree, total]. */
function dat(contentLen: number, opts: { badTotal?: boolean } = {}): File {
  const total = contentLen + 8;
  const b = new Uint8Array(total);
  for (let i = 0; i < contentLen; i++) b[i] = i % 251;
  const dv = new DataView(b.buffer);
  dv.setUint32(contentLen, 10, true);
  dv.setUint32(contentLen + 4, opts.badTotal ? total + 1 : total, true);
  return new File([b], 'x.dat');
}
const folder = (m: Record<string, File>): PickedFolder => ({
  kind: 'files',
  files: new Map(Object.entries(m)),
});

describe('verify', () => {
  it('stopka DAT2', async () => {
    expect(await checkDat2Footer(dat(100))).toBe(true);
    expect(await checkDat2Footer(dat(100, { badTotal: true }))).toBe(false);
    expect(await checkDat2Footer(new File([new Uint8Array(4)], 'a'))).toBe(false);
  });
  it('brak critter.dat = invalid', async () => {
    const r = await verifyGameFiles(folder({ 'master.dat': dat(100) }));
    expect(r.status).toBe('invalid');
    expect(r.files.find((f) => f.name === 'critter.dat')?.check).toBe('missing');
  });
  it('uciety plik = invalid', async () => {
    const r = await verifyGameFiles(
      folder({ 'master.dat': dat(100, { badTotal: true }), 'critter.dat': dat(100) }),
    );
    expect(r.status).toBe('invalid');
  });
  it('nieznane wydanie z poprawna struktura = unknown', async () => {
    const r = await verifyGameFiles(folder({ 'master.dat': dat(100), 'critter.dat': dat(200) }), {
      deep: true,
    });
    expect(r.status).toBe('unknown');
    expect(r.files[0]?.sha256).toBe(
      createHash('sha256')
        .update(new Uint8Array(await dat(100).arrayBuffer()))
        .digest('hex'),
    );
  });
  it('tabela znanych wydan ma poprawny format', () => {
    for (const e of KNOWN_EDITIONS)
      for (const f of e.files) expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
  it('znane wydanie: rozmiar bez hasha = unknown, z hashem = verified, zly hash = invalid', async () => {
    const m = dat(100),
      c = dat(200);
    const sum = async (f: File): Promise<string> =>
      createHash('sha256')
        .update(new Uint8Array(await f.arrayBuffer()))
        .digest('hex');
    const mk = async (cHash?: string): Promise<KnownEdition[]> => [
      {
        id: 't',
        label: 't',
        files: [
          { name: 'master.dat', size: m.size, sha256: await sum(m) },
          { name: 'critter.dat', size: c.size, sha256: cHash ?? (await sum(c)) },
        ],
      },
    ];
    const fo = folder({ 'master.dat': m, 'critter.dat': c });
    const shallow = await verifyGameFiles(fo, { editions: await mk() });
    expect(shallow).toMatchObject({ status: 'unknown', edition: 't' });
    const deep = await verifyGameFiles(fo, { deep: true, editions: await mk() });
    expect(deep).toMatchObject({ status: 'verified', edition: 't' });
    const bad = await verifyGameFiles(fo, { deep: true, editions: await mk('0'.repeat(64)) });
    expect(bad.status).toBe('invalid');
  });
});

const GOLDEN = process.env['F2_GAME_DIR'];
describe.skipIf(!GOLDEN)('verify golden (F2_GAME_DIR)', () => {
  it('prawdziwy folder gry: struktura ok, wydanie retail-1.02-en wg rozmiarow', async () => {
    const { openAsBlob } = await import('node:fs');
    const files = new Map<string, File>();
    for (const n of ['master.dat', 'critter.dat', 'patch000.dat']) {
      files.set(n, (await openAsBlob(`${GOLDEN}/${n.toUpperCase()}`)) as unknown as File);
    }
    const r = await verifyGameFiles({ kind: 'files', files });
    expect(r.files.every((f) => f.structure === 'ok')).toBe(true);
    expect(r).toMatchObject({ status: 'unknown', edition: 'retail-1.02-en' });
  });
});
