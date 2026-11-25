/**
 * renderWorker E2/E3/E4: `RemoteGfxDevice` (strona glowna) i `DeviceWorkerHost` (strona workera).
 *
 * `RemoteGfxDevice` implementuje `GfxDevice`, ale zamiast rysowac, zamienia wywolania na komendy
 * (`DeviceCommand`) wysylane przez `RemoteTransport`. Buduje sie batch w watku glownym, a worker robi
 * tylko submit GL. Identyfikatory tekstur przydziela strona glowna (createIndexedTexture jest
 * synchroniczne), worker tworzy teksture o tym samym id (mapa id -> prawdziwa tekstura).
 *
 * Zadne z tych klas nie dotykaja DOM: transport i prawdziwe urzadzenie sa wstrzykiwane (testy node).
 * Kolejnosc komend jest zachowana (postMessage jest uporzadkowany), wiec nie ma tu coalescingu.
 */
import { Camera2D } from '../camera.js';
import type { DeviceFrameStats, GfxDevice, IndexedTexture } from '../gfx-device.js';
import type { LitFrameState } from '../lighting/types.js';
import type { PostProcessConfig } from '../postprocess.js';
import { SpriteBatch, type TransferableBatch } from '../sprite-batch.js';
import { FrameGate } from './RenderProxy.js';

export interface FrameCamera {
  x: number;
  y: number;
  zoom: number;
  snapInteger: boolean;
}

export type DeviceCommand =
  | {
      type: 'tex-create';
      id: number;
      width: number;
      height: number;
      rgba: boolean;
      linear: boolean;
      data?: Uint8Array;
    }
  | { type: 'tex-update'; id: number; x: number; y: number; w: number; h: number; data: Uint8Array }
  | { type: 'tex-delete'; id: number }
  | { type: 'palette'; rgba: Uint8Array }
  | { type: 'aux'; id: number; normal?: Uint8Array; depth?: Uint8Array }
  /**
   * E6: `reuseLightMap` = mapa swiatla nie zmienila sie (ta sama wersja i rozmiar), `state.lightMap` jest
   * pominiete, a host wstawia swoja ostatnio otrzymana kopie (bez ponownego kopiowania w/c bajtow).
   */
  | { type: 'lighting'; state: LitFrameState | null; reuseLightMap?: boolean }
  | { type: 'postprocess'; cfg: PostProcessConfig | null }
  | { type: 'resize'; cssWidth: number; cssHeight: number; dpr: number }
  | {
      type: 'frame';
      seq: number;
      clear: [number, number, number, number];
      draws: { camera: FrameCamera; batch: TransferableBatch }[];
    }
  | { type: 'pixels'; id: number };

export type DeviceReply =
  | { type: 'frame-done'; seq: number; stats: DeviceFrameStats }
  | { type: 'context-lost' }
  | { type: 'context-restored' }
  | { type: 'pixels'; id: number; width: number; height: number; data: Uint8Array };

export interface RemoteTransport {
  /** Wysyla komendy; `transfer` to bufory oddawane workerowi (zero-copy). */
  post(cmds: DeviceCommand[], transfer: ArrayBuffer[]): void;
  onReply: ((r: DeviceReply) => void) | null;
  dispose?(): void;
}

/** Liczniki strony glownej (diagnostyka i pomiar E1). */
export interface RemoteDeviceStats {
  /** Czas (ms) ostatniego endFrame po stronie glownej: serializacja + postMessage. */
  submitMs: number;
  framesSent: number;
  framesDropped: number;
  /** Bajty batcha wyslane w ostatniej klatce. */
  lastFrameBytes: number;
}

export interface RemoteGfxDeviceOptions {
  transport: RemoteTransport;
  /** Poczatkowy rozmiar bufora (px urzadzenia) i dpr. */
  width?: number;
  height?: number;
  dpr?: number;
  /** Wolno dzialajaca klatka w locie (domyslnie 1, patrz FrameGate). */
  maxFramesInFlight?: number;
  /**
   * Strona glowna ustawia tylko rozmiar CSS (canvas po transferControlToOffscreen nie pozwala ruszac
   * width/height); worker ustawia bufor.
   */
  applyCssSize?: (cssWidth: number, cssHeight: number) => void;
  now?: () => number;
}

function copyBytes(d: Uint8Array): Uint8Array {
  return d.slice();
}

