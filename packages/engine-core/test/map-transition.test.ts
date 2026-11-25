import { describe, expect, it } from 'vitest';
import { EventQueue, GameClock } from '../src/index.js';
import type { MapStateJSON } from '../src/save/schema.js';
import { MapRegistry } from '../src/map-registry.js';
import {
  handleMapUpdate,
  transitionTo,
  type MapRuntime,
  type TransitionWorld,
} from '../src/map-transition.js';

const DAY = 864000;

function mapState(name: string, hexes: number[] = [100]): MapStateJSON {
  return {
    name,
    lastVisitTick: 0,
    mapVars: [0, 0],
    scriptLocals: {},
    elevations: [
      {
        objects: hexes.map((hex, i) => ({
          objId: i + 1,
          pid: 1,
          hex,
          orientation: 0,
          flags: 0,
          hp: 10,
          scriptLocalId: null,
          inventory: [],
        })),
      },
    ],
  };
}

/** Mapa w pamieci: "live" stan mapy + log wywolan. */
function setup(known: string[] = ['A', 'B']) {
  const log: string[] = [];
  const hooks: { hook: string; map: string; elapsedTicks?: number }[] = [];
  const maps = new Map(known.map((n) => [n, mapState(n)]));
  const rt = {
    live: null as MapStateJSON | null,
    player: null as { hex: number; elevation: number } | null,
    elapsedHours: [] as number[],
    daily: 0,
  };
  const runtime: MapRuntime = {
    exists: (n) => maps.has(n),
    capture: () => structuredClone(rt.live!),
    load: async (n, saved) => {
      rt.live = saved ?? structuredClone(maps.get(n)!);
      log.push(`load:${n}:${saved ? 'saved' : 'fresh'}`);
    },
    callHook: (hook, args) => {
      hooks.push({ hook, map: rt.live!.name, ...args });
    },
    placePlayer: (hex, elevation) => {
      rt.player = { hex, elevation };
    },
    elapsedUpdate: (h) => {
      rt.elapsedHours.push(h);
    },
    dailyObjects: () => {
      rt.daily++;
    },
  };
  const world: TransitionWorld = {
    clock: new GameClock(1000),
    queue: new EventQueue(),
    currentMap: { name: '', elevation: 0 },
  };
  return { runtime, world, registry: new MapRegistry(), rt, hooks, log };
}

