import { describe, expect, it } from 'vitest';
import {
  HEAD_ANIM,
  MOUTH_FRAMES,
  buildDialogCueCatalog,
  headFrmPath,
  parseHeadsLst,
} from '../src/speech/dialog-cue.js';

const files = new Set([
  'sound/speech/sulik/a1.acm',
  'sound/speech/sulik/a1.lip',
  'sound/speech/sulik/a2.acm', // bez LIP
  'sound/speech/power/b1.lip', // bez ACM
  'sound/speech/hakun/dup.acm',
  'sound/speech/hakun/dup.lip',
  'sound/speech/haku2/dup.acm',
  'sound/speech/haku2/dup.lip',
  'sound/speech/hakun/only.acm',
  'sound/speech/hakun/only.lip',
]);
const heads = 'reser\nsulik,3,3,3\npower,2,2,2\nhaku2,3,3,3\nhakun,3,3,3\n';

describe('HEAD_ANIM i headFrmPath', () => {
  it('tablica 12 anim wg exe: znak nastroju i znak rodzaju', () => {
    expect(HEAD_ANIM.map((a) => a.mood + a.kind).join('')).toBe('gvgfgnngnfnbbnbfbvgpnpbp');
  });
  it('buduje sciezki P (mowa) i F (fidget)', () => {
    expect(headFrmPath('SULIK', 'good', 'p')).toBe('art/heads/sulikgp.frm');
    expect(headFrmPath('sulik', 'bad', 'f', 2)).toBe('art/heads/sulikbf2.frm');
    expect(MOUTH_FRAMES).toBe(9);
  });
});

describe('parseHeadsLst', () => {
  it('pomija reser i czyta liczby fidgetow', () => {
    const l = parseHeadsLst(heads);
    expect(l.map((e) => e.name)).toEqual(['sulik', 'power', 'haku2', 'hakun']);
    expect(l[1]).toEqual({ name: 'power', index: 2, fidgets: [2, 2, 2] });
  });
});

describe('buildDialogCueCatalog', () => {
  const cat = buildDialogCueCatalog({
    files,
    headsLst: heads,
    messages: [
      {
        path: 'text/english/dialog/k.msg',
        entries: [
          { id: 1, audio: '', text: 'bez mowy' },
          { id: 2, audio: 'A1', text: 'Czesc' },
          { id: 3, audio: 'a2', text: 'Bez lip' },
          { id: 4, audio: 'b1', text: 'Bez acm' },
          { id: 5, audio: 'nieistnieje', text: 'brak' },
          { id: 6, audio: 'dup', text: 'dwie glowy' },
          { id: 7, audio: 'only', text: 'hakun' },
        ],
      },
    ],
  });
  it('pomija wpisy bez pola audio', () => {
    expect(cat.entries.map((e) => e.id)).toEqual([2, 3, 4, 5, 6, 7]);
  });
  it('mapuje wpis na glowe, mowe i LIP', () => {
    const e = cat.find('text/english/dialog/K.MSG', 2)!;
    expect(e.head).toBe('sulik');
    expect(e.speechPath).toBe('sound/speech/sulik/a1.acm');
    expect(e.lipPath).toBe('sound/speech/sulik/a1.lip');
    expect(e.talkFrm.neutral).toBe('art/heads/suliknp.frm');
    expect(e.subtitle).toBe('Czesc');
  });
  it('tolerancja brakow', () => {
    expect(cat.find('text/english/dialog/k.msg', 3)!.lipPath).toBeUndefined();
    expect(cat.find('text/english/dialog/k.msg', 4)!.hasAcm).toBe(false);
    const miss = cat.find('text/english/dialog/k.msg', 5)!;
    expect(miss.head).toBeUndefined();
    expect(miss.hasAcm || miss.hasLip).toBe(false);
  });
  it('niejednoznaczna glowa rozstrzygana wiekszoscia w pliku msg', () => {
    const e = cat.find('text/english/dialog/k.msg', 6)!;
    expect(e.headCandidates).toEqual(['haku2', 'hakun']);
    expect(e.head).toBe('hakun'); // wpis 'only' glosuje na hakun
  });
  it('toDialogCue daje strukture dla DialogAudio', () => {
    const c = cat.toDialogCue(cat.find('text/english/dialog/k.msg', 2)!);
    expect(c).toEqual({
      speechPath: 'sound/speech/sulik/a1.acm',
      lipPath: 'sound/speech/sulik/a1.lip',
      subtitle: 'Czesc',
    });
  });
});
