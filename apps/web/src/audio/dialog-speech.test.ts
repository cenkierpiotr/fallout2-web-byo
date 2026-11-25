import { describe, expect, it } from 'vitest';
import { DialogSpeech } from './dialog-speech';
import type { DialogCue } from './dialog-audio';

const FILES = new Set([
  'sound/speech/hmwrlg/klint01.acm',
  'sound/speech/hmwrlg/klint01.lip',
  'sound/speech/hfmaxx/maida01.acm',
  'sound/speech/a/dup.acm',
  'sound/speech/b/dup.acm',
]);
const LST = 'reser,0,0,0\nhmwrlg,1,1,1\nhfmaxx,1,1,1\n';

function mk() {
  const shown: (DialogCue | undefined)[] = [];
  let closed = 0;
  const s = new DialogSpeech({
    has: (p) => FILES.has(p.toLowerCase()),
    keys: (pre) => [...FILES].filter((f) => f.startsWith(pre)),
    headsLst: async () => LST,
    show: (c) => void shown.push(c),
    close: () => void closed++,
  });
  return { s, shown, closed: () => closed };
}

describe('DialogSpeech', () => {
  it('glowa z headFid + audio -> sciezka ACM i LIP (plik istnieje)', async () => {
    const { s, shown } = mk();
    await s.speak({ headFid: 1, text: 'Hej', audio: 'KLINT01' });
    expect(shown).toEqual([
      {
        speechPath: 'sound/speech/hmwrlg/klint01.acm',
        lipPath: 'sound/speech/hmwrlg/klint01.lip',
        subtitle: 'Hej',
      },
    ]);
  });
  it('bez LIP: brak lipPath', async () => {
    const { s, shown } = mk();
    await s.speak({ headFid: 2, text: 'x', audio: 'maida01' });
    expect(shown[0]).toEqual({ speechPath: 'sound/speech/hfmaxx/maida01.acm', subtitle: 'x' });
  });
  it('zla glowa, jednoznaczny katalog: fallback po nazwie pliku', async () => {
    const { s, shown } = mk();
    await s.speak({ headFid: 2, text: 'x', audio: 'klint01' });
    expect(shown[0]?.speechPath).toBe('sound/speech/hmwrlg/klint01.acm');
  });
  it('brak pliku, brak audio albo niejednoznaczne: cisza (show(undefined)), nie blad', async () => {
    const { s, shown } = mk();
    await s.speak({ headFid: 1, text: 'x', audio: 'nie_ma' });
    await s.speak({ headFid: 1, text: 'x', audio: undefined });
    await s.speak({ headFid: 9, text: 'x', audio: 'dup' });
    expect(shown).toEqual([undefined, undefined, undefined]);
  });
  it('stop zamyka mowe', () => {
    const { s, closed } = mk();
    s.stop();
    expect(closed()).toBe(1);
  });
  it('odrzucony headsLst nie zostaje w cache: kolejna kwestia ponawia', async () => {
    let n = 0;
    const s = new DialogSpeech({
      has: (p) => FILES.has(p.toLowerCase()),
      keys: () => [],
      headsLst: async () => {
        if (n++ === 0) throw new Error('chwilowy blad');
        return LST;
      },
      show: () => undefined,
      close: () => undefined,
    });
    const line = { headFid: 1, audio: 'klint01', text: 'x' };
    await expect(s.cueFor(line)).rejects.toThrow();
    expect((await s.cueFor(line))?.speechPath).toBe('sound/speech/hmwrlg/klint01.acm');
  });
});
