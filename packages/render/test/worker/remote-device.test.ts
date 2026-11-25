import { describe, expect, it, vi } from 'vitest';
import { Camera2D } from '../../src/camera.js';
import type { DeviceFrameStats, GfxDevice, IndexedTexture } from '../../src/gfx-device.js';
import type { LitFrameState } from '../../src/lighting/types.js';
import { SpriteBatch } from '../../src/sprite-batch.js';
import {
  DeviceWorkerHost,
  LoopbackTransport,
  RemoteGfxDevice,
  readDevicePixels,
  estimateWorkerFrame,
  summarizeFrameSplit,
} from '../../src/worker/index.js';

/** Atrapa prawdziwego urzadzenia: zapisuje wywolania i "kosztuje" zadany czas submitu. */
function fakeReal(onDraw?: () => void) {
  const log: string[] = [];
  const tex: IndexedTexture[] = [];
  const lit: Array<LitFrameState | null> = [];
  const drawn: { ids: number[]; sprites: number; cam: [number, number, number] }[] = [];
  let nextId = 100; // celowo inne id niz po stronie glownej: host mapuje id
  const stats: DeviceFrameStats = { drawCalls: 0, uploadedBytes: 0, fillPixels: 0 };
  const dev: GfxDevice & { lastPalette?: Uint8Array } = {
    width: 4,
    height: 4,
    dpr: 1,
    stats,
    contextLost: false,
    resize: (w, h, d) => log.push(`resize ${w}x${h}@${d}`),
    createIndexedTexture: (w, h, data) => {
      const t = { id: nextId++, width: w, height: h };
      tex.push(t);
      log.push(`create ${t.id} ${w}x${h} data=${data ? data.length : 0}`);
      return t;
    },
    createRgbaTexture: (w, h, _d, o) => {
      const t = { id: nextId++, width: w, height: h, rgba: true, linear: o?.filter !== 'nearest' };
      tex.push(t);
      log.push(`rgba ${t.id}`);
      return t;
    },
    updateIndexedTexture: (t, x, y, w, h, data) =>
      log.push(`update ${t.id} ${x},${y} ${w}x${h} n=${data.length}`),
    deleteTexture: (t) => log.push(`delete ${t.id}`),
    setPalette(rgba) {
      dev.lastPalette = rgba;
      log.push(`palette ${rgba.length}`);
    },
    setLighting: (s) => {
      log.push(`lighting ${s ? 'on' : 'off'}`);
      lit.push(s);
    },
    setPostProcess: (c) => log.push(`post ${c ? 'on' : 'off'}`),
    setSpriteAux: (t, a) => log.push(`aux ${t.id} n=${!!a.normal} d=${!!a.depth}`),
    beginFrame: (c) => log.push(`begin ${c.join(',')}`),
    drawSprites(batch, cam) {
      const groups = batch.groups();
      drawn.push({
        ids: groups.map((g) => g.texture.id),
        sprites: batch.count,
        cam: [cam.x, cam.y, cam.zoom],
      });
      stats.drawCalls += groups.length;
      onDraw?.();
    },
    endFrame: () => log.push('end'),
    readPixels: () => new Uint8Array([1, 2, 3, 4]),
    dispose: () => undefined,
  };
  return { dev, log, drawn, tex, lit };
}

function setup(opts?: { maxFramesInFlight?: number; onDraw?: () => void }) {
  const real = fakeReal(opts?.onDraw);
  const transport = new LoopbackTransport();
  transport.attach((reply) => new DeviceWorkerHost(real.dev, reply));
  const remote = new RemoteGfxDevice({
    transport,
    width: 100,
    height: 50,
    ...(opts?.maxFramesInFlight ? { maxFramesInFlight: opts.maxFramesInFlight } : {}),
  });
  const roundTrip = (): void => {
    transport.pump();
    transport.pumpReplies();
  };
  return { real, transport, remote, roundTrip };
}