export class RemoteGfxDevice implements GfxDevice {
  width: number;
  height: number;
  dpr: number;
  contextLost = false;
  onContextLost?: () => void;
  onContextRestored?: () => void;
  readonly stats: DeviceFrameStats = { drawCalls: 0, uploadedBytes: 0, fillPixels: 0 };
  readonly remote: RemoteDeviceStats = {
    submitMs: 0,
    framesSent: 0,
    framesDropped: 0,
    lastFrameBytes: 0,
  };
  /** Wieksza o 1 przy kazdej wyslanej klatce; `lastAckedFrame` = ostatnia potwierdzona. */
  lastAckedFrame = 0;

  private readonly transport: RemoteTransport;
  private readonly gate: FrameGate;
  private readonly applyCssSize: ((w: number, h: number) => void) | undefined;
  private readonly now: () => number;
  private nextTexId = 1;
  private seq = 0;
  private nextPixelsId = 1;
  private readonly pixelWaiters = new Map<
    number,
    {
      resolve: (p: Uint8Array) => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout> | null;
    }
  >();
  /** E6: ostatnia wyslana mapa swiatla (referencja danych + wersja + rozmiar) do pominiecia powtorek. */
  private sentLightMap: {
    data: Uint8Array;
    width: number;
    height: number;
    version: number;
  } | null = null;
  private clear: [number, number, number, number] = [0, 0, 0, 1];
  private draws: { camera: FrameCamera; batch: TransferableBatch }[] = [];
  private inFrame = false;
  private disposed = false;

  constructor(opts: RemoteGfxDeviceOptions) {
    this.transport = opts.transport;
    this.width = opts.width ?? 1;
    this.height = opts.height ?? 1;
    this.dpr = opts.dpr ?? 1;
    this.gate = new FrameGate(opts.maxFramesInFlight ?? 1);
    this.applyCssSize = opts.applyCssSize;
    this.now = opts.now ?? ((): number => performance.now());
    this.transport.onReply = (r) => this.onReply(r);
  }

  /** Czy `GfxDevice` jest zdalne (do ominiecia sciezek wymagajacych synchronicznego GL). */
  readonly isRemote = true;

  private onReply(r: DeviceReply): void {
    switch (r.type) {
      case 'frame-done':
        this.gate.release();
        this.lastAckedFrame = r.seq;
        this.stats.drawCalls = r.stats.drawCalls;
        this.stats.uploadedBytes = r.stats.uploadedBytes;
        this.stats.fillPixels = r.stats.fillPixels;
        return;
      case 'context-lost':
        this.contextLost = true;
        // worker nie odda potwierdzenia utraconej klatki: zwolnij sloty, inaczej gate zablokuje render
        this.gate.reset();
        // odczyt zlecony przed utrata kontekstu nigdy nie dostanie odpowiedzi
        this.rejectPixelWaiters('renderWorker: utrata kontekstu GL, odczyt pikseli anulowany');
        this.onContextLost?.();
        return;
      case 'context-restored':
        this.contextLost = false;
        this.onContextRestored?.();
        return;
      case 'pixels': {
        const w = this.pixelWaiters.get(r.id);
        if (w) {
          this.pixelWaiters.delete(r.id);
          if (w.timer !== null) clearTimeout(w.timer);
          w.resolve(r.data);
        }
        return;
      }
    }
  }

  private send(cmd: DeviceCommand, transfer: ArrayBuffer[] = []): void {
    if (this.disposed) return;
    this.transport.post([cmd], transfer);
  }

  resize(cssWidth: number, cssHeight: number, dpr: number): void {
    this.dpr = dpr;
    // lustro rozmiaru bufora: adaptive-scale i render-scale czytaja width/height synchronicznie
    this.width = Math.max(1, Math.round(cssWidth * dpr));
    this.height = Math.max(1, Math.round(cssHeight * dpr));
    this.applyCssSize?.(cssWidth, cssHeight);
    this.send({ type: 'resize', cssWidth, cssHeight, dpr });
  }

  createIndexedTexture(width: number, height: number, data?: Uint8Array): IndexedTexture {
    const id = this.nextTexId++;
    const copy = data ? copyBytes(data) : undefined;
    this.send(
      {
        type: 'tex-create',
        id,
        width,
        height,
        rgba: false,
        linear: false,
        ...(copy ? { data: copy } : {}),
      },
      copy ? [copy.buffer as ArrayBuffer] : [],
    );
    return { id, width, height };
  }

  createRgbaTexture(
    width: number,
    height: number,
    data?: Uint8Array,
    opts?: { filter?: 'linear' | 'nearest' },
  ): IndexedTexture {
    const id = this.nextTexId++;
    const linear = opts?.filter !== 'nearest';
    const copy = data ? copyBytes(data) : undefined;
    this.send(
      {
        type: 'tex-create',
        id,
        width,
        height,
        rgba: true,
        linear,
        ...(copy ? { data: copy } : {}),
      },
      copy ? [copy.buffer as ArrayBuffer] : [],
    );
    return { id, width, height, rgba: true, linear };
  }

