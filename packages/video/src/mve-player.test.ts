import { describe, expect, it } from 'vitest';
import {
  MvePlayer,
  fadeAt,
  type MovieAssets,
  type MovieClock,
  type MovieFrameOut,
  type MovieSink,
} from './mve-player.js';

const u16 = (v: number): number[] => [v & 255, v >> 8];
const op = (code: number, body: number[]): number[] => [...u16(body.length), code, 0, ...body];
const rec = (type: number, ops: number[][]): number[] => {
  const b = ops.flat();
  return [...u16(b.length), ...u16(type), ...b];
};
const header = (): number[] => [
  ...Array.from('Interplay MVE File', (c) => c.charCodeAt(0)),
  0x1a,
  0,
  0x1a,
  0,
  0,
  1,
  0x33,
  0x11,
];

/** Film 16x8 z n klatkami (tryb E: wypelnienie kolorem 1 i 2), timer 1e6/66667 us. */
function movie(n: number): Uint8Array {
  const pal = [1, 0, ...u16(3), 0, 0, 0, 63, 0, 0, 0, 63, 0];
  const timer = [...u16(66667 & 0xffff), ...u16(66667 >> 16), ...u16(1)];
  const out = [
    ...header(),
    ...rec(0, [
      op(0x02, timer),
      op(0x0a, [...u16(16), ...u16(8), 0, 0]),
      op(0x05, [...u16(2), ...u16(1), 0, 0, 0, 0]),
    ]),
  ];
  for (let i = 0; i < n; i++) {
    out.push(
      ...rec(3, [
        ...(i === 0 ? [op(0x0c, pal)] : []),
        op(0x0f, [0xee]),
        op(0x11, [...new Array(14).fill(0), 1 + (i % 2), 2]),
      ]),
    );
  }
  return new Uint8Array(out);
}

function fakeClock(): MovieClock & { t: number; sleeps: number[] } {
  const c = {
    t: 0,
    sleeps: [] as number[],
    now() {
      return c.t;
    },
    async sleep(ms: number) {
      c.sleeps.push(ms);
      c.t += ms;
    },
  };
  return c;
}

function harness(assets: MovieAssets | null | Error) {
  const frames: MovieFrameOut[] = [];
  const subs: (string | null)[] = [];
  const audio: number[] = [];
  const sink: MovieSink = {
    frame: (f) => frames.push(f),
    subtitle: (t) => subs.push(t),
    audio: (s) => audio.push(s.length),
  };
  const clock = fakeClock();
  const player = new MvePlayer({
    sink,
    clock,
    load: async () => {
      if (assets instanceof Error) throw assets;
      return assets;
    },
  });
  return { player, frames, subs, audio, clock };
}

