import { describe, expect, it, vi } from 'vitest';

const mainDevice = { kind: 'main' };
vi.mock('@f2/render', async (orig) => {
  const real = await orig<typeof import('@f2/render')>();
  return { ...real, createWebGl2Device: vi.fn(() => mainDevice) };
});

import { RemoteGfxDevice } from '@f2/render';
import { createRenderDevice, type RemoteDeviceFactory } from './render-device';

const canvas = { width: 10, height: 5 } as unknown as HTMLCanvasElement;
const handle = (): ReturnType<RemoteDeviceFactory> => ({
  transport: { post: () => undefined, onReply: null },
  applyCssSize: () => undefined,
});

describe('createRenderDevice', () => {
  it('flaga wylaczona (domyslnie): WebGL2 na glownym watku, fabryka nietknieta', () => {
    const factory = vi.fn(handle);
    const r = createRenderDevice(canvas, { renderWorker: false, factory, supported: () => true });
    expect(r.mode).toBe('main');
    expect(r.device).toBe(mainDevice);
    expect(factory).not.toHaveBeenCalled();
  });

  it('flaga wlaczona + wsparcie + fabryka: RemoteGfxDevice', () => {
    const r = createRenderDevice(canvas, {
      renderWorker: true,
      factory: handle,
      supported: () => true,
    });
    expect(r.mode).toBe('worker');
    expect(r.device).toBeInstanceOf(RemoteGfxDevice);
  });

  it('brak wsparcia OffscreenCanvas lub brak fabryki: fallback na glowny watek', () => {
    expect(
      createRenderDevice(canvas, { renderWorker: true, factory: handle, supported: () => false })
        .mode,
    ).toBe('main');
    expect(createRenderDevice(canvas, { renderWorker: true, supported: () => true }).mode).toBe(
      'main',
    );
  });

  it('fabryka rzuca albo zwraca null (przed transferem): fallback', () => {
    const boom: RemoteDeviceFactory = () => {
      throw new Error('x');
    };
    expect(
      createRenderDevice(canvas, { renderWorker: true, factory: boom, supported: () => true }).mode,
    ).toBe('main');
    expect(
      createRenderDevice(canvas, { renderWorker: true, factory: () => null, supported: () => true })
        .mode,
    ).toBe('main');
  });
});