  updateIndexedTexture(
    t: IndexedTexture,
    x: number,
    y: number,
    w: number,
    h: number,
    data: Uint8Array,
  ): void {
    const copy = copyBytes(data);
    this.send({ type: 'tex-update', id: t.id, x, y, w, h, data: copy }, [
      copy.buffer as ArrayBuffer,
    ]);
  }

  deleteTexture(t: IndexedTexture): void {
    this.send({ type: 'tex-delete', id: t.id });
  }

  setPalette(rgba: Uint8Array): void {
    const copy = copyBytes(rgba);
    this.send({ type: 'palette', rgba: copy }, [copy.buffer as ArrayBuffer]);
  }

  setSpriteAux(t: IndexedTexture, aux: { normal?: Uint8Array; depth?: Uint8Array }): void {
    const normal = aux.normal ? copyBytes(aux.normal) : undefined;
    const depth = aux.depth ? copyBytes(aux.depth) : undefined;
    const transfer: ArrayBuffer[] = [];
    if (normal) transfer.push(normal.buffer as ArrayBuffer);
    if (depth) transfer.push(depth.buffer as ArrayBuffer);
    this.send(
      {
        type: 'aux',
        id: t.id,
        ...(normal ? { normal } : {}),
        ...(depth ? { depth } : {}),
      },
      transfer,
    );
  }

  setLighting(state: LitFrameState | null): void {
    if (!state || !state.lightMap) {
      this.sentLightMap = null;
      this.send({ type: 'lighting', state });
      return;
    }
    const lm = state.lightMap;
    const prev = this.sentLightMap;
    if (
      prev &&
      prev.data === lm.data &&
      prev.version === lm.version &&
      prev.width === lm.width &&
      prev.height === lm.height
    ) {
      // mapa bez zmian: nie kopiujemy w*h*3 bajtow co klatke, host uzyje swojej ostatniej kopii
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { lightMap: _omit, ...rest } = state;
      this.send({ type: 'lighting', state: rest, reuseLightMap: true });
      return;
    }
    this.sentLightMap = { data: lm.data, width: lm.width, height: lm.height, version: lm.version };
    // nowa wersja: kopia danych mapy przekazana przez transfer (bez drugiej kopii przy postMessage)
    const copy = copyBytes(lm.data);
    this.send({ type: 'lighting', state: { ...state, lightMap: { ...lm, data: copy } } }, [
      copy.buffer as ArrayBuffer,
    ]);
  }

  setPostProcess(cfg: PostProcessConfig | null): void {
    this.send({ type: 'postprocess', cfg });
  }

  beginFrame(clear: [number, number, number, number]): void {
    this.clear = clear;
    this.draws = [];
    this.inFrame = true;
  }

  drawSprites(batch: SpriteBatch, camera: Camera2D): void {
    if (!this.inFrame || batch.count === 0) return;
    this.draws.push({
      camera: {
        x: camera.x,
        y: camera.y,
        zoom: camera.zoom,
        snapInteger: camera.snapInteger,
      },
      batch: batch.toTransferable(),
    });
  }

  endFrame(): void {
    if (!this.inFrame) return;
    this.inFrame = false;
    const t0 = this.now();
    // backpressure: worker nie zdazyl z poprzednia klatka, scena i tak jest budowana od nowa co klatke
    if (this.contextLost || this.disposed || !this.gate.tryAcquire()) {
      this.remote.framesDropped++;
      this.draws = [];
      this.remote.submitMs = this.now() - t0;
      return;
    }
    const draws = this.draws;
    this.draws = [];
    const transfer: ArrayBuffer[] = [];
    let bytes = 0;
    for (const d of draws) {
      for (const b of SpriteBatch.transferList(d.batch)) {
        transfer.push(b);
        bytes += b.byteLength;
      }
    }
    this.seq++;
    this.transport.post([{ type: 'frame', seq: this.seq, clear: this.clear, draws }], transfer);
    this.remote.framesSent++;
    this.remote.lastFrameBytes = bytes;
    this.remote.submitMs = this.now() - t0;
  }

  /**
   * Synchroniczny odczyt niedostepny (GL zyje w workerze). Testy e2e uzywaja `readPixelsAsync`.
   */
  readPixels(): Uint8Array {
    throw new Error('RemoteGfxDevice.readPixels jest niedostepne: uzyj readPixelsAsync');
  }

