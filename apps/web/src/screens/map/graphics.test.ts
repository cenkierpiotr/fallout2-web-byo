import { describe, expect, it, vi } from 'vitest';
import { hexToWorld } from '@f2/engine-core';
import { DEFAULT_SETTINGS, type Settings } from '../../settings';
import { GraphicsController, litAmbient, planGraphics } from './graphics';

const desktop = { mobile: false, dpr: 1 };
const mobile = { mobile: true, dpr: 2 };

describe('planGraphics', () => {
  it('domyslne ustawienia na desktopie: plan aktywny (wysoki + oswietlenie + postFx)', () => {
    const p = planGraphics(DEFAULT_SETTINGS, desktop);
    expect(p.active).toBe(true);
    expect(p.postProcess).not.toBeNull();
    expect(p.lighting).toBe(true);
  });
  it('auto: desktop = wysoki, mobile = niski', () => {
    expect(planGraphics({ ...DEFAULT_SETTINGS, postFx: true }, desktop).preset).toBe('wysoki');
    expect(planGraphics({ ...DEFAULT_SETTINGS, postFx: true }, mobile).preset).toBe('niski');
  });
  it('postFx + wysoki: cienie wlaczaja oswietlenie i parallax', () => {
    const p = planGraphics({ ...DEFAULT_SETTINGS, postFx: true, graphicsPreset: 'wysoki' }, mobile);
    expect(p.active).toBe(true);
    expect(p.lighting).toBe(true);
    expect(p.parallax).toBe(true);
    expect(p.postProcess?.shadows).toBeTruthy();
  });
  it('sam preset bez flag nic nie wlacza', () => {
    expect(
      planGraphics({ ...DEFAULT_SETTINGS, postFx: false, lighting: false, graphicsPreset: 'ultra' }, desktop)
        .active,
    ).toBe(false);
  });
  it('niski + postFx bez lighting: nic do zrobienia', () => {
    expect(
      planGraphics({ ...DEFAULT_SETTINGS, postFx: true, lighting: false, graphicsPreset: 'niski' }, desktop)
        .active,
    ).toBe(false);
  });
});

describe('GraphicsController', () => {
  const mk = (s: Partial<Settings>) => {
    let cur: Settings = { ...DEFAULT_SETTINGS, ...s };
    const dev = { setLighting: vi.fn(), setPostProcess: vi.fn() };
    const c = new GraphicsController(dev as never, () => cur, desktop);
    return { dev, c, set: (p: Partial<Settings>) => (cur = { ...cur, ...p }) };
  };
  it('z wylaczonymi flagami nie dotyka urzadzenia', () => {
    const { dev, c } = mk({ postFx: false, lighting: false });
    c.update(0, 0, 1);
    expect(dev.setLighting).not.toHaveBeenCalled();
    expect(dev.setPostProcess).not.toHaveBeenCalled();
  });
  it('wlaczone: wola setLighting/setPostProcess; wylaczenie czyści stan', () => {
    const { dev, c, set } = mk({ postFx: true, graphicsPreset: 'wysoki' });
    c.update(10, 10, 1);
    expect(dev.setLighting.mock.calls[0]![0].enabled).toBe(true);
    expect(dev.setPostProcess.mock.calls[0]![0]).not.toBeNull();
    set({ postFx: false, lighting: false });
    c.update(10, 10, 2);
    expect(dev.setLighting).toHaveBeenLastCalledWith(null);
    expect(dev.setPostProcess).toHaveBeenLastCalledWith(null);
  });
  it('samo lighting: oswietlenie bez post-processingu', () => {
    const { dev, c } = mk({ postFx: false, lighting: true });
    c.update(0, 0, 1);
    expect(dev.setLighting.mock.calls[0]![0].enabled).toBe(true);
    expect(dev.setPostProcess).toHaveBeenLastCalledWith(null);
  });
  it('ultra + postFx: swiatla punktowe z obiektow mapy trafiaja do UBO i mapy swiatla', () => {
    const { dev, c } = mk({ postFx: true, graphicsPreset: 'ultra' });
    expect(c.current).toBeNull();
    c.setLightObjects(
      [{ hex: 100 * 200 + 100, elevation: 0, flags: 0x20, lightRadius: 4, lightIntensity: 0x8000 }],
      0,
    );
    const w = hexToWorld(100 * 200 + 100);
    c.update(w.x, w.y, 1);
    expect(c.current?.points).toBe(true);
    const st = dev.setLighting.mock.calls[0]![0];
    expect(st.lightCount).toBe(1);
    expect(st.lightMap).toBeDefined();
  });
  it('ambient mapy trafia do stanu oswietlenia; domyslnie 1 (bez przyciemnienia)', () => {
    const { dev, c } = mk({ postFx: true, graphicsPreset: 'wysoki' });
    c.update(0, 0, 1);
    expect(dev.setLighting.mock.calls[0]![0].ambient).toEqual([1, 1, 1]);
    c.update(0, 0, 2, 1, 0.25);
    expect(dev.setLighting.mock.calls.at(-1)![0].ambient).toEqual(litAmbient(0.25));
  });
  it('litAmbient: 1 bez zmian, 0.25 rozjasnione (gamma) i bez dominanty czerwonej', () => {
    expect(litAmbient(1)).toEqual([1, 1, 1]);
    const [r, g, b] = litAmbient(0.25);
    expect(g).toBeGreaterThan(0.4);
    expect(g).toBeLessThan(0.5);
    expect(r).toBeLessThan(g);
    expect(b).toBe(g);
    expect(litAmbient(0.6)[1]).toBeGreaterThan(0.6);
  });
  it('preset wysoki (bez points): zadnych swiatel punktowych', () => {
    const { dev, c } = mk({ postFx: true, graphicsPreset: 'wysoki' });
    c.setLightObjects(
      [{ hex: 100 * 200 + 100, elevation: 0, flags: 0x20, lightRadius: 4, lightIntensity: 0x8000 }],
      0,
    );
    c.update(0, 0, 1);
    expect(c.current?.points).toBe(false);
    expect(dev.setLighting.mock.calls[0]![0].lightCount).toBe(0);
    expect(dev.setLighting.mock.calls[0]![0].lightMap).toBeUndefined();
  });
  it('z wylaczonymi flagami z zrodlami swiatla: urzadzenia nadal nie dotyka', () => {
    const { dev, c } = mk({ postFx: false, lighting: false });
    c.setLightObjects(
      [{ hex: 100 * 200 + 100, elevation: 0, flags: 0x20, lightRadius: 4, lightIntensity: 0x8000 }],
      0,
    );
    c.update(0, 0, 1);
    expect(dev.setLighting).not.toHaveBeenCalled();
    expect(dev.setPostProcess).not.toHaveBeenCalled();
  });
});
