import { describe, expect, it, vi } from 'vitest';
import { SpeechError, SpeechPlayer } from '../src/speech/SpeechPlayer.js';
import { PHONEME_TO_FRAME } from '../src/speech/LipSync.js';
import { FakeAudioContext, FakeGain } from './fakes.js';
import { buildLip } from './lip-helpers.js';

const RATE = 1000;
const pcm = new Int16Array(1000); // mono, 1 s przy 1000 Hz, 2000 B

function setup(
  files: Record<string, Uint8Array>,
  decoded = { pcm, channels: 1, sampleRate: RATE },
) {
  const ctx = new FakeAudioContext();
  const vfs = {
    resolve: (p: string) => (p in files ? {} : undefined),
    open: async (p: string) => {
      const f = files[p];
      if (!f) throw new Error('brak');
      return f;
    },
  };
  const acm = { decode: vi.fn(async () => decoded) };
  const out = new FakeGain();
  let cb: (() => void) | null = null;
  const raf = (f: () => void) => {
    cb = f;
    return 1;
  };
  const caf = () => {
    cb = null;
  };
  const tick = () => {
    const f = cb;
    cb = null;
    f?.();
  };
  const player = new SpeechPlayer(
    ctx as unknown as BaseAudioContext,
    vfs,
    acm,
    out as unknown as AudioNode,
    { raf, caf },
  );
  return { ctx, player, acm, out, tick };
}

const lipBytes = buildLip({
  phonemes: [1, 9],
  markers: [
    [1, 0],
    [1, 1000],
    [1, 2000],
  ],
  acmName: 'X',
});

describe('SpeechPlayer', () => {
  it('gra audio, konwertuje Int16 -> Float32 i laczy z wyjsciem miksera', async () => {
    const p16 = new Int16Array(1000);
    p16[0] = 16384;
    p16[1] = -32768;
    const { ctx, player, out } = setup(
      { 'a.acm': new Uint8Array(4) },
      { pcm: p16, channels: 1, sampleRate: RATE },
    );
    const h = await player.say('a.acm');
    const src = ctx.sources[0]!;
    expect(src.started).not.toBeNull();
    expect(src.buffer!.getChannelData(0)[0]).toBeCloseTo(0.5, 5);
    expect(src.buffer!.getChannelData(0)[1]).toBe(-1);
    expect(src.connected).toContain(out);
    expect(h.durationMs).toBe(1000);
    expect(h.hasLip).toBe(false);
  });

  it('stereo: rozdziela kanaly z interleaved PCM', async () => {
    const st = new Int16Array([32767, -32768, 0, 0]);
    const { ctx, player } = setup(
      { 'a.acm': new Uint8Array(4) },
      { pcm: st, channels: 2, sampleRate: RATE },
    );
    const h = await player.say('a.acm');
    const b = ctx.sources[0]!.buffer!;
    expect(b.numberOfChannels).toBe(2);
    expect(b.length).toBe(2);
    expect(b.getChannelData(0)[0]).toBeCloseTo(32767 / 32768, 5);
    expect(b.getChannelData(1)[0]).toBe(-1);
    expect(h.durationMs).toBe(2);
  });

  it('(a) brak LIP: hasLip=false, onMouth nie jest wolany, brak wyjatku', async () => {
    const { player, tick } = setup({ 'a.acm': new Uint8Array(4) });
    const onMouth = vi.fn();
    const h = await player.say('a.acm', { lipPath: 'missing.lip', onMouth });
    expect(h.hasLip).toBe(false);
    tick();
    expect(onMouth).not.toHaveBeenCalled();
  });

  it('(b) LIP z pcmBytes != 2*sampleCount: hasLip=false i console.warn raz', async () => {
    const bad = buildLip({
      phonemes: [1],
      markers: [
        [1, 0],
        [1, 1234],
      ],
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { player } = setup({ 'a.acm': new Uint8Array(4), 'a.lip': bad });
    const h = await player.say('a.acm', { lipPath: 'a.lip' });
    expect(h.hasLip).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('uszkodzony LIP: hasLip=false, audio gra', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { ctx, player } = setup({ 'a.acm': new Uint8Array(4), 'a.lip': new Uint8Array(7) });
    const h = await player.say('a.acm', { lipPath: 'a.lip' });
    expect(h.hasLip).toBe(false);
    expect(ctx.sources).toHaveLength(1);
    warn.mockRestore();
  });

  it('(c) brak ACM: Promise odrzucony SpeechError, stop() bezpieczne', async () => {
    const { player } = setup({});
    await expect(player.say('nope.acm')).rejects.toBeInstanceOf(SpeechError);
    expect(() => player.stop()).not.toThrow();
  });

  it('blad dekodera ACM: SpeechError', async () => {
    const { player, acm } = setup({ 'a.acm': new Uint8Array(4) });
    acm.decode.mockRejectedValueOnce(new Error('zly acm'));
    await expect(player.say('a.acm')).rejects.toBeInstanceOf(SpeechError);
  });

  it('lipsync: onMouth wg ctx.currentTime, tylko przy zmianie klatki, na koncu 0', async () => {
    const { ctx, player, tick } = setup({ 'a.acm': new Uint8Array(4), 'a.lip': lipBytes });
    const onMouth = vi.fn();
    const onEnd = vi.fn();
    ctx.currentTime = 5;
    const h = await player.say('a.acm', { lipPath: 'a.lip', onMouth, onEnd });
    expect(h.hasLip).toBe(true);
    tick();
    expect(onMouth).toHaveBeenLastCalledWith(PHONEME_TO_FRAME[1]);
    tick();
    expect(onMouth).toHaveBeenCalledTimes(1);
    ctx.currentTime = 5.6; // 0.6 s = 1200 B
    tick();
    expect(onMouth).toHaveBeenLastCalledWith(PHONEME_TO_FRAME[9]);
    expect(onMouth).toHaveBeenCalledTimes(2);
    ctx.sources[0]!.finish();
    expect(onMouth).toHaveBeenLastCalledWith(0);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('(d) stop() w trakcie: onMouth(0) i onEnd dokladnie raz (takze po zdarzeniu ended)', async () => {
    const { ctx, player, tick } = setup({ 'a.acm': new Uint8Array(4), 'a.lip': lipBytes });
    const onMouth = vi.fn();
    const onEnd = vi.fn();
    await player.say('a.acm', { lipPath: 'a.lip', onMouth, onEnd });
    tick();
    player.stop();
    player.stop();
    ctx.sources[0]!.finish();
    expect(ctx.sources[0]!.stopCalls).toBe(1);
    expect(onMouth).toHaveBeenLastCalledWith(0);
    expect(onMouth.mock.calls.filter((c) => c[0] === 0)).toHaveLength(1);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('nowe say() zatrzymuje poprzednie', async () => {
    const { ctx, player } = setup({ 'a.acm': new Uint8Array(4) });
    const onEnd = vi.fn();
    await player.say('a.acm', { onEnd });
    await player.say('a.acm');
    expect(ctx.sources[0]!.stopCalls).toBe(1);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('napisy: handle.subtitle', async () => {
    const { player } = setup({ 'a.acm': new Uint8Array(4) });
    const h = await player.say('a.acm', { subtitle: 'Czesc.' });
    expect(h.subtitle).toBe('Czesc.');
  });
});
