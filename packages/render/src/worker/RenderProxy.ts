/**
 * RenderProxy + RenderWorkerCore (Zadanie 36). DOMYSLNIE WYLACZONE (`enabled` false):
 * tryb inline wywoluje ten sam kontrakt bezposrednio na `inlineSink`.
 * Brak zaleznosci od DOM: wszystko wstrzykiwane (testy node).
 */

export type RenderBackend = 'webgl2' | 'webgpu' | 'auto';

export type RenderCommand =
  | { type: 'scene'; data: unknown }
  | { type: 'camera'; x: number; y: number; zoom: number }
  | { type: 'lights'; data: unknown }
  | { type: 'settings'; preset: string };

export interface FrameStats {
  fps: number;
  drawCalls: number;
  vramBytes: number;
  size: { w: number; h: number };
}

export type WorkerMsg =
  | { kind: 'init'; canvas: unknown; backend: RenderBackend; w: number; h: number; dpr: number }
  | { kind: 'cmds'; cmds: RenderCommand[] }
  | { kind: 'resize'; w: number; h: number; dpr: number }
  | { kind: 'stats-req'; id: number };

export type WorkerReply = { kind: 'stats'; id: number; stats: FrameStats };

export interface RenderSink {
  init(canvas: unknown, backend: RenderBackend, w: number, h: number, dpr: number): void;
  apply(cmds: RenderCommand[]): void;
  resize(w: number, h: number, dpr: number): void;
  stats(): FrameStats;
}

export interface WorkerLike {
  postMessage(m: WorkerMsg, transfer?: unknown[]): void;
  onmessage: ((e: { data: WorkerReply }) => void) | null;
  terminate(): void;
}

interface SupportEnv {
  OffscreenCanvas?: unknown;
  canvasProto?: { transferControlToOffscreen?: unknown };
}

/** Zostaje tylko ostatnia komenda kazdego typu; kolejnosc wg ostatniego wystapienia. */
export function coalesceCommands(cmds: RenderCommand[]): RenderCommand[] {
  const seen = new Set<string>();
  const out: RenderCommand[] = [];
  for (let i = cmds.length - 1; i >= 0; i--) {
    const c = cmds[i]!;
    if (seen.has(c.type)) continue;
    seen.add(c.type);
    out.push(c);
  }
  return out.reverse();
}

/** Strona workera: odbiera komunikaty i wywoluje sink. */
export class RenderWorkerCore {
  constructor(private readonly sink: RenderSink) {}

  handle(msg: WorkerMsg): WorkerReply | undefined {
    switch (msg.kind) {
      case 'init':
        this.sink.init(msg.canvas, msg.backend, msg.w, msg.h, msg.dpr);
        return undefined;
      case 'cmds':
        this.sink.apply(msg.cmds);
        return undefined;
      case 'resize':
        this.sink.resize(msg.w, msg.h, msg.dpr);
        return undefined;
      case 'stats-req':
        return { kind: 'stats', id: msg.id, stats: this.sink.stats() };
    }
  }
}

/** Podpina RenderWorkerCore pod `self` workera. */
export function attachWorker(
  scope: {
    onmessage: ((e: { data: WorkerMsg }) => void) | null;
    postMessage(m: WorkerReply): void;
  },
  sink: RenderSink,
): RenderWorkerCore {
  const core = new RenderWorkerCore(sink);
  scope.onmessage = (e) => {
    const reply = core.handle(e.data);
    if (reply) scope.postMessage(reply);
  };
  return core;
}

export interface RenderProxyOptions {
  backend: RenderBackend;
  /** Domyslnie false: worker jest eksperymentalny. */
  enabled?: boolean;
  createWorker?: () => WorkerLike;
  inlineSink?: RenderSink;
  env?: SupportEnv;
  schedule?: (cb: () => void) => void;
  size?: { w: number; h: number; dpr: number };
}

export class RenderProxy {
  readonly mode: 'worker' | 'inline';
  private worker: WorkerLike | null = null;
  private sink: RenderSink | null = null;
  private pending: RenderCommand[] = [];
  private scheduled = false;
  private nextId = 1;
  private readonly waiting = new Map<number, (s: FrameStats) => void>();
  private readonly schedule: (cb: () => void) => void;

