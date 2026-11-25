import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openGameFolderNode } from '@f2/vfs/node';
import type { NodeVfs } from '@f2/vfs/node';
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
  type ObjectProcName,
  type World,
} from '../index.js';
import { fake } from './helpers.js';

const dir = process.env.F2_GAME_DIR;
const patchDir = process.env.F2_PATCH_DIR;
const PROCS: ObjectProcName[] = [
  'look_at_p_proc',
  'use_p_proc',
  'pickup_p_proc',
  'push_p_proc',
  'use_obj_on_p_proc',
];

describe.skipIf(!dir)('ScriptRuntime: procedury obiektu z menu akcji (ARTEMPLE)', () => {
  let vfs: NodeVfs;
  beforeAll(async () => {
    vfs = await openGameFolderNode(dir!, patchDir);
  });
  afterAll(async () => {
    await vfs.close();
  });

  async function setup() {
    const loader = new MapLoader(vfs, new ProtoCache(vfs));
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
      new MessageSource(vfs, { language: 'english' }),
      new GameVars(new Int32Array(700)),
      createViewDialogHooks(view),
      { vfs },
    );
    world.scripts = rt;
    await rt.loadScriptsForMap(map);
    return { rt, map, player };
  }

  it('hasObjectProc/runObjectProc: obiekt bez skryptu nic nie uruchamia', async () => {
    const { rt, player } = await setup();
    expect(rt.hasObjectProc(player.id, 'use_p_proc')).toBe(false);
    expect(rt.runObjectProc('use_p_proc', player.id, player.id)).toEqual({
      ran: false,
      overridden: false,
      error: false,
    });
    expect(rt.useItemOn(player.id, 1, player.id).ran).toBe(false);
  });

  it('obiekty ze skryptem: uruchamiane procedury nie daja bledu VM', async () => {
    const { rt, map, player } = await setup();
    let ran = 0;
    for (const o of map.objects) {
      if (o.scriptId === -1 || o === player) continue;
      for (const p of PROCS) {
        if (!rt.hasObjectProc(o.id, p)) continue;
        const r = rt.runObjectProc(p, o.id, player.id);
        expect(r.ran).toBe(true);
        ran++;
      }
    }
    expect(ran).toBeGreaterThan(0);
  });
});
