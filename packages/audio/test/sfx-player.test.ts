import { describe, expect, it, vi } from 'vitest';
import { SfxPlayer } from '../src/sfx/SfxPlayer.js';
import { FakeAudioContext, FakeGain } from './fakes.js';

function setup(files: string[], maxVoices?: number) {
  const ctx = new FakeAudioContext();
  const vfs = {
    resolve: (p: string) => (files.includes(p) ? {} : undefined),
    open: vi.fn(async () => new Uint8Array(4)),
  };
  const pcm = new Int16Array(100);
  pcm[0] = 16384;
  const acm = { decode: vi.fn(async () => ({ pcm, channels: 1, sampleRate: 22050 })) };
  const out = new FakeGain();
  const p = new SfxPlayer(ctx as never, vfs, acm, out as never, maxVoices);
  return { ctx, vfs, acm, p, out };
}

describe('SfxPlayer', () => {
  it('gra pierwszego istniejacego kandydata (alias) i cache dekodowania', async () => {
    const { ctx, p, acm, vfs } = setup(['sound/sfx/hmxxxxaa.acm']);
    const h = await p.play(['HFJMPSAA', 'HFXXXXAA', 'HMXXXXAA']);
    expect(h?.name).toBe('HMXXXXAA');
    expect(vfs.open).toHaveBeenCalledWith('sound/sfx/hmxxxxaa.acm');
    expect(ctx.sources).toHaveLength(1);
    expect(ctx.sources[0]!.buffer!.getChannelData(0)[0]).toBeCloseTo(0.5);
    await p.play('HMXXXXAA');
    expect(acm.decode).toHaveBeenCalledTimes(1);
    expect(ctx.sources).toHaveLength(2);
  });
  it('brak pliku: undefined, bez wyjatku', async () => {
    const { p, ctx } = setup([]);
    await expect(p.play('NOPE')).resolves.toBeUndefined();
    expect(ctx.sources).toHaveLength(0);
  });
  it('limit glosow i stopAll', async () => {
    const { p, ctx } = setup(['sound/sfx/a.acm'], 2);
    await p.play('A');
    await p.play('A');
    expect(await p.play('A')).toBeUndefined();
    p.stopAll();
    expect(ctx.sources.every((s) => s.stopCalls === 1)).toBe(true);
    expect(await p.play('A')).toBeDefined();
  });
});
