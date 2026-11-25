import { describe, expect, it } from 'vitest';
import {
  parseAiTxt,
  parseGenrepTxt,
  parseHolodiskTxt,
  parseKarmavarTxt,
  parsePartyTxt,
  parseQuestsTxt,
} from '../../src/txt/index.js';
import { gameDir, patchDir, readMasterText, readPatchText } from './txt-files.js';

describe.skipIf(!gameDir || !patchDir)('pliki TXT golden', () => {
  it('AI.TXT', async () => {
    const p = parseAiTxt(await readPatchText('AI.TXT'));
    expect(p.filter((x) => x.generalType !== undefined).length).toBe(178);
    expect(p.filter((x) => x.disposition !== undefined).length).toBe(121);
    expect(p.length).toBe(187);
    expect(p.every((x) => x.packetNum >= 0)).toBe(true);
  });
  it('party.txt', async () => {
    const p = parsePartyTxt(await readPatchText('party.txt'));
    expect(p.length).toBe(26);
    expect(p[0]?.pid).toBe(16777216);
    expect(p[25]?.pid).toBe(455);
    expect(p.find((x) => x.index === 13)?.pid).toBe(16777278);
    expect(p.find((x) => x.index === 4)?.pid).toBe(16777313);
  });
  it('quests/karmavar/genrep/holodisk', async () => {
    const q = parseQuestsTxt(await readPatchText('quests.txt'));
    const qm = parseQuestsTxt(await readMasterText('data/quests.txt'));
    const k = parseKarmavarTxt(await readPatchText('karmavar.txt'));
    const km = parseKarmavarTxt(await readMasterText('data/karmavar.txt'));
    const g = parseGenrepTxt(await readMasterText('data/genrep.txt'));
    const h = parseHolodiskTxt(await readMasterText('data/holodisk.txt'));
    expect(q.length).toBe(115);
    expect(qm.length).toBe(110);
    expect(k.length).toBe(17);
    expect(km.length).toBe(17);
    expect(k[0]).toEqual({ gvar: 0, pic: 48, nameMsg: 1000, descriptionMsg: 1100 });
    expect(g.length).toBe(9);
    expect(g[0]).toEqual({ threshold: 1000, nameMsg: 3000 });
    expect(g[8]?.threshold).toBe(-2147483648);
    expect(h.length).toBe(20);
    expect(h.slice(0, 3).map((x) => x.gvar)).toEqual([220, 221, 222]);
    expect(h.some((x) => x.gvar === 214)).toBe(false);
  });
});
