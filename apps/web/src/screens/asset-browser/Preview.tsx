import { useEffect, useRef } from 'preact/hooks';
import { effect } from '@preact/signals';
import { SpriteCache, type SpriteHandle } from '@f2/assets';
import { applyColorCycles, parsePal, type Palette } from '@f2/formats';
import { Camera2D, SpriteBatch, createWebGl2Device } from '@f2/render';
import { PanTapRecognizer as GestureRecognizer } from '@f2/input';
import type { DecodeClient } from '@f2/assets';
import { t } from '../../i18n';
import type { ViewState } from '../../state/view';
import { useAnimation } from './use-animation';

export function Preview({ client, view }: { client: DecodeClient; view: ViewState }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const frameSig = useAnimation(view.fps.value, view.frames.value, view.playing.value);
  useEffect(() => effect(() => void (view.frame.value = frameSig.value)), [frameSig, view]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    let device: ReturnType<typeof createWebGl2Device>;
    try {
      device = createWebGl2Device(canvas);
    } catch {
      view.problem.value = t('error.webgl2');
      return;
    }
    const cache = new SpriteCache(device, (p) => client.loadFrm(p));
    const batch = new SpriteBatch();
    const camera = new Camera2D();
    const cycled = new Uint8Array(1024);
    let pal: Palette | null = null;
    let handle: SpriteHandle | null = null;
    let disposed = false;
    let raf = 0;
    let dpr = window.devicePixelRatio || 1;

    void client.read('color.pal').then(
      (bytes) => {
        pal = parsePal(bytes);
        device.setPalette(pal.rgba);
      },
      (e: unknown) => {
        view.problem.value = t('error.generic', {
          message: e instanceof Error ? e.message : String(e),
        });
      },
    );

    const resize = () => {
      dpr = window.devicePixelRatio || 1;
      device.resize(Math.max(1, wrap.clientWidth), Math.max(1, wrap.clientHeight), dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    // zaladuj wybrany plik
    const stopPath = effect(() => {
      const path = view.path.value;
      if (!path) {
        handle = null;
        view.size.value = '';
        return;
      }
      view.loading.value = true;
      view.problem.value = null;
      cache.get(path).then(
        (h) => {
          if (disposed || view.path.peek() !== path) return;
          handle = h;
          view.fps.value = h.fps;
          view.frames.value = h.framesPerDirection;
          view.frame.value = 0;
          frameSig.value = 0;
          const f = h.directions[0]?.[0];
          view.size.value = f ? t('browser.size', { width: f.width, height: f.height }) : '';
          camera.x = 0;
          camera.y = 0;
          view.loading.value = false;
        },
        (e: unknown) => {
          if (disposed || view.path.peek() !== path) return;
          handle = null;
          view.loading.value = false;
          view.problem.value = t('error.generic', {
            message: e instanceof Error ? e.message : String(e),
          });
        },
      );
    });

    let lastPaletteCycle = false;
    let prevNow = 0;
    const debug = import.meta.env.DEV
      ? { frameIndex: 0, fps: 0, spriteCount: 0, lastFrameMs: 0, frameDeltaMs: 0 }
      : null;
    if (debug) (window as unknown as { __f2debug?: unknown }).__f2debug = debug;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const t0 = performance.now();
      if (pal) {
        if (view.colorCycle.value) {
          applyColorCycles(pal, now, cycled);
          device.setPalette(cycled);
          lastPaletteCycle = true;
        } else if (lastPaletteCycle) {
          device.setPalette(pal.rgba);
          lastPaletteCycle = false;
        }
      }
      let z = view.zoom.value;
      if (view.integerZoom.value) z = Math.max(1, Math.round(z));
      camera.snapInteger = false;
      camera.zoom = z * dpr;
      batch.clear();
      if (handle) {
        const dirFrames = handle.directions[view.dir.value] ?? handle.directions[0];
        const f = dirFrames?.[Math.min(view.frame.value, (dirFrames?.length ?? 1) - 1)];
        if (f && f.width > 0 && f.height > 0) {
          const n = view.stress.value ? 100 : 1;
          for (let i = 0; i < n; i++) {
            // tryb obciazeniowy rozrzuca kopie siatka 10x10
            const gx = n === 1 ? 0 : ((i % 10) - 4.5) * 24;
            const gy = n === 1 ? 0 : (Math.floor(i / 10) - 4.5) * 12;
            batch.push({
              texture: f.texture,
              sx: f.sx,
              sy: f.sy,
              sw: f.width,
              sh: f.height,
              x: -f.width / 2 + f.offsetX + gx,
              y: -f.height / 2 + f.offsetY + gy,
            });
          }
        }
      }
      device.beginFrame([0.08, 0.07, 0.06, 1]);
      device.drawSprites(batch, camera);
      device.endFrame();
      if (debug) {
        debug.frameIndex = view.frame.peek();
        debug.fps = view.fps.peek();
        debug.spriteCount = batch.count;
        debug.lastFrameMs = performance.now() - t0;
        debug.frameDeltaMs = prevNow ? now - prevNow : 0;
        prevNow = now;
      }
    };
    raf = requestAnimationFrame(draw);

    // gesty: pan i pinch
    const gestures = new GestureRecognizer({
      onPan: (dx, dy) => {
        const z = camera.zoom / dpr;
        camera.x -= dx / z;
        camera.y -= dy / z;
      },
      onPinch: (scale) => {
        view.zoom.value = Math.min(4, Math.max(0.5, view.zoom.value * scale));
      },
    });
    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      gestures.down(e.pointerId, e.clientX, e.clientY, e.timeStamp);
    };
    const onMove = (e: PointerEvent) =>
      gestures.move(e.pointerId, e.clientX, e.clientY, e.timeStamp);
    const onUp = (e: PointerEvent) => gestures.up(e.pointerId, e.clientX, e.clientY, e.timeStamp);
    const onCancel = (e: PointerEvent) => gestures.cancel(e.pointerId);
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      view.zoom.value = Math.min(
        4,
        Math.max(0.5, view.zoom.value * (e.deltaY < 0 ? 1.1 : 1 / 1.1)),
      );
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onCancel);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      stopPath();
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onCancel);
      canvas.removeEventListener('wheel', onWheel);
      device.dispose();
    };
  }, [client, view, frameSig]);

  return (
    <div class="canvas-wrap" ref={wrapRef}>
      <canvas ref={canvasRef} data-testid="preview-canvas" />
      <div class="overlay">
        {view.problem.value ? (
          <span class="error">{view.problem.value}</span>
        ) : view.loading.value ? (
          t('browser.loading')
        ) : view.path.value ? (
          `${view.path.value} ${view.size.value}`
        ) : (
          t('browser.select')
        )}
      </div>
    </div>
  );
}
