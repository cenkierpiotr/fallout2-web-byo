// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { WorldmapScreen } from './WorldmapScreen';
import { WorldmapController } from '../../game/worldmap/worldmap-controller';
import { VIEW_X, VIEW_Y } from '../../game/worldmap/worldmap-viewport';
import { wmData } from '../../game/worldmap/worldmap-fixture';

const host = {
  ticks: () => 0,
  advance: () => undefined,
  rng: { int: () => 100 },
  difficulty: () => 1 as const,
  player: () => 5,
  luck: () => 5,
  outdoorsman: () => 0,
  perk: () => 0,
  gvars: {},
};

describe('WorldmapScreen', () => {
  afterEach(cleanup);
  it('lista widocznych miejsc, wejscie do lokacji po dotarciu, wyjscie', async () => {
    HTMLCanvasElement.prototype.getContext = (() => null) as never;
    const ctl = new WorldmapController(wmData, host, { x: 100, y: 100 });
    const onEnter = vi.fn();
    const onClose = vi.fn();
    render(<WorldmapScreen controller={ctl} onEnterMap={onEnter} onClose={onClose} tickMs={5} />);
    expect(screen.getByTestId('worldmap-city-0')).toBeTruthy();
    expect(screen.queryByTestId('worldmap-city-1')).toBeNull();
    fireEvent.click(screen.getByTestId('worldmap-city-0'));
    const btn = await screen.findByTestId('worldmap-enter-0', undefined, { timeout: 2000 });
    fireEvent.click(btn);
    expect(onEnter).toHaveBeenCalledWith('ARMAIN');
    fireEvent.click(screen.getByTestId('worldmap-exit'));
    expect(onClose).toHaveBeenCalled();
  });
  it('tap w okno widoku ustawia cel z uwzglednieniem przewiniecia, drag tylko przewija', () => {
    HTMLCanvasElement.prototype.getContext = (() => null) as never;
    const ctl = new WorldmapController(wmData, host, { x: 100, y: 100 });
    render(
      <WorldmapScreen
        controller={ctl}
        onEnterMap={() => undefined}
        onClose={() => undefined}
        tickMs={100000}
      />,
    );
    const cv = screen.getByTestId('worldmap-canvas');
    cv.getBoundingClientRect = () => ({ left: 0, top: 0, width: 640, height: 480 }) as DOMRect;
    const ev = (type: string, x: number, y: number): void => {
      const e = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true });
      cv.dispatchEvent(e);
    };
    // drag: bez celu, widok przesuniety
    ev('pointerdown', 300, 300);
    ev('pointermove', 250, 260);
    ev('pointerup', 250, 260);
    expect(ctl.model.target).toBeNull();
    // tap: cel = piksel okna + przewiniecie (poczatkowo srodek na graczu, przyciety do 0,0)
    ev('pointerdown', VIEW_X + 200, VIEW_Y + 150);
    ev('pointerup', VIEW_X + 200, VIEW_Y + 150);
    expect(ctl.model.target).toEqual({ x: 200 + 50, y: 150 + 40 });
    // tap w ramce (poza oknem) nic nie zmienia
    ctl.stop();
    ev('pointerdown', 5, 5);
    ev('pointerup', 5, 5);
    expect(ctl.model.target).toBeNull();
  });
  it('ekran ma rozmiar ramki 640x480 i bez poziomego przewijania (szerokosc 100%)', () => {
    HTMLCanvasElement.prototype.getContext = (() => null) as never;
    const ctl = new WorldmapController(wmData, host, { x: 100, y: 100 });
    render(
      <WorldmapScreen
        controller={ctl}
        onEnterMap={() => undefined}
        onClose={() => undefined}
        tickMs={100000}
      />,
    );
    const cv = screen.getByTestId('worldmap-canvas') as HTMLCanvasElement;
    expect([cv.width, cv.height]).toEqual([640, 480]);
    expect(cv.style.width).toBe('100%');
  });
  it('panel samochodu: paliwo i predkosc z hosta, widoczny tylko przy aktywnym aucie', () => {
    HTMLCanvasElement.prototype.getContext = (() => null) as never;
    const car = { fuel: 40000, moving: true, area: -1 };
    const ctl = new WorldmapController(wmData, { ...host, car }, { x: 100, y: 100 });
    render(
      <WorldmapScreen
        controller={ctl}
        onEnterMap={() => undefined}
        onClose={() => undefined}
        tickMs={100000}
      />,
    );
    expect(screen.getByTestId('worldmap-car')).toBeTruthy();
    expect(screen.getByTestId('worldmap-fuel').getAttribute('aria-valuenow')).toBe('40000');
    expect(screen.getByTestId('worldmap-fuel-text').textContent).toContain('50%');
    expect(ctl.carInfo()).toMatchObject({ gauge: 35, speed: 4 });
  });
  it('bez samochodu panelu nie ma', () => {
    HTMLCanvasElement.prototype.getContext = (() => null) as never;
    const ctl = new WorldmapController(wmData, host, { x: 100, y: 100 });
    render(
      <WorldmapScreen
        controller={ctl}
        onEnterMap={() => undefined}
        onClose={() => undefined}
        tickMs={100000}
      />,
    );
    expect(screen.queryByTestId('worldmap-car')).toBeNull();
  });
});
