import { describe, expect, it } from 'vitest';
import {
  RenderProxy,
  RenderWorkerCore,
  coalesceCommands,
  type FrameStats,
  type RenderCommand,
  type RenderSink,
  type WorkerLike,
  type WorkerMsg,
  type WorkerReply,
} from '../../src/worker/RenderProxy.js';

function fakeSink(): RenderSink & { applied: RenderCommand[][]; size: { w: number; h: number } } {
  const s = {
    applied: [] as RenderCommand[][],
    size: { w: 0, h: 0 },
    init(_c: unknown, _b: unknown, w: number, h: number) {
      s.size = { w, h };
    },
    apply(c: RenderCommand[]) {
      s.applied.push(c);
    },
    resize(w: number, h: number) {
      s.size = { w, h };
    },
    stats(): FrameStats {
      return { fps: 60, drawCalls: 3, vramBytes: 10, size: s.size };
    },
  };
  return s;
}

const SUPPORTED = { OffscreenCanvas: {}, canvasProto: { transferControlToOffscreen: () => ({}) } };
const canvas = { width: 100, height: 50, transferControlToOffscreen: () => ({ off: true }) };

function manualSchedule() {
  const q: (() => void)[] = [];
  return { schedule: (cb: () => void) => q.push(cb), run: () => q.splice(0).forEach((f) => f()) };
}

function loopbackWorker(core: RenderWorkerCore) {
  const sent: WorkerMsg[] = [];
  const w: WorkerLike = {
    onmessage: null,
    postMessage(m) {
      sent.push(m);
      const r: WorkerReply | undefined = core.handle(m);
      if (r) queueMicrotask(() => w.onmessage?.({ data: r }));
    },
    terminate() {},
  };
  return { w, sent };
}

describe('RenderProxy', () => {
  it('supported() wymaga OffscreenCanvas i transferControlToOffscreen', () => {
    expect(RenderProxy.supported({})).toBe(false);
    expect(RenderProxy.supported(SUPPORTED)).toBe(true);
  });

  it('bez OffscreenCanvas: tryb inline, frameStats().fps > 0', async () => {
    const sink = fakeSink();
    const p = new RenderProxy(canvas, { backend: 'webgl2', inlineSink: sink, env: {} });
    expect(p.mode).toBe('inline');
    expect((await p.frameStats()).fps).toBeGreaterThan(0);
  });

  it('domyslnie wylaczone nawet gdy wspierane', () => {
    const sink = fakeSink();
    const { w } = loopbackWorker(new RenderWorkerCore(fakeSink()));
    const p = new RenderProxy(canvas, {
      backend: 'auto',
      inlineSink: sink,
      env: SUPPORTED,
      createWorker: () => w,
    });
    expect(p.mode).toBe('inline');
  });

  it('worker: resize zmienia rozmiar widoczny w frameStats', async () => {
    const sink = fakeSink();
    const { w } = loopbackWorker(new RenderWorkerCore(sink));
    const p = new RenderProxy(canvas, {
      backend: 'webgl2',
      enabled: true,
      env: SUPPORTED,
      createWorker: () => w,
    });
    expect(p.mode).toBe('worker');
    expect((await p.frameStats()).size).toEqual({ w: 100, h: 50 });
    p.resize(640, 480, 2);
    expect((await p.frameStats()).size).toEqual({ w: 640, h: 480 });
  });

  it('1000 komend camera -> jedna wiadomosc z ostatnia', () => {
    const { w, sent } = loopbackWorker(new RenderWorkerCore(fakeSink()));
    const sch = manualSchedule();
    const p = new RenderProxy(canvas, {
      backend: 'webgl2',
      enabled: true,
      env: SUPPORTED,
      createWorker: () => w,
      schedule: sch.schedule,
    });
    const before = sent.length;
    for (let i = 0; i < 1000; i++) p.post({ type: 'camera', x: i, y: 0, zoom: 1 });
    sch.run();
    const cmdMsgs = sent.slice(before).filter((m) => m.kind === 'cmds');
    expect(cmdMsgs).toHaveLength(1);
    const cmds = (cmdMsgs[0] as Extract<WorkerMsg, { kind: 'cmds' }>).cmds;
    expect(cmds).toHaveLength(1);
    expect(cmds[0]).toMatchObject({ type: 'camera', x: 999 });
  });

  it('brak oczekujacych komend: nic nie jest wysylane', () => {
    const sink = fakeSink();
    const sch = manualSchedule();
    const p = new RenderProxy(canvas, {
      backend: 'webgl2',
      inlineSink: sink,
      env: {},
      schedule: sch.schedule,
    });
    sch.run();
    expect(sink.applied).toHaveLength(0);
    p.post({ type: 'settings', preset: 'niski' });
    sch.run();
    expect(sink.applied).toHaveLength(1);
  });

  it('coalesceCommands: ostatnia z kazdego typu, kolejnosc wg ostatniego wystapienia', () => {
    const out = coalesceCommands([
      { type: 'camera', x: 1, y: 0, zoom: 1 },
      { type: 'settings', preset: 'a' },
      { type: 'camera', x: 2, y: 0, zoom: 1 },
      { type: 'lights', data: 1 },
    ]);
    expect(out.map((c) => c.type)).toEqual(['settings', 'camera', 'lights']);
    expect(out[1]).toMatchObject({ x: 2 });
  });
});