describe('MvePlayer', () => {
  it('gra wszystkie klatki, tempo wg fps, wymiary obszaru wideo', async () => {
    const h = harness({ mve: movie(5) });
    expect(await h.player.play('elder')).toBe('finished');
    expect(h.frames.map((f) => f.index)).toEqual([0, 1, 2, 3, 4]);
    expect(h.frames[0]!.width).toBe(16);
    expect(h.frames[0]!.height).toBe(8);
    expect(h.frames[0]!.rgba.length).toBe(16 * 8 * 4);
    expect(h.clock.t).toBeCloseTo(5 * (66667 / 1000), 1); // 5 okresow
  });

  it('brak pliku: missing szybko i bez klatek', async () => {
    const h = harness(null);
    expect(await h.player.play('iplogo')).toBe('missing');
    expect(h.frames).toHaveLength(0);
  });

  it('wyjatek load i zly naglowek daja error', async () => {
    expect(await harness(new Error('io')).player.play('iplogo')).toBe('error');
    expect(await harness({ mve: new Uint8Array(40) }).player.play('iplogo')).toBe('error');
  });

  it('test_mve_player_truncated_file_ends_gracefully: obciety plik konczy sie bez wyjatku, >=1 klatka', async () => {
    const full = movie(4);
    const h = harness({ mve: full.subarray(0, Math.floor(full.length * 0.8)) });
    const r = await h.player.play('elder');
    expect(['finished', 'error']).toContain(r);
    expect(h.frames.length).toBeGreaterThanOrEqual(1);
  });

  it('skip konczy film jako skipped (po 2 klatkach) i zdejmuje napis', async () => {
    const frames: number[] = [];
    const subs: (string | null)[] = [];
    const player: MvePlayer = new MvePlayer({
      clock: fakeClock(),
      load: async () => ({ mve: movie(10), sve: '0:Napis' }),
      sink: {
        frame: (f) => {
          frames.push(f.index);
          if (f.index === 1) player.skip();
        },
        subtitle: (t) => subs.push(t),
      },
    });
    expect(await player.play('elder')).toBe('skipped');
    expect(frames).toEqual([0, 1]);
    expect(subs).toEqual(['Napis', null]);
  });

  it('skippable=false ignoruje skip', async () => {
    let n = 0;
    const player: MvePlayer = new MvePlayer({
      clock: fakeClock(),
      load: async () => ({ mve: movie(3) }),
      sink: {
        frame: () => {
          n++;
          player.skip();
        },
        subtitle: () => {},
      },
    });
    expect(await player.play('elder', { skippable: false })).toBe('finished');
    expect(n).toBe(3);
  });

  it('napisy SVE: zmiana tylko na granicy cue, pusty cue czysci', async () => {
    const h = harness({ mve: movie(6), sve: '1:Jeden\r\n3:\r\n4:Cztery\r\n' });
    await h.player.play('elder');
    expect(h.subs).toEqual(['Jeden', null, 'Cztery', null]);
  });

  it('subtitles=false pomija napisy', async () => {
    const h = harness({ mve: movie(3), sve: '0:X' });
    await h.player.play('elder', { subtitles: false });
    expect(h.subs).toEqual([]);
  });

  it('fade z .cfg trafia do klatek', async () => {
    const cfg =
      '[info]\neffect_frames=0,3\n[0]\nfade_type=in\nfade_color=0,0,63\nfade_steps=2\n[3]\nfade_type=out\nfade_color=0,0,0\nfade_steps=1\n';
    const h = harness({ mve: movie(5), cfg });
    await h.player.play('elder');
    expect(h.frames.map((f) => f.fade?.amount ?? 0)).toEqual([0.5, 0, 0, 1, 1]);
    expect(h.frames[0]!.fade!.color).toEqual([0, 0, 252]);
  });

  it('druga rownolegla gra rzuca wyjatek', async () => {
    const h = harness({ mve: movie(3) });
    const p = h.player.play('elder');
    await expect(h.player.play('intro')).rejects.toThrow();
    await p;
  });
});

describe('fadeAt', () => {
  const eff = [
    { startFrame: 0, kind: 'in' as const, color: [0, 0, 0] as [number, number, number], steps: 4 },
    {
      startFrame: 10,
      kind: 'out' as const,
      color: [63, 0, 0] as [number, number, number],
      steps: 2,
    },
  ];
  it('wejscie, przerwa, wyjscie, trzymanie koloru', () => {
    expect(fadeAt(eff, 0)!.amount).toBeCloseTo(0.75);
    expect(fadeAt(eff, 3)).toBeNull();
    expect(fadeAt(eff, 5)).toBeNull();
    expect(fadeAt(eff, 10)!.amount).toBeCloseTo(0.5);
    expect(fadeAt(eff, 11)).toEqual({ color: [252, 0, 0], amount: 1 });
    expect(fadeAt(eff, 99)).toEqual({ color: [252, 0, 0], amount: 1 });
  });
  it('przed pierwszym fade in: pelny kolor; bez efektow: null', () => {
    const e = [
      {
        startFrame: 29,
        kind: 'in' as const,
        color: [0, 0, 0] as [number, number, number],
        steps: 30,
      },
    ];
    expect(fadeAt(e, 0)).toEqual({ color: [0, 0, 0], amount: 1 });
    expect(fadeAt([], 5)).toBeNull();
  });
});
