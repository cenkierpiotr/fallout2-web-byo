import { describe, expect, it } from 'vitest';
import { parseFrm } from '../../../formats/src/frm/index.js';
import { parseMsgEntries } from '../../../engine-core/src/text/msg-loader.js';
import { openGameFolderNode, type NodeVfs } from '../../../vfs/src/node.js';
import { MOUTH_FRAMES, buildDialogCueCatalog, parseHeadsLst } from '../../src/speech/dialog-cue.js';
import { parseLip } from '../../src/speech/lip.js';
import { parseAcmHeader } from '../../src/acm/header.js';

const dir = process.env.F2_GAME_DIR;

describe.skipIf(!dir)('DialogCue golden (MASTER.DAT)', () => {
  let vfs: NodeVfs;
  const load = async () => {
    vfs = await openGameFolderNode(dir!);
    const files = new Set(vfs.list());
    const dec = new TextDecoder('latin1');
    const messages = [];
    for (const p of vfs.list('text/english/dialog').filter((x) => x.endsWith('.msg'))) {
      messages.push({ path: p, entries: parseMsgEntries(dec.decode(await vfs.open(p))).values() });
    }
    const headsLst = dec.decode(await vfs.open('art/heads/heads.lst'));
    return { files, headsLst, cat: buildDialogCueCatalog({ files, headsLst, messages }) };
  };

  it('katalog pokrywa dialogi z mowa; liczby zgodne z danymi', async () => {
    const { cat, files, headsLst } = await load();
    try {
      const byFile = new Map<string, Set<string | undefined>>();
      for (const e of cat.entries)
        (byFile.get(e.msgFile) ?? byFile.set(e.msgFile, new Set()).get(e.msgFile)!).add(e.head);
      expect(cat.entries.length).toBe(1011);
      expect(byFile.size).toBe(13);
      const withFile = cat.entries.filter((e) => e.hasAcm || e.hasLip);
      expect(withFile.length).toBe(1006);
      const heads = new Set(parseHeadsLst(headsLst).map((h) => h.name));
      for (const e of withFile) {
        expect(heads.has(e.head!)).toBe(true);
        expect(files.has(e.speechPath) || files.has(e.lipPath ?? '')).toBe(true);
      }
      // kcsulik: Sulik, 243 wpisy
      expect(
        cat.entries.filter((e) => e.msgFile.endsWith('/kcsulik.msg') && e.head === 'sulik').length,
      ).toBe(243);
      expect(
        cat.find(
          'text/english/dialog/qcfrank.msg',
          cat.entries.find((e) => e.msgFile.endsWith('qcfrank.msg'))!.id,
        )!.head,
      ).toBe('bosss');
    } finally {
      await vfs.close();
    }
  });

  it('kazda glowa ma pliki P z 9 klatkami ust dla trzech nastrojow', async () => {
    const { cat } = await load();
    try {
      const heads = new Set(cat.entries.flatMap((e) => (e.head ? [e.head] : [])));
      expect(heads.size).toBe(11); // haku2 dzieli nazwy z hakun, wygrywa hakun
      for (const h of heads) {
        for (const mood of ['good', 'neutral', 'bad'] as const) {
          const p = cat.entries.find((e) => e.head === h)!.talkFrm![mood];
          const frm = parseFrm(await vfs.open(p));
          expect(frm.framesPerDirection, p).toBe(MOUTH_FRAMES);
        }
      }
    } finally {
      await vfs.close();
    }
  });

  it('LIP wpisu wskazuje ten sam plik ACM i jest spojny z naglowkiem ACM', async () => {
    const { cat } = await load();
    try {
      let checked = 0;
      let pcmEq = 0;
      for (const e of cat.entries) {
        if (!e.lipPath) continue;
        const lip = parseLip(await vfs.open(e.lipPath));
        expect(lip.acmName.toLowerCase()).toBe(e.audio);
        if (e.hasAcm) {
          const h = parseAcmHeader(await vfs.open(e.speechPath));
          if (lip.pcmBytes === 2 * h.sampleCount) pcmEq++;
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(900);
      expect(pcmEq / checked).toBeGreaterThan(0.99);
    } finally {
      await vfs.close();
    }
  }, 180_000);
});
