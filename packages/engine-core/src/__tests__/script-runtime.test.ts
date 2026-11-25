import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openGameFolderNode } from '@f2/vfs/node';
import type { NodeVfs } from '@f2/vfs/node';
import {
  GameClock,
  GameCommands,
  GameVars,
  MapLoader,
  MessageSource,
  MovementSystem,
  ProtoCache,
  ScriptRuntime,
  createGameView,
  createViewDialogHooks,
  hexDistance,
  hexNeighbors,
  indexObject,
  moveObject,
  parseGam,
  type GameMap,
  type GameObject,
  type World,
} from '../index.js';
import { fake } from './helpers.js';

const dir = process.env.F2_GAME_DIR;
const patchDir = process.env.F2_PATCH_DIR;

describe.skipIf(!dir)('ScriptRuntime (ARTEMPLE)', () => {
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

  async function setup(playerHex?: number) {
    const map: GameMap = await loader.load('ARTEMPLE');
    const player: GameObject = fake(1, playerHex ?? map.header.playerHex, 0, {
      kind: 'critter',
      flags: 0,
      raw: new Int32Array(0),
    });
    player.id = 0x10000;
    map.objects.push(player);
    indexObject(map, player);
    const view = createGameView();
    const clock = new GameClock();
    const world: World = { map, player, clock, movement: new MovementSystem(map), loader, view };
    const vars = new GameVars(Int32Array.from({ length: 700 }, () => 0));
    const hooks = createViewDialogHooks(view);
    const rt = new ScriptRuntime(world, msgs, vars, hooks, { vfs, rng: () => 0.5 });
    world.scripts = rt;
    return { map, player, view, clock, world, vars, rt };
  }

  it('test_scriptRuntime_setLightLevel_clamps_and_notifies', async () => {
    const { rt } = await setup();
    const seen: number[] = [];
    rt.onLightLevel = (v) => seen.push(v);
    expect(rt.scriptLightLevel).toBeUndefined();
    rt.setLightLevel(0x10000);
    rt.setLightLevel(0x8000);
    rt.setLightLevel(0); // ponizej dolnej granicy 0x4000
    rt.setLightLevel(0x40000); // powyzej gornej
    expect(seen).toEqual([1, 0.5, 0.25, 1]);
    expect(rt.scriptLightLevel).toBe(1);
  });

  it('test_scriptRuntime_loads_artemple_instances', async () => {
    const { map, rt } = await setup();
    await rt.loadScriptsForMap(map);
    const withScript = map.objects.filter((o) => o.scriptId !== -1);
    const missing = rt.log.filter((l) => l.kind === 'missingScript').length;
    expect(withScript.length).toBeGreaterThan(0);
    // + skrypt mapy (header.scriptId) tworzony z sid MAP_SCRIPT_SID
    expect(rt.scheduler.all().length).toBe(map.scripts.length - missing + 1);
    const klint = map.objects.find((o) => o.scriptId === 0x4000001)!;
    expect(rt.scheduler.get(klint.scriptId)!.ownerObjectId).toBe(klint.id);
    expect(rt.scheduler.all().some((e) => e.script.name === 'acklint')).toBe(true);
  });

  it('test_scriptRuntime_runs_start_then_map_enter_without_VmError', async () => {
    const { map, rt } = await setup();
    await rt.loadScriptsForMap(map);
    expect(rt.log.filter((l) => l.kind === 'vmError')).toEqual([]);
    expect(rt.scheduler.errors).toEqual([]);
    expect(rt.scheduler.all().every((e) => e.started)).toBe(true);
  });

  it('test_scriptRuntime_metarule3_105_returns_world_subtile_state', async () => {
    const { rt } = await setup();
    expect(rt.metarule3(105, { t: 'int', v: 10 }, { t: 'int', v: 20 })).toEqual({ t: 'int', v: 0 });
    rt.subtileStates.set('10,20', 2);
    expect(rt.metarule3(105, { t: 'int', v: 10 }, { t: 'int', v: 20 })).toEqual({ t: 'int', v: 2 });
    expect(rt.log.filter((l) => l.kind === 'unsupported')).toEqual([]);
  });

  it('test_scriptRuntime_setGlobalVar_updates_GameVars', async () => {
    const { rt, vars } = await setup();
    const c = vars.changed.value;
    rt.setGlobalVar(5, 42);
    expect(vars.get(5)).toBe(42);
    expect(rt.getGlobalVar(5)).toBe(42);
    expect(vars.changed.value).toBe(c + 1);
  });

  it('test_scriptRuntime_floatMsg_adds_floating_text_with_expiry', async () => {
    const { map, rt, view } = await setup();
    await rt.loadScriptsForMap(map);
    const klint = map.objects.find((o) => o.scriptId === 0x4000001)!;
    rt.floatMsg(klint.id, 'Hej', 7);
    const t = view.floatingTexts.value[0]!;
    expect(t).toMatchObject({ objId: klint.id, text: 'Hej', color: 7 });
    expect(t.expiresAtTick).toBeGreaterThan(rt.scheduler.now);
    rt.tick(t.expiresAtTick - rt.scheduler.now + 1);
    expect(view.floatingTexts.value).toEqual([]);
  });

  it('test_scriptRuntime_talkTo_runs_talk_p_proc_and_opens_dialog', async () => {
    const { map, rt, view, world, player } = await setup();
    await rt.loadScriptsForMap(map);
    const klint = map.objects.find((o) => o.scriptId === 0x4000001)!;
    moveObject(map, player, hexNeighbors(klint.hex)[0]!);
    expect(hexDistance(player.hex, klint.hex)).toBe(1);
    const cmd = new GameCommands(world);
    const r = cmd.talkTo(klint.id);
    expect(rt.log.filter((l) => l.kind === 'vmError')).toEqual([]);
    expect(r).toEqual({ ok: true });
    const d = view.dialog.value!;
    expect(d.options.length).toBeGreaterThan(0);
    expect(d.options.every((o) => o.text.length > 0)).toBe(true);
    expect(d.npcText.length).toBeGreaterThan(0);
    expect(cmd.talkTo(klint.id)).toEqual({ ok: false, reason: 'busy' });
    // wybor ostatniej opcji i zamkniecie nie rzuca
    expect(cmd.dialog.choose(99)).toMatchObject({ ok: false });
    const closed = cmd.dialog.close();
    expect(closed.ok).toBe(true);
    expect(view.dialog.value).toBeNull();
  });

  it('test_scriptRuntime_talkTo_tooFar_returns_reason', async () => {
    const { map, rt } = await setup(100);
    await rt.loadScriptsForMap(map);
    const klint = map.objects.find((o) => o.scriptId === 0x4000001)!;
    expect(rt.talkTo(klint.id)).toEqual({ ok: false, reason: 'tooFar' });
    expect(rt.talkTo(123456)).toEqual({ ok: false, reason: 'noScript' });
  });

  it('test_scriptRuntime_missing_script_file_logs_and_continues', async () => {
    const { map, rt } = await setup();
    // wpis skryptu wskazujacy indeks poza scripts.lst
    const raw = new Int32Array(16);
    raw[0] = 0x3000009;
    raw[3] = 99999;
    map.scripts.push({ type: 3, scriptId: raw[0], raw });
    await rt.loadScriptsForMap(map);
    const logs = rt.log.filter((l) => l.kind === 'missingScript');
    expect(logs.length).toBeGreaterThan(0);
    expect(rt.scheduler.all().length).toBeGreaterThan(0);
  });
});

it('parseGam jest eksportowany', () => {
  expect(parseGam(new Uint8Array(0)).length).toBe(0);
});