  /**
   * Odczyt pikseli z workera (GL zyje tam). Obietnica jest odrzucana po `dispose()`, utracie kontekstu
   * albo po `timeoutMs` (domyslnie 5 s; 0 = bez limitu), zeby e2e/narzedzia nie wisialy bez konca.
   */
  readPixelsAsync(timeoutMs = 5000): Promise<Uint8Array> {
    if (this.disposed) return Promise.reject(new Error('renderWorker: urzadzenie zwolnione'));
    return new Promise((resolve, reject) => {
      const id = this.nextPixelsId++;
      const timer =
        timeoutMs > 0
          ? setTimeout(() => {
              if (this.pixelWaiters.delete(id))
                reject(new Error(`renderWorker: readPixels bez odpowiedzi po ${timeoutMs} ms`));
            }, timeoutMs)
          : null;
      this.pixelWaiters.set(id, { resolve, reject, timer });
      this.send({ type: 'pixels', id });
    });
  }

  private rejectPixelWaiters(msg: string): void {
    const waiters = [...this.pixelWaiters.values()];
    this.pixelWaiters.clear();
    for (const w of waiters) {
      if (w.timer !== null) clearTimeout(w.timer);
      w.reject(new Error(msg));
    }
  }

  /** Liczba klatek w locie nieskonfirmowanych (diagnostyka). */
  get framesDropped(): number {
    return this.remote.framesDropped;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.rejectPixelWaiters('renderWorker: urzadzenie zwolnione');
    this.transport.onReply = null;
    this.transport.dispose?.();
  }
}

/**
 * Odczyt pikseli dla dowolnego urzadzenia: tryb main (sync `readPixels`) i worker (`readPixelsAsync`).
 * Dla e2e/narzedzi, ktore nie powinny wiedziec, gdzie dziala GL.
 */
export function readDevicePixels(device: GfxDevice): Promise<Uint8Array> {
  const remote = device as Partial<RemoteGfxDevice>;
  if (remote.isRemote && typeof remote.readPixelsAsync === 'function')
    return remote.readPixelsAsync();
  try {
    return Promise.resolve(device.readPixels());
  } catch (e) {
    return Promise.reject(e instanceof Error ? e : new Error(String(e)));
  }
}

/** Widok `TransferableBatch` jako SpriteBatch (device czyta tylko `count` i `groups()`). */
function batchView(t: TransferableBatch, lookup: (id: number) => IndexedTexture): SpriteBatch {
  const groups = SpriteBatch.groupsFrom(t, lookup);
  const count = groups.reduce((n, g) => n + g.spriteCount, 0);
  return { count, ordered: t.ordered, groups: () => groups } as unknown as SpriteBatch;
}

/** Strona workera: wykonuje komendy na prawdziwym `GfxDevice` (WebGL2 na OffscreenCanvas). */
export class DeviceWorkerHost {
  private readonly textures = new Map<number, IndexedTexture>();
  /** E6: ostatnia otrzymana mapa swiatla; uzywana przy `reuseLightMap`. */
  private lightMap: LitFrameState['lightMap'] | undefined;

  constructor(
    private readonly device: GfxDevice,
    private readonly reply: (r: DeviceReply, transfer?: ArrayBuffer[]) => void,
  ) {
    device.onContextLost = (): void => this.reply({ type: 'context-lost' });
    device.onContextRestored = (): void => this.reply({ type: 'context-restored' });
  }

  private tex(id: number): IndexedTexture {
    const t = this.textures.get(id);
    if (!t) throw new Error(`renderWorker: nieznana tekstura ${id}`);
    return t;
  }

  /** Wywolywane przy wyjatku komendy (domyslnie console.error); host dziala dalej. */
  onError: (err: unknown, cmd: DeviceCommand) => void = (err, cmd) =>
    console.error(`renderWorker: komenda '${cmd.type}' nieudana`, err);

  /**
   * Wyjatek jednej komendy (np. nieznana tekstura) nie moze przerwac reszty paczki ani zostawic klatki
   * bez `frame-done`: strona glowna ma limit klatek w locie, wiec brak potwierdzenia zawiesilby render na stale.
   */
  handle(cmds: DeviceCommand[]): void {
    for (const c of cmds) {
      try {
        this.apply(c);
      } catch (err) {
        this.onError(err, c);
        if (c.type === 'frame') {
          this.reply({
            type: 'frame-done',
            seq: c.seq,
            stats: { drawCalls: 0, uploadedBytes: 0, fillPixels: 0 },
          });
        }
      }
    }
  }