describe('RemoteGfxDevice', () => {
  it('przydziela id synchronicznie i worker mapuje je na swoje tekstury', () => {
    const { remote, real, roundTrip } = setup();
    const a = remote.createIndexedTexture(8, 8, new Uint8Array(64));
    const b = remote.createRgbaTexture(4, 4);
    expect([a.id, b.id]).toEqual([1, 2]);
    expect(b.rgba).toBe(true);
    expect(b.linear).toBe(true);
    remote.updateIndexedTexture(a, 1, 2, 3, 4, new Uint8Array(12));
    roundTrip();
    expect(real.log).toEqual(['create 100 8x8 data=64', 'rgba 101', 'update 100 1,2 3x4 n=12']);
  });

  it('kopiuje bufory wejsciowe (wywolujacy moze je zmieniac po wywolaniu)', () => {
    const { remote, real, roundTrip } = setup();
    const pal = new Uint8Array([9, 9, 9, 9]);
    remote.setPalette(pal);
    pal.fill(0);
    roundTrip();
    expect(Array.from(real.dev.lastPalette ?? [])).toEqual([9, 9, 9, 9]);
    expect(pal.length).toBe(4); // oryginal nie zostal odlaczony (transferowana byla kopia)
  });

  it('lustruje rozmiar bufora i wysyla CSS tylko przez applyCssSize', () => {
    const css: number[] = [];
    const transport = new LoopbackTransport();
    const remote = new RemoteGfxDevice({ transport, applyCssSize: (w, h) => css.push(w, h) });
    remote.resize(390, 844, 2);
    expect([remote.width, remote.height, remote.dpr]).toEqual([780, 1688, 2]);
    expect(css).toEqual([390, 844]);
  });

  it('klatka: batch przechodzi przez transfer, worker rysuje z odtworzonymi teksturami', () => {
    const { remote, real, roundTrip } = setup();
    const t = remote.createIndexedTexture(16, 16);
    const batch = new SpriteBatch();
    batch.pushRect(t, 0, 0, 8, 8, 10, 20, 8, 8);
    batch.pushRect(t, 8, 0, 8, 8, 30, 20, 8, 8);
    const cam = new Camera2D();
    cam.x = 5;
    cam.y = 6;
    cam.zoom = 2;
    remote.beginFrame([0, 0, 0, 1]);
    remote.drawSprites(batch, cam);
    remote.endFrame();
    expect(remote.remote.framesSent).toBe(1);
    expect(remote.remote.lastFrameBytes).toBeGreaterThan(0);
    roundTrip();
    expect(real.drawn).toEqual([{ ids: [100], sprites: 2, cam: [5, 6, 2] }]);
    expect(remote.lastAckedFrame).toBe(1);
    expect(remote.stats.drawCalls).toBe(1);
    // bufory batcha zrodlowego zostaja uzyteczne (transferowane byly kopie)
    expect(batch.count).toBe(2);
    expect(batch.groups()[0]!.vertices.length).toBeGreaterThan(0);
  });

  it('wyjatek w klatce nie zawiesza renderu: host i tak odsyla frame-done', () => {
    let boom = true;
    const { remote, roundTrip } = setup({
      onDraw: () => {
        if (boom) throw new Error('boom');
      },
    });
    const t = remote.createIndexedTexture(16, 16);
    const batch = new SpriteBatch();
    batch.pushRect(t, 0, 0, 8, 8, 10, 20, 8, 8);
    const frame = (): void => {
      remote.beginFrame([0, 0, 0, 1]);
      remote.drawSprites(batch, new Camera2D());
      remote.endFrame();
    };
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    frame();
    roundTrip();
    expect(remote.lastAckedFrame).toBe(1);
    boom = false;
    frame();
    expect(remote.remote.framesDropped).toBe(0);
    roundTrip();
    expect(remote.lastAckedFrame).toBe(2);
    err.mockRestore();
  });

  it('backpressure: bez potwierdzenia nastepna klatka jest pomijana i liczona', () => {
    const { remote, roundTrip } = setup();
    const t = remote.createIndexedTexture(4, 4);
    const batch = new SpriteBatch();
    batch.pushRect(t, 0, 0, 4, 4, 0, 0, 4, 4);
    const cam = new Camera2D();
    const frame = (): void => {
      remote.beginFrame([0, 0, 0, 1]);
      remote.drawSprites(batch, cam);
      remote.endFrame();
    };
    frame();
    frame();
    frame();
    expect(remote.remote.framesSent).toBe(1);
    expect(remote.remote.framesDropped).toBe(2);
    roundTrip();
    frame(); // po potwierdzeniu znowu wolno
    expect(remote.remote.framesSent).toBe(2);
  });

  it('utrata kontekstu: zdarzenia dochodza, klatki sa pomijane, gate sie odblokowuje', () => {
    const { remote, real, roundTrip, transport } = setup();
    let lost = 0;
    let restored = 0;
    remote.onContextLost = (): void => void lost++;
    remote.onContextRestored = (): void => void restored++;
    const batch = new SpriteBatch();
    const t = remote.createIndexedTexture(4, 4);
    batch.pushRect(t, 0, 0, 4, 4, 0, 0, 4, 4);
    remote.beginFrame([0, 0, 0, 1]);
    remote.drawSprites(batch, new Camera2D());
    remote.endFrame(); // klatka w locie
    real.dev.onContextLost?.();
    transport.pumpReplies();
    expect(remote.contextLost).toBe(true);
    expect(lost).toBe(1);
    remote.beginFrame([0, 0, 0, 1]);
    remote.drawSprites(batch, new Camera2D());
    remote.endFrame();
    expect(remote.remote.framesDropped).toBe(1);
    real.dev.onContextRestored?.();
    roundTrip();
    expect(remote.contextLost).toBe(false);
    expect(restored).toBe(1);
    remote.beginFrame([0, 0, 0, 1]);
    remote.drawSprites(batch, new Camera2D());
    remote.endFrame();
    expect(remote.remote.framesSent).toBe(2);
  });

  it('readPixels sync rzuca, readPixelsAsync zwraca dane workera', async () => {
    const { remote, transport } = setup();
    expect(() => remote.readPixels()).toThrow(/readPixelsAsync/);
    const p = remote.readPixelsAsync();
    transport.pump();
    transport.pumpReplies();
    expect(Array.from(await p)).toEqual([1, 2, 3, 4]);
  });

  it('lighting/postprocess/aux/delete trafiaja do urzadzenia w kolejnosci', () => {
    const { remote, real, roundTrip } = setup();
    const t = remote.createIndexedTexture(4, 4);
    remote.setSpriteAux(t, { normal: new Uint8Array(4), depth: new Uint8Array(1) });
    remote.setLighting(null);
    remote.setPostProcess(null);
    remote.deleteTexture(t);
    roundTrip();
    expect(real.log.slice(1)).toEqual([
      'aux 100 n=true d=true',
      'lighting off',
      'post off',
      'delete 100',
    ]);
  });
});