  static supported(env?: SupportEnv): boolean {
    const g = globalThis as {
      OffscreenCanvas?: unknown;
      HTMLCanvasElement?: { prototype: { transferControlToOffscreen?: unknown } };
    };
    const off = env ? env.OffscreenCanvas : g.OffscreenCanvas;
    const proto = env ? env.canvasProto : g.HTMLCanvasElement?.prototype;
    return !!off && typeof proto?.transferControlToOffscreen === 'function';
  }

  constructor(
    canvas: { width: number; height: number; transferControlToOffscreen?(): unknown },
    opts: RenderProxyOptions,
  ) {
    const size = opts.size ?? { w: canvas.width, h: canvas.height, dpr: 1 };
    this.schedule =
      opts.schedule ??
      ((cb) => {
        const raf = (globalThis as { requestAnimationFrame?: (cb: () => void) => unknown })
          .requestAnimationFrame;
        if (raf) raf(cb);
        else setTimeout(cb, 16);
      });

    if (opts.enabled === true && opts.createWorker && RenderProxy.supported(opts.env)) {
      const offscreen = canvas.transferControlToOffscreen?.();
      if (offscreen) {
        this.mode = 'worker';
        const w = opts.createWorker();
        this.worker = w;
        w.onmessage = (e) => {
          const r = e.data;
          if (r.kind !== 'stats') return;
          const res = this.waiting.get(r.id);
          if (res) {
            this.waiting.delete(r.id);
            res(r.stats);
          }
        };
        w.postMessage(
          {
            kind: 'init',
            canvas: offscreen,
            backend: opts.backend,
            w: size.w,
            h: size.h,
            dpr: size.dpr,
          },
          [offscreen],
        );
        return;
      }
    }
    this.mode = 'inline';
    this.sink = opts.inlineSink ?? {
      init: () => undefined,
      apply: () => undefined,
      resize: () => undefined,
      stats: () => ({ fps: 0, drawCalls: 0, vramBytes: 0, size: { w: size.w, h: size.h } }),
    };
    this.sink.init(canvas, opts.backend, size.w, size.h, size.dpr);
  }

  post(cmd: RenderCommand): void {
    this.pending.push(cmd);
    if (this.scheduled) return;
    this.scheduled = true;
    this.schedule(() => this.flush());
  }

  private flush(): void {
    this.scheduled = false;
    if (this.pending.length === 0) return;
    const cmds = coalesceCommands(this.pending);
    this.pending = [];
    if (this.worker) this.worker.postMessage({ kind: 'cmds', cmds });
    else this.sink?.apply(cmds);
  }

  resize(w: number, h: number, dpr: number): void {
    if (this.worker) this.worker.postMessage({ kind: 'resize', w, h, dpr });
    else this.sink?.resize(w, h, dpr);
  }

  frameStats(): Promise<FrameStats> {
    if (this.worker) {
      const id = this.nextId++;
      const w = this.worker;
      return new Promise((resolve) => {
        this.waiting.set(id, resolve);
        w.postMessage({ kind: 'stats-req', id });
      });
    }
    return Promise.resolve(
      this.sink?.stats() ?? { fps: 0, drawCalls: 0, vramBytes: 0, size: { w: 0, h: 0 } },
    );
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.pending = [];
    this.scheduled = false;
  }
}

/**
 * Backpressure klatek (renderWorker E3): nie wysylaj nowej klatki, dopoki worker nie potwierdzil
 * poprzedniej (inaczej kolejka rosnie). Maks. `maxInFlight` klatek w locie (domyslnie 1);
 * pominiete klatki sa liczone (`dropped`), bo scena i tak jest odbudowywana co klatke.
 */
export class FrameGate {
  private inFlight = 0;
  dropped = 0;
  constructor(private readonly maxInFlight = 1) {}

  /** true: wolno wyslac klatke (zajmuje slot). */
  tryAcquire(): boolean {
    if (this.inFlight >= this.maxInFlight) {
      this.dropped++;
      return false;
    }
    this.inFlight++;
    return true;
  }

  /** Worker potwierdzil klatke. */
  release(): void {
    if (this.inFlight > 0) this.inFlight--;
  }

  reset(): void {
    this.inFlight = 0;
  }
}
