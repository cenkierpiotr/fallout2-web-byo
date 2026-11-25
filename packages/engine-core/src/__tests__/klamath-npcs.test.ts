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
  hexNeighbors,
  indexObject,
  moveObject,
  type GameMap,
  type GameObject,
  type World,
} from '../index.js';
import { fake } from './helpers.js';

const dir = process.env.F2_GAME_DIR;
const patchDir = process.env.F2_PATCH_DIR;

/** Mapy Klamath: skrypty .int uruchamiane w VM, rozmowy z NPC (wzorzec jak ARTEMPLE/ARVILLAG, Z35b). */
const MAPS = (process.env.F2_KLAMATH_MAPS ?? 'KLAMALL,KLADWTWN,KLATRAP,KLACANYN,KLATOXCV').split(
  ',',
);

/** Kosmetyczne/walkowe opkody akceptowane (jak ACCEPTED_UNSUPPORTED w tests/e2e/macro.ts, M4+). */
const ACCEPTED =
  /^(reg_anim|critter_add_trait|get_critter_stat|obj_can_see_obj|obj_lock|cur_map_index|critter_state|mouse_state_flag)/;

/** Odroczone do rdzenia walki/skilli (inny agent): do_check, attack, critter_injure; nieznane: metarule(46), op 0x80e4. */
const DEFERRED = /^(do_check|attack|critter_injure|metarule\(46\)|script_op_80e4)/;

describe.skipIf(!dir)('Klamath: skrypty i dialogi w VM', () => {
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

  async function setup(name: string) {
    const map: GameMap = await loader.load(name);
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
    const vars = new GameVars(Int32Array.from({ length: 700 }, () => 0));
    const rt = new ScriptRuntime(world, msgs, vars, createViewDialogHooks(view), {
      vfs,
      rng: () => 0.5,
    });
    world.scripts = rt;
    return { map, player, view, world, rt };
  }

  for (const name of MAPS) {
    describe(name, () => {
      it('start + map_enter bez VmError i bez brakujacych opkodow', async () => {
        const { map, rt } = await setup(name);
        await rt.loadScriptsForMap(map);
        for (let i = 0; i < 3; i++) rt.tick(10);
        const bad = rt.log.filter(
          (l) =>
            l.kind === 'vmError' ||
            (l.kind === 'unsupported' && !ACCEPTED.test(l.message) && !DEFERRED.test(l.message)),
        );
        expect([...new Set(bad.map((b) => b.kind + ': ' + b.message))].join(' ; ')).toBe('');
      }, 120_000);

      it('rozmowa z kazdym NPC ze skryptem, kazda opcja 1. poziomu', async () => {
        const { map, player, view, world, rt } = await setup(name);
        await rt.loadScriptsForMap(map);
        const cmd = new GameCommands(world);
        const npcs = map.objects.filter(
          (o) =>
            o.type === 1 &&
            o.id !== player.id &&
            o.scriptId !== -1 &&
            rt.scheduler.get(o.scriptId)?.script.procs.some((p) => p.name === 'talk_p_proc'),
        );
        let talked = 0;
        for (const npc of npcs) {
          const free = hexNeighbors(npc.hex).find((h) => h >= 0 && h < 40000);
          if (free === undefined) continue;
          moveObject(map, player, free);
          if (view.dialog.value) cmd.dialog.close();
          if (!cmd.talkTo(npc.id).ok) continue;
          talked++;
          const n = view.dialog.value?.options.length ?? 0;
          for (let i = 0; i < n; i++) {
            if (!view.dialog.value) {
              moveObject(map, player, free);
              if (!cmd.talkTo(npc.id).ok) break;
            }
            const o = view.dialog.value!.options[i];
            if (o?.visible) cmd.dialog.choose(i);
            for (let d = 0; d < 6 && view.dialog.value; d++) {
              const next = view.dialog.value.options.findIndex((x) => x.visible);
              if (next < 0) break;
              cmd.dialog.choose(next);
            }
            if (view.dialog.value) cmd.dialog.close();
          }
          if (view.dialog.value) cmd.dialog.close();
        }
        const bad = rt.log.filter(
          (l) =>
            l.kind === 'vmError' ||
            (l.kind === 'unsupported' && !ACCEPTED.test(l.message) && !DEFERRED.test(l.message)),
        );
        expect([...new Set(bad.map((b) => b.kind + ': ' + b.message))].join(' ; ')).toBe('');
        if (name === 'KLAMALL' || name === 'KLADWTWN') expect(talked).toBeGreaterThan(0);
      }, 300_000);
    });
  }
});
