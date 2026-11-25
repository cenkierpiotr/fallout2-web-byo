import { describe, expect, it } from 'vitest';
import { CarState, type GameObject } from '@f2/engine-core';
import { createTrunkBridge } from './trunk-bridge';
import { WorldmapController, type WorldmapHost } from './worldmap/worldmap-controller';
import { wmData } from './worldmap/worldmap-fixture';

const obj = (id: number, pid: number, quantity: number, flags = 0): GameObject =>
  ({ id, pid, quantity, flags, inventory: [], hex: -1 }) as unknown as GameObject;

function setup(area = 2, canCarry = true, loadSize?: (pid: number) => Promise<number | undefined>) {
  const st = new CarState();
  st.give(2, 5000);
  const car: NonNullable<WorldmapHost['car']> = {
    state: st,
    fuel: 5000,
    moving: false,
    area: 2,
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
  const ctl = new WorldmapController(wmData, host);
  ctl.currentArea = area;
  const player = obj(1, 0x1000000, 1);
  player.inventory = [obj(10, 41, 5), obj(11, 7, 1, 0x1000000)];
  const world: GameObject[] = [];
  let refreshed = 0;
  const bridge = createTrunkBridge({
    ctl,
    player: () => player,
    views: () =>
      player.inventory
        .filter((o) => !(o.flags & 0x1000000))
        .map((o) => ({ id: o.id, pid: o.pid, name: `item${o.pid}`, count: o.quantity ?? 1 })),
    spawn: (pid) => {
      const o = obj(100 + world.length, pid, 1);
      world.push(o);
      return o.id;
    },
    object: (id) => world.find((o) => o.id === id),
    pickup: (o) => {
      if (!canCarry) return { ok: false };
      player.inventory.push(o);
      return { ok: true };
    },
    discard: (id) => {
      const i = world.findIndex((o) => o.id === id);
      if (i >= 0) world.splice(i, 1);
    },
    refresh: () => void refreshed++,
    ...(loadSize ? { loadSize } : {}),
  });
  return { bridge, st, player, world, ctl, car, refreshed: () => refreshed };
}

describe('TrunkBridge', () => {
  it('stow: czesc stosu i calosc przechodza do bagaznika, ekwipunek maleje', () => {
    const { bridge, st, player } = setup();
    expect(bridge.items().map((i) => i.pid)).toEqual([41]);
    expect(bridge.stow(10, 2)).toBe(true);
    expect(player.inventory.find((o) => o.id === 10)?.quantity).toBe(3);
    expect(st.trunkCount).toBe(2);
    expect(bridge.stow(10, 99)).toBe(true);
    expect(player.inventory.some((o) => o.id === 10)).toBe(false);
    expect(st.trunkCount).toBe(5);
    expect(bridge.nameOf(41)).toBe('item41');
  });
  it('stow: zalozony przedmiot i auto w innym obszarze sa odrzucone', () => {
    const { bridge, st } = setup();
    expect(bridge.stow(11, 1)).toBe(false);
    const other = setup(1);
    expect(other.bridge.stow(10, 1)).toBe(false);
    expect(st.trunkCount).toBe(0);
  });
  it('retrieve: przedmiot wraca do ekwipunku z iloscia, bagaznik maleje', () => {
    const { bridge, st, player, refreshed } = setup();
    bridge.stow(10, 5);
    expect(bridge.retrieve(41, 3)).toBe(3);
    expect(st.trunkCount).toBe(2);
    expect(player.inventory.find((o) => o.pid === 41)?.quantity).toBe(3);
    expect(refreshed()).toBeGreaterThan(1);
    expect(bridge.retrieve(41, 9)).toBe(2);
    expect(bridge.retrieve(41, 1)).toBe(0);
  });
  it('retrieve: auto w ruchu nie wydaje przedmiotow', () => {
    const { bridge, car } = setup();
    bridge.stow(10, 1);
    car.moving = true;
    expect(bridge.retrieve(41, 1)).toBe(0);
  });
  it('retrieve: za ciezki przedmiot jest odmowiony, zostaje w bagazniku i nie lezy pod graczem', () => {
    const { bridge, st, player, world } = setup(2, false);
    bridge.stow(10, 5);
    expect(bridge.retrieve(41, 3)).toBe(0);
    expect(st.trunkCount).toBe(5);
    expect(player.inventory.some((o) => o.pid === 41)).toBe(false);
    expect(world).toHaveLength(0);
  });
  it('refuel: ogniwo (pid 288) zuzywa 1 sztuke i dolewa paliwo; pelny bak i inny przedmiot odmowa', () => {
    const { bridge, st, player } = setup();
    player.inventory.push(obj(20, 288, 2));
    expect(bridge.refuel(10)).toBe(false);
    const before = st.fuel;
    expect(bridge.refuel(20)).toBe(true);
    expect(st.fuel).toBe(before + 20000);
    expect(player.inventory.find((o) => o.id === 20)?.quantity).toBe(1);
    st.fuel = 80000;
    expect(bridge.refuel(20)).toBe(false);
    expect(player.inventory.find((o) => o.id === 20)?.quantity).toBe(1);
  });
  it('stow: pojemnosc liczona z proto.size (suma rozmiarow), nie z liczby sztuk', () => {
    const { bridge, st, player } = setup();
    (player.inventory[0] as unknown as { proto: unknown }).proto = { kind: 'item', size: 60 };
    expect(bridge.stow(10, 5)).toBe(false); // 5 * 60 = 300 > 250
    expect(bridge.stow(10, 4)).toBe(true); // 240
    expect(st.trunkUsed).toBe(240);
    expect(st.trunkCount).toBe(4);
    expect(bridge.stow(10, 1)).toBe(false);
  });
  it('preload: rozmiar zawartosci bagaznika z zapisu pochodzi z PRO (nie 1 na sztuke)', async () => {
    const { bridge, st } = setup(2, true, async (pid) => (pid === 41 ? 100 : undefined));
    st.trunk.push({ pid: 41, count: 2 }); // jak po wczytaniu zapisu
    expect(st.trunkUsed).toBe(2);
    await bridge.preload();
    expect(st.trunkUsed).toBe(200);
  });
});