  private apply(c: DeviceCommand): void {
    const d = this.device;
    switch (c.type) {
      case 'tex-create': {
        let t: IndexedTexture;
        if (c.rgba) {
          if (!d.createRgbaTexture) throw new Error('renderWorker: urzadzenie bez tekstur RGBA');
          t = d.createRgbaTexture(c.width, c.height, c.data, {
            filter: c.linear ? 'linear' : 'nearest',
          });
        } else {
          t = d.createIndexedTexture(c.width, c.height, c.data);
        }
        this.textures.set(c.id, t);
        return;
      }
      case 'tex-update':
        d.updateIndexedTexture(this.tex(c.id), c.x, c.y, c.w, c.h, c.data);
        return;
      case 'tex-delete': {
        const t = this.textures.get(c.id);
        if (t) d.deleteTexture?.(t);
        this.textures.delete(c.id);
        return;
      }
      case 'palette':
        d.setPalette(c.rgba);
        return;
      case 'aux':
        d.setSpriteAux?.(this.tex(c.id), {
          ...(c.normal ? { normal: c.normal } : {}),
          ...(c.depth ? { depth: c.depth } : {}),
        });
        return;
      case 'lighting': {
        let st = c.state;
        if (st) {
          if (st.lightMap) this.lightMap = st.lightMap;
          else if (c.reuseLightMap && this.lightMap) st = { ...st, lightMap: this.lightMap };
        } else this.lightMap = undefined;
        d.setLighting?.(st);
        return;
      }
      case 'postprocess':
        d.setPostProcess?.(c.cfg);
        return;
      case 'resize':
        d.resize(c.cssWidth, c.cssHeight, c.dpr);
        return;
      case 'frame': {
        d.beginFrame(c.clear);
        for (const draw of c.draws) {
          const cam = new Camera2D();
          cam.x = draw.camera.x;
          cam.y = draw.camera.y;
          cam.zoom = draw.camera.zoom;
          cam.snapInteger = draw.camera.snapInteger;
          d.drawSprites(
            batchView(draw.batch, (id) => this.tex(id)),
            cam,
          );
        }
        d.endFrame();
        const s = d.stats;
        this.reply({
          type: 'frame-done',
          seq: c.seq,
          stats: {
            drawCalls: s?.drawCalls ?? 0,
            uploadedBytes: s?.uploadedBytes ?? 0,
            fillPixels: s?.fillPixels ?? 0,
          },
        });
        return;
      }
      case 'pixels': {
        const data = d.readPixels();
        this.reply({ type: 'pixels', id: c.id, width: d.width, height: d.height, data }, [
          data.buffer as ArrayBuffer,
        ]);
        return;
      }
    }
  }
}

/**
 * Transport bez prawdziwego watku (testy, tryb headless): komendy przechodza przez
 * `structuredClone` z transferem (jak postMessage), a dostarczenie nastepuje w `pump()`.
 * Odpowiedzi hosta wracaja przez ten sam mechanizm (`pumpReplies`).
 */
export class LoopbackTransport implements RemoteTransport {
  onReply: ((r: DeviceReply) => void) | null = null;
  private host: DeviceWorkerHost | null = null;
  private inbox: DeviceCommand[][] = [];
  private outbox: DeviceReply[] = [];
  /** Kopiowane bajty (obie strony), do pomiaru kosztu transferu. */
  bytesTransferred = 0;

  /** Podpina worker (host) i zwraca funkcje `reply` dla jego konstruktora. */
  attach(makeHost: (reply: (r: DeviceReply, t?: ArrayBuffer[]) => void) => DeviceWorkerHost): void {
    this.host = makeHost((r, transfer) => {
      this.outbox.push(structuredClone(r, transfer && transfer.length ? { transfer } : undefined));
    });
  }

  post(cmds: DeviceCommand[], transfer: ArrayBuffer[]): void {
    for (const b of transfer) this.bytesTransferred += b.byteLength;
    this.inbox.push(structuredClone(cmds, transfer.length ? { transfer } : undefined));
  }

  /** Worker przetwarza zebrane komendy. Zwraca liczbe wykonanych paczek. */
  pump(): number {
    const batches = this.inbox.splice(0);
    for (const b of batches) this.host?.handle(b);
    return batches.length;
  }

  /** Dostarcza odpowiedzi workera do strony glownej. */
  pumpReplies(): number {
    const r = this.outbox.splice(0);
    for (const x of r) this.onReply?.(x);
    return r.length;
  }
}