function litState(map?: LitFrameState['lightMap'], time = 0): LitFrameState {
  return {
    enabled: true,
    ambient: [1, 1, 1],
    sunDir: [0, 0, 1],
    normalStrength: 1,
    lightCount: 0,
    lightsUbo: new Float32Array(128),
    ...(map ? { lightMap: map } : {}),
    cameraDelta: [0, 0],
    parallaxFactor: 0,
    time,
  };
}

describe('E6: swiatla przez worker (lightMap.version)', () => {
  it('mapa swiatla jedzie raz na wersje; kolejne klatki uzywaja kopii hosta', () => {
    const { remote, real, transport, roundTrip } = setup();
    const data = new Uint8Array([1, 2, 3, 4, 5, 6]);
    const map = { data, width: 2, height: 1, version: 1 };
    remote.setLighting(litState(map, 1));
    const bytes0 = transport.bytesTransferred;
    expect(bytes0).toBe(6); // pierwsza wersja: transfer kopii
    // wywolujacy nadal ma swoje dane (przekazana byla kopia)
    expect(data.length).toBe(6);
    remote.setLighting(litState(map, 2));
    remote.setLighting(litState(map, 3));
    expect(transport.bytesTransferred).toBe(bytes0); // brak ponownego kopiowania mapy
    roundTrip();
    expect(real.lit.map((s) => s?.time)).toEqual([1, 2, 3]);
    for (const s of real.lit) {
      expect(s?.lightMap?.version).toBe(1);
      expect(Array.from(s?.lightMap?.data ?? [])).toEqual([1, 2, 3, 4, 5, 6]);
    }
  });

  it('nowa wersja (nawet te same dane) i zmiana rozmiaru wymuszaja ponowne wyslanie', () => {
    const { remote, real, transport, roundTrip } = setup();
    const data = new Uint8Array(6);
    remote.setLighting(litState({ data, width: 2, height: 1, version: 1 }));
    data[0] = 77; // zmiana danych w miejscu + nowa wersja
    remote.setLighting(litState({ data, width: 2, height: 1, version: 2 }));
    expect(transport.bytesTransferred).toBe(12);
    remote.setLighting(litState({ data: new Uint8Array(3), width: 1, height: 1, version: 2 }));
    expect(transport.bytesTransferred).toBe(15);
    roundTrip();
    expect(real.lit[1]?.lightMap?.data[0]).toBe(77);
    expect(real.lit[2]?.lightMap?.width).toBe(1);
  });

  it('wylaczenie swiatla zeruje cache: nastepna klatka z ta sama mapa wysyla dane od nowa', () => {
    const { remote, real, transport, roundTrip } = setup();
    const map = { data: new Uint8Array(6), width: 2, height: 1, version: 1 };
    remote.setLighting(litState(map));
    remote.setLighting(null);
    remote.setLighting(litState(map));
    expect(transport.bytesTransferred).toBe(12);
    roundTrip();
    expect(real.lit[2]?.lightMap?.version).toBe(1);
  });

  it('stan bez lightMap przechodzi bez zmian', () => {
    const { remote, real, roundTrip } = setup();
    remote.setLighting(litState());
    roundTrip();
    expect(real.lit[0]?.lightMap).toBeUndefined();
  });
});