describe('transitionTo', () => {
  it('first entry loads fresh map, places player, calls map_enter with elapsed 0', async () => {
    const s = setup();
    const r = await transitionTo(s.world, { map: 'A', hex: 5, elevation: 1 }, s);
    expect(r).toMatchObject({ ok: true, firstVisit: true, elapsedTicks: 0 });
    expect(s.rt.player).toEqual({ hex: 5, elevation: 1 });
    expect(s.world.currentMap).toEqual({ name: 'A', elevation: 1 });
    expect(s.hooks).toEqual([{ hook: 'map_enter', map: 'A', elapsedTicks: 0 }]);
  });

  it('objects moved on map A persist after A->B->A', async () => {
    const s = setup();
    await transitionTo(s.world, { map: 'A', hex: 1, elevation: 0 }, s);
    s.rt.live!.elevations[0]!.objects[0]!.hex = 777;
    await transitionTo(s.world, { map: 'B', hex: 1, elevation: 0 }, s);
    await transitionTo(s.world, { map: 'A', hex: 2, elevation: 0 }, s);
    expect(s.rt.live!.elevations[0]!.objects[0]!.hex).toBe(777);
    expect(s.log).toContain('load:A:saved');
  });

  it('map vars and script locals persist', async () => {
    const s = setup();
    await transitionTo(s.world, { map: 'A', hex: 1, elevation: 0 }, s);
    s.rt.live!.mapVars[1] = 42;
    s.rt.live!.scriptLocals['9'] = [1, 2, 3];
    await transitionTo(s.world, { map: 'B', hex: 1, elevation: 0 }, s);
    await transitionTo(s.world, { map: 'A', hex: 1, elevation: 0 }, s);
    expect(s.rt.live!.mapVars[1]).toBe(42);
    expect(s.rt.live!.scriptLocals['9']).toEqual([1, 2, 3]);
  });

  it('calls map_exit on the old map before load, and stores lastVisitTick', async () => {
    const s = setup();
    await transitionTo(s.world, { map: 'A', hex: 1, elevation: 0 }, s);
    s.hooks.length = 0;
    s.world.clock.advance(500);
    await transitionTo(s.world, { map: 'B', hex: 1, elevation: 0 }, s);
    expect(s.hooks.map((h) => `${h.hook}:${h.map}`)).toEqual(['map_exit:A', 'map_enter:B']);
    expect(s.registry.get('A')!.lastVisitTick).toBe(1500);
  });

  it('passes elapsed ticks to map_enter and runs elapsed update on return', async () => {
    const s = setup();
    await transitionTo(s.world, { map: 'A', hex: 1, elevation: 0 }, s);
    await transitionTo(s.world, { map: 'B', hex: 1, elevation: 0 }, s);
    s.world.clock.advance(72000); // 2 h
    await transitionTo(s.world, { map: 'A', hex: 1, elevation: 0 }, s);
    const enter = s.hooks.filter((h) => h.hook === 'map_enter' && h.map === 'A').pop()!;
    expect(enter.elapsedTicks).toBe(72000);
    expect(s.rt.elapsedHours).toEqual([2]);
    expect(s.rt.daily).toBe(0);
  });

  it('after 2 days away runs daily objects and schedules exactly one map-update', async () => {
    const s = setup();
    await transitionTo(s.world, { map: 'A', hex: 1, elevation: 0 }, s);
    await transitionTo(s.world, { map: 'B', hex: 1, elevation: 0 }, s);
    s.world.clock.advance(2 * DAY);
    await transitionTo(s.world, { map: 'A', hex: 1, elevation: 0 }, s);
    expect(s.rt.daily).toBe(1);
    expect(s.rt.elapsedHours).toEqual([48]);
    const pending = s.world.queue.peek((e) => e.kind === 'map-update');
    expect(pending).toHaveLength(1);
    expect(pending[0]!.atTick).toBe(s.world.clock.ticks + 600);
    expect(s.hooks.filter((h) => h.hook === 'map_update')).toHaveLength(0);
  });

  it('map-update handler calls the hook and reschedules +600', async () => {
    const s = setup();
    await transitionTo(s.world, { map: 'A', hex: 1, elevation: 0 }, s);
    s.world.clock.advance(600);
    s.world.queue.processUntil(s.world.clock.ticks, (e) => handleMapUpdate(e, s.world, s));
    expect(s.hooks.filter((h) => h.hook === 'map_update')).toHaveLength(1);
    const pending = s.world.queue.peek((e) => e.kind === 'map-update');
    expect(pending).toHaveLength(1);
    expect(pending[0]!.atTick).toBe(s.world.clock.ticks + 600);
  });

  it('fails on unknown map with reason map-not-found and changes nothing', async () => {
    const s = setup();
    await transitionTo(s.world, { map: 'A', hex: 1, elevation: 0 }, s);
    s.hooks.length = 0;
    const r = await transitionTo(s.world, { map: 'ZZZ', hex: 1, elevation: 0 }, s);
    expect(r).toEqual({ ok: false, reason: 'map-not-found' });
    expect(s.hooks).toEqual([]);
    expect(s.world.currentMap.name).toBe('A');
    expect(s.registry.get('A')).toBeNull();
  });
});

describe('MapRegistry', () => {
  it('snapshot clones, serialize/load roundtrip', () => {
    const reg = new MapRegistry();
    const st = mapState('A', [1, 2]);
    reg.snapshot(st);
    st.elevations[0]!.objects[0]!.hex = 999;
    expect(reg.get('A')!.elevations[0]!.objects[0]!.hex).toBe(1);
    const json = JSON.parse(JSON.stringify(reg.serialize())) as MapStateJSON[];
    const reg2 = new MapRegistry();
    reg2.load(json);
    expect(reg2.get('A')).toEqual(reg.get('A'));
    expect(reg2.names()).toEqual(['A']);
  });

  it('does not persist random encounter maps', () => {
    const reg = new MapRegistry((n) => !n.startsWith('random'));
    reg.snapshot(mapState('random1'));
    expect(reg.get('random1')).toBeNull();
  });

  it('feeds SaveWorld.maps', () => {
    const reg = new MapRegistry();
    reg.snapshot(mapState('A'));
    expect(reg.serialize()[0]!.name).toBe('A');
  });
});
