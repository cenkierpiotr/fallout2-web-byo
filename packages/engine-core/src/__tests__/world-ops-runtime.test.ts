import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openGameFolderNode } from '@f2/vfs/node';
import type { NodeVfs } from '@f2/vfs/node';
import { int, obj as objV, str } from '@f2/vm';
import {
  GameClock,
  GameVars,
  MapLoader,
  MessageSource,
  MovementSystem,
  ProtoCache,
  ScriptRuntime,
  createGameView,
  createViewDialogHooks,
  indexObject,
  type GameMap,
  type GameObject,
  type World,
} from '../index.js';
import { critterRads, critterState } from '../critter-model.js';
import { fake } from './helpers.js';

const dir = process.env.F2_GAME_DIR;
const patchDir = process.env.F2_PATCH_DIR;

describe.skipIf(!dir)('opkody swiata i krytterow (ScriptRuntime, ARTEMPLE)', () => {
  let vfs: NodeVfs;
  let loader: MapLoader;
  let msgs: MessageSource;
  beforeAll(async () => {
    vfs = await openGameFolderNode(dir!, patchDir);
    loader = new MapLoader(vfs, new ProtoCache(vfs));
    msgs = new MessageSource(vfs, { language: 'english' });
  });
  afterAll(async () => {
    await vfs.close();
  });

  async function setup() {
    const map: GameMap = await loader.load('ARTEMPLE');
    const player: GameObject = fake(1, map.header.playerHex, 0, {
      kind: 'critter',
      flags: 0,
      raw: new Int32Array(0),
    });
    player.id = 0x10000;
    map.objects.push(player);
    indexObject(map, player);
    const view = createGameView();
    const world: World = {
      map,
      player,
      clock: new GameClock(),
      movement: new MovementSystem(map),
      loader,
      view,
    };
    const rt = new ScriptRuntime(
      world,
      msgs,
      new GameVars(new Int32Array(700)),
      createViewDialogHooks(view),
      { vfs, rng: () => 0.5 },
    );
    world.scripts = rt;
    await rt.loadScriptsForMap(map);
    return { map, player, rt };
  }
  const npc = (map: GameMap, pid: number, hex: number): GameObject => {
    const o = fake(1, hex, 0, { kind: 'critter', flags: 0, raw: new Int32Array(0) });
    o.pid = pid;
    map.objects.push(o);
    indexObject(map, o);
    return o;
  };

  it('metarule 44..48: pozycja swiata, obszar, language_filter, violence_level', async () => {
    const { rt } = await setup();
    rt.worldX = 123;
    rt.worldY = 456;
    rt.currentTown = 7;
    rt.languageFilter = 1;
    rt.violenceLevel = 2;
    expect(rt.metarule(44)).toEqual(int(123));
    expect(rt.metarule(45)).toEqual(int(456));
    expect(rt.metarule(46)).toEqual(int(7));
    expect(rt.metarule(47)).toEqual(int(1));
    expect(rt.metarule(48)).toEqual(int(2));
  });

  it('metarule3 108 = tile_set_center: ustawia kamere, -1 dla zlego kafla', async () => {
    const { rt } = await setup();
    expect(rt.metarule3(108, int(100), int(1))).toEqual(int(0));
    expect(rt.cameraCenter).toBe(100);
    expect(rt.metarule3(108, int(40000), int(1))).toEqual(int(-1));
    expect(rt.metarule3(108, int(-1), int(1))).toEqual(int(-1));
    expect(rt.cameraCenter).toBe(100);
  });

  it('metarule 19 (MAP_KNOWN): 1 dla mapy oznaczonej jako znana, inaczej 0 (Z)', async () => {
    const { rt } = await setup();
    expect(rt.metarule(19, int(5))).toEqual(int(0));
    rt.knownMaps.add(5);
    expect(rt.metarule(19, int(5))).toEqual(int(1));
    expect(rt.metarule(19, int(6))).toEqual(int(0));
  });

  it('tile_is_visible (0x80f8) i script_op_80f9 nie sa nieobslugiwane (Z: bez modelu widocznosci kafla)', async () => {
    const { rt } = await setup();
    const before = rt.log.length;
    expect(rt.unsupported('tile_is_visible', [int(20100)])).toEqual(int(1));
    expect(rt.unsupported('tile_is_visible', [int(20100 + 200 * 5 + 7)])).toEqual(int(0));
    expect(rt.unsupported('tile_is_visible', [int(20100 + 200 * 4 + 7)])).toEqual(int(1));
    expect(rt.unsupported('tile_is_visible', [int(20100 + 3)])).toEqual(int(1));
    expect(rt.unsupported('script_op_80f9', [])).toEqual(int(0));
    expect(rt.log.slice(before).filter((l) => l.kind === 'unsupported')).toEqual([]);
  });

  it('load_map (0x80e4): indeks i nazwa trafiaja do pendingMapLoad, indeks ujemny jest ignorowany', async () => {
    const { rt } = await setup();
    rt.unsupported('script_op_80e4', [int(-3), int(0)]);
    expect(rt.pendingMapLoad).toBeUndefined();
    expect(rt.pendingWorldMap).toBeUndefined();
    rt.unsupported('script_op_80e4', [int(23), int(1)]);
    expect(rt.pendingMapLoad).toEqual({ map: 23, elevation: 1 });
    rt.unsupported('script_op_80e4', [str('ARTEMPLE'), int(0)]);
    expect(rt.pendingMapLoad).toEqual({ map: 'ARTEMPLE', elevation: 0 });
  });

  it('takeMapLoad: konsumuje zadanie load_map (indeks przez resolver, nazwa wprost) i nadpisanie startu', async () => {
    const { rt } = await setup();
    const byIndex = (i: number): string | undefined => (i === 23 ? 'KLAMALL' : undefined);
    rt.mapStartOverride = undefined; // ewentualne nadpisanie z map_enter ARTEMPLE
    expect(rt.takeMapLoad(byIndex)).toBeUndefined();
    rt.unsupported('script_op_80e4', [int(23), int(1)]);
    expect(rt.takeMapLoad(byIndex)).toEqual({ name: 'KLAMALL' });
    // zadanie zuzyte jednokrotnie
    expect(rt.pendingMapLoad).toBeUndefined();
    expect(rt.takeMapLoad(byIndex)).toBeUndefined();
    // nazwa wprost; nadpisanie startu (x, y, elewacja) przeklada sie na hex = y * 200 + x
    rt.unsupported('script_op_80e4', [str('ARTEMPLE'), int(0)]);
    rt.overrideMapStart(10, 20, 1, 2);
    expect(rt.takeMapLoad(byIndex)).toEqual({ name: 'ARTEMPLE', hex: 4010, elevation: 1 });
    expect(rt.mapStartOverride).toBeUndefined();
    // nazwa z rozszerzeniem (jak w dcmetzge: "DNSlvRun.map") jest normalizowana
    rt.unsupported('script_op_80e4', [str('DNSlvRun.map'), int(0)]);
    expect(rt.takeMapLoad(byIndex)).toEqual({ name: 'DNSlvRun' });
    // nieznany indeks: zadanie przepada, bez wyjatku
    rt.unsupported('script_op_80e4', [int(999), int(0)]);
    expect(rt.takeMapLoad(byIndex)).toBeUndefined();
    expect(rt.pendingMapLoad).toBeUndefined();
  });

  it('load_map(-1) i load_map(-2) zglaszaja wyjscie na mape swiata / mape miasta', async () => {
    const { rt } = await setup();
    rt.unsupported('script_op_80e4', [int(-1), int(0)]);
    expect(rt.pendingWorldMap).toEqual({ townMap: false });
    expect(rt.pendingMapLoad).toBeUndefined();
    rt.unsupported('script_op_80e4', [int(-2), int(0)]);
    expect(rt.pendingWorldMap).toEqual({ townMap: true });
  });

  it('wm_area_set_pos zapisuje pozycje obszaru', async () => {
    const { rt } = await setup();
    rt.unsupported('wm_area_set_pos', [int(5), int(10), int(20)]);
    expect(rt.areaPositions.get(5)).toEqual({ x: 10, y: 20 });
  });

  it('kill_critter zabija krytera i raportuje smierc raz', async () => {
    const { map, rt } = await setup();
    const o = npc(map, 0x1000010, 15000);
    o.id = 777777;
    (rt as unknown as { objects: Map<number, GameObject> }).objects.set(o.id, o);
    rt.unsupported('kill_critter', [objV(o.id), int(0)]);
    expect(critterState(o)).toBe(1);
    rt.unsupported('kill_critter', [objV(o.id), int(0)]);
    expect(rt.battle.deaths.filter((d) => d === o.id)).toHaveLength(1);
  });

  it('kill_critter_type: zabija zywych o pid, pomija ukrytych i innych; anim 0 usuwa obiekt', async () => {
    const { map, rt } = await setup();
    const a = npc(map, 0x1000099, 15001);
    const b = npc(map, 0x1000099, 15002);
    const hidden = npc(map, 0x1000099, 15003);
    hidden.flags = 1;
    const other = npc(map, 0x100009a, 15004);
    for (const [i, o] of [a, b, hidden, other].entries()) {
      o.id = 880000 + i;
      (rt as unknown as { objects: Map<number, GameObject> }).objects.set(o.id, o);
    }
    rt.unsupported('kill_critter_type', [int(0x1000099), int(1)]);
    expect(critterState(a)).toBe(1);
    expect(critterState(b)).toBe(1);
    expect(critterState(hidden)).not.toBe(1);
    expect(critterState(other)).not.toBe(1);
    rt.unsupported('kill_critter_type', [int(0x100009a), int(0)]);
    expect(map.objects.includes(other)).toBe(false);
  });

  it('radiation_inc/dec: tylko gracz, poziom nie schodzi ponizej 0', async () => {
    const { map, player, rt } = await setup();
    const o = npc(map, 0x1000011, 15005);
    o.id = 990001;
    (rt as unknown as { objects: Map<number, GameObject> }).objects.set(o.id, o);
    (rt as unknown as { objects: Map<number, GameObject> }).objects.set(player.id, player);
    rt.unsupported('radiation_inc', [objV(player.id), int(30)]);
    expect(critterRads(player)).toBe(30);
    rt.unsupported('radiation_dec', [objV(player.id), int(10)]);
    expect(critterRads(player)).toBe(20);
    rt.unsupported('radiation_dec', [objV(player.id), int(99)]);
    expect(critterRads(player)).toBe(0);
    rt.unsupported('radiation_inc', [objV(o.id), int(30)]);
    expect(critterRads(o)).toBe(0);
  });

  it('radiacja gracza przez hook sesji: radiation_inc/dec i set_critter_stat(0x25) -> delta, requestPlayerDeath', async () => {
    const { player, rt } = await setup();
    (rt as unknown as { objects: Map<number, GameObject> }).objects.set(player.id, player);
    let level = 5;
    const deltas: number[] = [];
    rt.playerRadiation = {
      add: (d) => {
        deltas.push(d);
        level = Math.max(0, level + d);
      },
      level: () => level,
    };
    rt.unsupported('radiation_inc', [objV(player.id), int(30)]);
    rt.unsupported('radiation_dec', [objV(player.id), int(10)]);
    expect(deltas).toEqual([30, -10]);
    expect(critterRads(player)).toBe(0); // licznik obiektu nietkniety, prawda jest w sesji
    // stat_set_base 0x4af4bc: delta = nowa wartosc - biezaca (25 -> 40 = +15)
    expect(rt.setCritterStat(player.id, 37, 40)).toBe(0);
    expect(deltas).toEqual([30, -10, 15]);
    expect(rt.playerDeathRequested).toBe(false);
    rt.requestPlayerDeath();
    expect(rt.playerDeathRequested).toBe(true);
  });
});
