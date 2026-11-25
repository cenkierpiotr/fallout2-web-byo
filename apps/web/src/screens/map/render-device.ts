/**
 * Wybor urzadzenia renderu dla ekranu mapy (renderWorker E5).
 * Flaga `settings.renderWorker` (domyslnie false) + wsparcie OffscreenCanvas => `RemoteGfxDevice`
 * (GL w workerze); w kazdym innym przypadku dokladnie dotychczasowe `createWebGl2Device(canvas)`.
 * Uwaga: po `transferControlToOffscreen` canvas jest nieodwracalnie oddany workerowi, wiec
 * automatyczny fallback jest mozliwy tylko PRZED transferem (brak wsparcia, brak fabryki, wyjatek).
 */
import {
  RemoteGfxDevice,
  RenderProxy,
  createWebGl2Device,
  type DeviceCommand,
  type DeviceReply,
  type GfxDevice,
  type RemoteTransport,
} from '@f2/render';

export interface RemoteDeviceHandle {
  transport: RemoteTransport;
  applyCssSize: (cssWidth: number, cssHeight: number) => void;
}

/** Fabryka transportu: wywolywana dopiero gdy flaga jest wlaczona i przegladarka wspiera OffscreenCanvas. */
export type RemoteDeviceFactory = (canvas: HTMLCanvasElement) => RemoteDeviceHandle | null;

export interface RenderDeviceChoice {
  device: GfxDevice;
  mode: 'worker' | 'main';
}

export function createRenderDevice(
  canvas: HTMLCanvasElement,
  opts: {
    renderWorker: boolean;
    factory?: RemoteDeviceFactory | undefined;
    supported?: () => boolean;
    dpr?: number;
  },
): RenderDeviceChoice {
  const supported = opts.supported ?? ((): boolean => RenderProxy.supported());
  if (opts.renderWorker && opts.factory && supported()) {
    try {
      const h = opts.factory(canvas);
      if (h) {
        const device = new RemoteGfxDevice({
          transport: h.transport,
          width: canvas.width,
          height: canvas.height,
          dpr: opts.dpr ?? 1,
          applyCssSize: h.applyCssSize,
        });
        return { device, mode: 'worker' };
      }
    } catch {
      /* fabryka rzucila przed transferem: wracamy do glownego watku */
    }
  }
  return { device: createWebGl2Device(canvas), mode: 'main' };
}

/** Produkcyjna fabryka: worker z `render-device.worker.ts` (Vite bundluje go jako osobny modul). */
export const createWorkerDevice: RemoteDeviceFactory = (canvas) => {
  const worker = new Worker(new URL('./render-device.worker.ts', import.meta.url), {
    type: 'module',
  });
  const offscreen = canvas.transferControlToOffscreen();
  const transport: RemoteTransport = {
    onReply: null,
    post(cmds: DeviceCommand[], transfer: ArrayBuffer[]): void {
      worker.postMessage({ kind: 'cmds', cmds }, transfer);
    },
    dispose(): void {
      worker.terminate();
    },
  };
  worker.onmessage = (e: MessageEvent<DeviceReply>): void => transport.onReply?.(e.data);
  worker.postMessage({ kind: 'init', canvas: offscreen }, [offscreen]);
  return {
    transport,
    applyCssSize: (w, h): void => {
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    },
  };
};
