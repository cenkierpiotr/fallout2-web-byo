import { describe, expect, it } from 'vitest';
import { PcmStreamSource, type PcmAudioContextLike } from './pcm-stream.js';

function fakeCtx() {
  const started: { when: number; data: Float32Array[]; rate: number; ended: boolean }[] = [];
  const ctx = {
    currentTime: 0,
    destination: {},
    createBuffer(channels: number, length: number, rate: number) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return {
        duration: length / rate,
        sampleRate: rate,
        getChannelData: (c: number) => data[c]!,
        _data: data,
      };
    },
    createBufferSource() {
      const rec = { when: -1, data: [] as Float32Array[], rate: 0, ended: false };
      const node = {
        buffer: null as null | { _data: Float32Array[]; sampleRate: number },
        onended: null as null | ((ev: Event) => unknown),
        connect() {},
        start(when: number) {
          rec.when = when;
          rec.data = node.buffer!._data;
          rec.rate = node.buffer!.sampleRate;
          started.push(rec);
        },
        stop() {
          rec.ended = true;
        },
      };
      return node;
    },
    close: async () => {},
  };
  return { ctx: ctx as unknown as PcmAudioContextLike & { currentTime: number }, started };
}

describe('PcmStreamSource', () => {
  it('rozdziela stereo na kanaly i skaluje do -1..1', () => {
    const { ctx, started } = fakeCtx();
    const s = new PcmStreamSource(ctx);
    s.push(Int16Array.from([32767, -32768, 0, 16384]), 22050, true);
    expect(started).toHaveLength(1);
    const [l, r] = started[0]!.data;
    expect(l![0]).toBeCloseTo(32767 / 32768, 5);
    expect(r![0]).toBeCloseTo(-1, 5);
    expect(l![1]).toBe(0);
    expect(r![1]).toBeCloseTo(0.5, 5);
    expect(started[0]!.rate).toBe(22050);
  });

  it('mono daje jeden kanal', () => {
    const { ctx, started } = fakeCtx();
    new PcmStreamSource(ctx).push(Int16Array.from([1, 2, 3]), 11025, false);
    expect(started[0]!.data).toHaveLength(1);
    expect(started[0]!.data[0]).toHaveLength(3);
  });

  it('kolejne porcje sa szeregowane bez przerwy', () => {
    const { ctx, started } = fakeCtx();
    const s = new PcmStreamSource(ctx, 0.1);
    s.push(new Int16Array(2 * 2205), 22050, true); // 0.1 s
    s.push(new Int16Array(2 * 2205), 22050, true);
    expect(started[0]!.when).toBeCloseTo(0.1, 6);
    expect(started[1]!.when).toBeCloseTo(0.2, 6);
  });

  it('po niedobiorze buforow (underrun) rusza od now + lead', () => {
    const { ctx, started } = fakeCtx();
    const s = new PcmStreamSource(ctx, 0.1);
    s.push(new Int16Array(2 * 2205), 22050, true);
    ctx.currentTime = 5;
    s.push(new Int16Array(2 * 2205), 22050, true);
    expect(started[1]!.when).toBeCloseTo(5.1, 6);
  });

  it('stop zatrzymuje zaplanowane zrodla i ignoruje dalsze push', () => {
    const { ctx, started } = fakeCtx();
    const s = new PcmStreamSource(ctx);
    s.push(new Int16Array(4), 22050, true);
    s.stop();
    expect(started[0]!.ended).toBe(true);
    s.push(new Int16Array(4), 22050, true);
    expect(started).toHaveLength(1);
  });

  it('pusta porcja nic nie planuje', () => {
    const { ctx, started } = fakeCtx();
    new PcmStreamSource(ctx).push(new Int16Array(0), 22050, true);
    expect(started).toHaveLength(0);
  });
});
