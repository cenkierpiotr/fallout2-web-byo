import { describe, expect, it } from 'vitest';
import type { AcmStreamHandle } from '../src/acm/worker-client.js';
import { MusicPlayer } from '../src/music/MusicPlayer.js';
import type { MusicNodeLike } from '../src/music/MusicPlayer.js';
import { resampleLinear } from '../src/worklet/resample.js';

class Param {
  calls: Array<[string, number, number]> = [];
  setValueAtTime(v: number, t: number): void {
    this.calls.push(['set', v, t]);
  }
  linearRampToValueAtTime(v: number, t: number): void {
    this.calls.push(['ramp', v, t]);
  }
}
class Gain {
  gain = new Param();
  disconnected = false;
  connect(): void {}
  disconnect(): void {
    this.disconnected = true;
  }
}
class Node implements MusicNodeLike {
  pushed: Array<{ type: string; samples: Int16Array; done: boolean }> = [];
  port = {
    onmessage: null as ((e: { data: unknown }) => void) | null,
    postMessage: (m: unknown): void => {
      this.pushed.push(m as never);
    },
  };
  disconnected = false;
  connect(): void {}
  disconnect(): void {
    this.disconnected = true;
  }
  need(): void {
    this.port.onmessage?.({ data: { type: 'need', frames: 1000 } });
  }
}
function setup(totalChunks = 2) {
  const ctx = {
    currentTime: 10,
    gains: [] as Gain[],
    createGain() {
      const g = new Gain();
      this.gains.push(g);
      return g;
    },
  };
  const streams: Array<{ closed: number; seeks: number[]; reads: number }> = [];
  const nodes: Node[] = [];
  const timers: Array<() => void> = [];
  const acm = {
    async openStream(): Promise<AcmStreamHandle> {
      const st = { closed: 0, seeks: [] as number[], reads: 0 };
      streams.push(st);
      return {
        header: { sampleRate: 22050, channels: 1 } as never,
        async read() {
          st.reads++;
          const done = st.reads % totalChunks === 0;
          return { samples: new Int16Array(100).fill(7), done };
        },
        async seek(n: number) {
          st.seeks.push(n);
        },
        close() {
          st.closed++;
        },
      };
    },
  };
  const vfs = { open: async () => new Uint8Array(4) };
  const p = new MusicPlayer(
    ctx,
    vfs,
    acm,
    {},
    {
      createNode: () => {
        const n = new Node();
        nodes.push(n);
        return n;
      },
      schedule: (fn) => timers.push(fn),
    },
  );
  return { p, ctx, streams, nodes, timers };
}

describe('resampleLinear', () => {
  it('dlugosc round(n*dst/src), staly sygnal, brak NaN', () => {
    const src = new Float32Array(1000).fill(0.25);
    const out = resampleLinear(src, 22050, 48000);
    expect(out.length).toBe(Math.round((1000 * 48000) / 22050));
    expect(out.every((v) => v === 0.25)).toBe(true);
    expect(resampleLinear(new Float32Array(0), 1, 2).length).toBe(0);
    expect(() => resampleLinear(src, 0, 1)).toThrow();
  });
});

describe('MusicPlayer', () => {
  it('play dwa razy ten sam utwor jest no-op', async () => {
    const { p, streams } = setup();
    await p.play('a.acm');
    await p.play('a.acm');
    expect(streams.length).toBe(1);
    expect(p.current).toBe('a.acm');
  });

  it('crossfade: stary do 0, nowy od 0 do 1 w zadanym czasie, stary zwolniony po fade', async () => {
    const { p, ctx, streams, nodes, timers } = setup();
    await p.play('a.acm');
    await p.play('b.acm', { crossfadeMs: 1000 });
    const [gA, gB] = ctx.gains as [Gain, Gain];
    expect(gB.gain.calls).toEqual([
      ['set', 0, 10],
      ['ramp', 1, 11],
    ]);
    expect(gA.gain.calls.at(-1)).toEqual(['ramp', 0, 11]);
    expect(streams[0]!.closed).toBe(0);
    timers[0]!();
    expect(streams[0]!.closed).toBe(1);
    expect(nodes[0]!.disconnected).toBe(true);
    expect(p.current).toBe('b.acm');
  });

  it('petla: po done seek(0) i push z done=false', async () => {
    const { p, nodes, streams } = setup(1);
    await p.play('a.acm', { loop: true });
    expect(streams[0]!.seeks).toEqual([0]);
    expect(nodes[0]!.pushed[0]!.done).toBe(false);
  });

  it('bez petli: done=true i brak seek', async () => {
    const { p, nodes, streams } = setup(1);
    await p.play('a.acm', { loop: false });
    expect(streams[0]!.seeks).toEqual([]);
    expect(nodes[0]!.pushed[0]!.done).toBe(true);
  });

  it('zdarzenie need dosyla kolejny kawalek', async () => {
    const { p, nodes } = setup(5);
    await p.play('a.acm');
    nodes[0]!.need();
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(nodes[0]!.pushed.length).toBe(2);
  });

  it('stop zwalnia strumien, current=null', async () => {
    const { p, streams } = setup();
    await p.play('a.acm');
    await p.stop();
    expect(streams[0]!.closed).toBe(1);
    expect(p.current).toBeNull();
  });
});
