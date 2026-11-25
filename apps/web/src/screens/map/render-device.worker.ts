/// <reference lib="webworker" />
/**
 * Worker renderu (renderWorker E5): trzyma WebGL2 na OffscreenCanvas i wykonuje komendy
 * `DeviceCommand` z glownego watku. Tylko za flaga `settings.renderWorker` (domyslnie wylaczona).
 * Z: nie zweryfikowane w prawdziwej przegladarce (brak GPU/Chromium w srodowisku CI).
 */
import {
  DeviceWorkerHost,
  createWebGl2Device,
  type DeviceCommand,
  type DeviceReply,
} from '@f2/render';

const scope = self as unknown as {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage(m: DeviceReply, transfer?: Transferable[]): void;
};

/** OffscreenCanvas z minimalnym `style` (createWebGl2Device ustawia css; w workerze to no-op). */
function canvasShim(off: OffscreenCanvas): HTMLCanvasElement {
  return {
    getContext: (id: string, o?: unknown) =>
      (off as unknown as { getContext(i: string, o?: unknown): unknown }).getContext(id, o),
    addEventListener: (t: string, l: EventListener) => off.addEventListener(t, l),
    removeEventListener: (t: string, l: EventListener) => off.removeEventListener(t, l),
    get width(): number {
      return off.width;
    },
    set width(v: number) {
      off.width = v;
    },
    get height(): number {
      return off.height;
    },
    set height(v: number) {
      off.height = v;
    },
    style: {},
  } as unknown as HTMLCanvasElement;
}

let host: DeviceWorkerHost | null = null;

scope.onmessage = (e): void => {
  const m = e.data as
    { kind: 'init'; canvas: OffscreenCanvas } | { kind: 'cmds'; cmds: DeviceCommand[] };
  if (m.kind === 'init') {
    const device = createWebGl2Device(canvasShim(m.canvas));
    host = new DeviceWorkerHost(device, (r, transfer) =>
      scope.postMessage(r, transfer as Transferable[]),
    );
    return;
  }
  host?.handle(m.cmds);
};
