// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { CarState, type GameObject } from '@f2/engine-core';
import { WorldmapScreen } from './WorldmapScreen';
import { WorldmapController, type WorldmapHost } from '../../game/worldmap/worldmap-controller';
import { createTrunkBridge } from '../../game/trunk-bridge';
import { wmData } from '../../game/worldmap/worldmap-fixture';

const obj = (id: number, pid: number, quantity: number): GameObject =>
  ({ id, pid, quantity, flags: 0, inventory: [], hex: -1 }) as unknown as GameObject;

const heavy = { value: false };

function setup(area: number, owned = true) {
  const st = new CarState();
  if (owned) st.give(2, 40000);
  const car: NonNullable<WorldmapHost['car']> = {
    state: st,
    get fuel() {
      return st.fuel;
    },
    set fuel(v: number) {
      st.fuel = v;
    },
    moving: false,
    get area() {
      return st.parkedArea;
    },
    set area(v: number) {
      st.parkedArea = v;
    },
  };
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
    car,
  } as unknown as WorldmapHost;
  const ctl = new WorldmapController(wmData, host, { x: 100, y: 100 });
  ctl.currentArea = area;
  const player = obj(1, 0, 1);
  player.inventory = [obj(10, 41, 4)];
  const bridge = createTrunkBridge({
    ctl,
    player: () => player,
    views: () =>
      player.inventory.map((o) => ({
        id: o.id,
        pid: o.pid,
        name: 'Stimpak',
        count: o.quantity ?? 1,
      })),
    spawn: (pid) => {
      player.inventory.push(obj(99, pid, 1));
      return 99;
    },
    object: (id) => player.inventory.find((o) => o.id === id),
    pickup: () => ({ ok: !heavy.value }),
    discard: (id) => {
      const i = player.inventory.findIndex((o) => o.id === id);
      if (i >= 0) player.inventory.splice(i, 1);
    },
    refresh: () => undefined,
  });
  return { ctl, bridge, st, player };
}
const mount = (ctl: WorldmapController, trunk?: ReturnType<typeof setup>['bridge']) => {
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
  return render(
    <WorldmapScreen
      controller={ctl}
      onEnterMap={() => undefined}
      onClose={() => undefined}
      tickMs={100000}
      {...(trunk ? { trunk } : {})}
    />,
  );
};

describe('CarPanel', () => {
  afterEach(() => {
    cleanup();
    heavy.value = false;
  });
  it('bez samochodu panelu nie ma', () => {
    const { ctl } = setup(2, false);
    mount(ctl);
    expect(screen.queryByTestId('worldmap-carpanel')).toBeNull();
  });
  it('auto stoi gdzie indziej: bagaznik zablokowany', () => {
    const { ctl, bridge } = setup(1);
    mount(ctl, bridge);
    fireEvent.click(screen.getByTestId('worldmap-car-open'));
    expect(screen.getByTestId('worldmap-trunk-locked')).toBeTruthy();
    expect(screen.queryByTestId('worldmap-trunk')).toBeNull();
    expect((screen.getByTestId('worldmap-car-start') as HTMLButtonElement).disabled).toBe(true);
  });
  it('auto w obszarze gracza: wlozenie i wyjecie z bagaznika', () => {
    const { ctl, bridge, st, player } = setup(2);
    mount(ctl, bridge);
    fireEvent.click(screen.getByTestId('worldmap-car-open'));
    expect(screen.getByTestId('worldmap-car-fuelbar').getAttribute('aria-valuenow')).toBe('40000');
    fireEvent.click(screen.getByTestId('worldmap-trunk-stow-10'));
    expect(st.trunkCount).toBe(1);
    expect(player.inventory.find((o) => o.id === 10)?.quantity).toBe(3);
    fireEvent.click(screen.getByTestId('worldmap-trunk-stowall-10'));
    expect(st.trunkCount).toBe(4);
    expect(screen.getByTestId('worldmap-trunk-item-41').textContent).toContain('x4');
    fireEvent.click(screen.getByTestId('worldmap-trunk-takeall-41'));
    expect(st.trunkCount).toBe(0);
  });
  it('odjazd i parkowanie zmieniaja stan i blokuja bagaznik w trasie', () => {
    const { ctl, bridge, st } = setup(2);
    mount(ctl, bridge);
    fireEvent.click(screen.getByTestId('worldmap-car-open'));
    fireEvent.click(screen.getByTestId('worldmap-car-start'));
    expect(st.parkedArea).toBe(-1);
    expect(screen.getByTestId('worldmap-trunk-locked')).toBeTruthy();
    fireEvent.click(screen.getByTestId('worldmap-car-park'));
    expect(st.parkedArea).toBe(2);
    expect(screen.getByTestId('worldmap-trunk')).toBeTruthy();
  });
  it('za ciezki przedmiot: komunikat, przedmiot zostaje w bagazniku', () => {
    const { ctl, bridge, st, player } = setup(2);
    mount(ctl, bridge);
    fireEvent.click(screen.getByTestId('worldmap-car-open'));
    fireEvent.click(screen.getByTestId('worldmap-trunk-stowall-10'));
    expect(st.trunkCount).toBe(4);
    heavy.value = true;
    fireEvent.click(screen.getByTestId('worldmap-trunk-takeall-41'));
    expect(st.trunkCount).toBe(4);
    expect(screen.getByTestId('worldmap-trunk-note').textContent).toContain('Too heavy');
    expect(player.inventory.some((o) => o.id === 99)).toBe(false);
  });
});
