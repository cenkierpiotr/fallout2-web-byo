import { describe, expect, it } from 'vitest';
import { createNarrationSpeech } from './endgame-speech';

type Opts = { onEnd?: () => void };
function fakeSpeech(missing = false) {
  const calls: string[] = [];
  let end: (() => void) | undefined;
  return {
    calls,
    end: () => end?.(),
    s: {
      say: async (p: string, o?: Opts) => {
        calls.push(`say:${p}`);
        if (missing) throw new Error('brak pliku mowy');
        end = o?.onEnd;
        return { durationMs: 1, hasLip: false, subtitle: undefined };
      },
      stop: () => {
        calls.push('stop');
        end?.();
      },
    },
  };
}

describe('createNarrationSpeech', () => {
  it('konczy sie po onEnd: finished', async () => {
    const f = fakeSpeech();
    const n = createNarrationSpeech(async () => f.s);
    const p = n.play('sound/speech/narrator/nar_1.acm');
    await new Promise((r) => setTimeout(r, 0));
    f.end();
    expect(await p).toBe('finished');
  });
  it('stop() w trakcie: skipped', async () => {
    const f = fakeSpeech();
    const n = createNarrationSpeech(async () => f.s);
    const p = n.play('x.acm');
    await new Promise((r) => setTimeout(r, 0));
    n.stop();
    expect(await p).toBe('skipped');
    expect(f.calls).toEqual(['say:x.acm', 'stop']);
  });
  it('brak pliku: missing', async () => {
    const n = createNarrationSpeech(async () => fakeSpeech(true).s);
    expect(await n.play('x.acm')).toBe('missing');
  });
  it('brak Web Audio (getSpeech rzuca): missing', async () => {
    const n = createNarrationSpeech(() => Promise.reject(new Error('no audio')));
    expect(await n.play('x.acm')).toBe('missing');
  });
  it('drugie play() konczy pierwsze jako skipped (brak wiszacego promise)', async () => {
    const f = fakeSpeech();
    const n = createNarrationSpeech(async () => f.s);
    const p1 = n.play('a.acm');
    await new Promise((r) => setTimeout(r, 0));
    const p2 = n.play('b.acm');
    expect(await p1).toBe('skipped');
    await new Promise((r) => setTimeout(r, 0));
    f.end();
    expect(await p2).toBe('finished');
  });
});