describe('readPixels w trybie worker', () => {
  it('kilka rownoleglych odczytow wraca pod swoimi id', async () => {
    const { remote, roundTrip } = setup();
    const a = remote.readPixelsAsync();
    const b = remote.readPixelsAsync();
    roundTrip();
    expect(Array.from(await a)).toEqual([1, 2, 3, 4]);
    expect(Array.from(await b)).toEqual([1, 2, 3, 4]);
  });

  it('readDevicePixels: tryb worker (async) i tryb main (sync) daja te same dane', async () => {
    const { remote, real, roundTrip } = setup();
    const p = readDevicePixels(remote);
    roundTrip();
    expect(Array.from(await p)).toEqual([1, 2, 3, 4]);
    expect(Array.from(await readDevicePixels(real.dev))).toEqual([1, 2, 3, 4]);
  });

  it('dispose odrzuca oczekujace odczyty i kolejne wywolania', async () => {
    const { remote } = setup();
    const p = remote.readPixelsAsync();
    remote.dispose();
    await expect(p).rejects.toThrow(/zwolnione/);
    await expect(remote.readPixelsAsync()).rejects.toThrow(/zwolnione/);
  });

  it('utrata kontekstu odrzuca oczekujace odczyty', async () => {
    const { remote, transport } = setup();
    const p = remote.readPixelsAsync();
    transport.onReply?.({ type: 'context-lost' });
    await expect(p).rejects.toThrow(/utrata kontekstu/);
  });

  it('brak odpowiedzi: timeout odrzuca obietnice', async () => {
    vi.useFakeTimers();
    try {
      const { remote } = setup();
      const p = remote.readPixelsAsync(100);
      const assertion = expect(p).rejects.toThrow(/100 ms/);
      await vi.advanceTimersByTimeAsync(101);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('odpowiedz po czasie nie wywoluje sie drugi raz (timer wyczyszczony)', async () => {
    vi.useFakeTimers();
    try {
      const { remote, roundTrip } = setup();
      const p = remote.readPixelsAsync(100);
      roundTrip();
      expect(Array.from(await p)).toEqual([1, 2, 3, 4]);
      await vi.advanceTimersByTimeAsync(500);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('symulowany pomiar buildMs/submitMs (headless, zegar sztuczny)', () => {
  it('worker odciaza watek glowny: submit przechodzi na worker, main placi tylko wysylke', () => {
    let clock = 0;
    const SUBMIT = 6; // ms kosztu GL na klatke (symulacja)
    const BUILD = 8; // ms budowy batcha (symulacja)
    const { remote, real, roundTrip } = setup({ onDraw: () => void (clock += SUBMIT) });
    const t = remote.createIndexedTexture(16, 16);
    const batch = new SpriteBatch();
    batch.pushRect(t, 0, 0, 8, 8, 0, 0, 8, 8);
    const cam = new Camera2D();

    // wariant inline: submit liczony na watku glownym
    const inline = [];
    for (let i = 0; i < 5; i++) {
      clock += BUILD;
      const t1 = clock;
      real.dev.beginFrame([0, 0, 0, 1]);
      real.dev.drawSprites(batch, cam);
      real.dev.endFrame();
      inline.push({ buildMs: BUILD, submitMs: clock - t1 });
    }
    const s = summarizeFrameSplit(inline);
    expect(s.buildMs).toBe(8);
    expect(s.submitMs).toBe(6);
    expect(s.submitShare).toBeCloseTo(6 / 14);
    expect(s.worthIt).toBe(true); // 43% >= 25%

    // wariant remote: main mierzy tylko serializacje (fake now: 0.5 ms na wywolanie)
    let tick = 0;
    const transport = new LoopbackTransport();
    transport.attach((reply) => new DeviceWorkerHost(fakeReal(() => (clock += SUBMIT)).dev, reply));
    const r2 = new RemoteGfxDevice({ transport, now: () => (tick += 0.5) });
    const t2 = r2.createIndexedTexture(16, 16);
    const b2 = new SpriteBatch();
    b2.pushRect(t2, 0, 0, 8, 8, 0, 0, 8, 8);
    r2.beginFrame([0, 0, 0, 1]);
    r2.drawSprites(b2, cam);
    r2.endFrame();
    expect(r2.remote.submitMs).toBe(0.5);
    const est = estimateWorkerFrame(s, r2.remote.submitMs);
    expect(est.mainMs).toBe(8.5);
    expect(est.pipelinedMs).toBe(8.5);
    expect(est.savedMs).toBeCloseTo(14 - 8.5);
    roundTrip();
  });

  it('bramka E1: submit < 25% klatki = porzucic', () => {
    const s = summarizeFrameSplit([{ buildMs: 12, submitMs: 2 }]);
    expect(s.submitShare).toBeCloseTo(2 / 14);
    expect(s.worthIt).toBe(false);
    expect(summarizeFrameSplit([]).worthIt).toBe(false);
  });
});
