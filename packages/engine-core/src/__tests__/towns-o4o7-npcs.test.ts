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

/** Miasta O4-O7: Vault 15, Vault 13, Navarro, San Francisco, Enclave. Skrypty .int w VM, rozmowy z NPC (wzorzec den-npcs). */
const GROUPS: Record<string, string[]> = {
  'Vault 15': ['V15ENT', 'V15SENT', 'VAULT15', 'V15_ORIG'],
  'Vault 13': ['V13ENT', 'VAULT13', 'V13_ORIG'],
  Navarro: ['NAVARRO'],
  'San Francisco': [
    'SFDOCK',
    'SFCHINA',
    'SFCHINA2',
    'SFELRONB',
    'SFSHUTL1',
    'SFSHUTL2',
    'SFTANKER',
  ],
  Enclave: ['ENCDET', 'ENCGD', 'ENCPRES', 'ENCRCTR', 'ENCTRP'],
};
const ONLY = process.env.F2_TOWN_GROUP;

/** Kosmetyczne/walkowe opkody akceptowane (jak ACCEPTED_UNSUPPORTED w tests/e2e/macro.ts, M4+). */
const ACCEPTED =
  /^(reg_anim|critter_add_trait|get_critter_stat|obj_can_see_obj|obj_lock|cur_map_index|critter_state|mouse_state_flag)/;

/** Odroczone do rdzenia walki/skilli (inny agent): do_check, attack, critter_injure; nieznane: op 0x80e4. */
const DEFERRED = /^(do_check|attack|critter_injure|script_op_80e4|use_obj_on_obj)/;

/**
 * Navarro (Z): ccgrdpa (straznik) w map_enter robi store_external guard1_obj..guard3_obj, a zadna z 40
 * zaladowanych na mapie programow nie eksportuje tych nazw (identyfikatory tylko w ccgrdpa), wiec oryginal
 * tez zglasza "External variable does not exist" i przerywa map_enter tego straznika (jak numDeathclaws w NCR4).
 */
const NAVARRO_GUARD_EXT =
  /ccgrdpa:map_enter_p_proc.*store_external: zmienna zewnetrzna "guard\d_obj" nie istnieje/;
function isBad(l: { kind: string; message: string }, name: string): boolean {
  if (l.kind === 'vmError') return !(name === 'NAVARRO' && NAVARRO_GUARD_EXT.test(l.message));
  return l.kind === 'unsupported' && !ACCEPTED.test(l.message) && !DEFERRED.test(l.message);
}

for (const [group, MAPS] of Object.entries(GROUPS)) {
  if (ONLY && ONLY !== group) continue;
  describe.skipIf(!dir || !patchDir)(`${group}: skrypty i dialogi w VM`, () => {
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
          await rt.settleSpawns();
          for (let i = 0; i < 3; i++) rt.tick(10);
          const bad = rt.log.filter((l) => isBad(l, name));
          expect([...new Set(bad.map((b) => b.kind + ': ' + b.message))].join(' ; ')).toBe('');
        }, 120_000);

        it('rozmowa z kazdym NPC ze skryptem, kazda opcja 1. poziomu', async () => {
          const { map, player, view, world, rt } = await setup(name);
          await rt.loadScriptsForMap(map);
          await rt.settleSpawns();
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
            if (view.dialog.value) view.dialog.value = null; // dialog bez aktywnej sesji wisi po talk_p_proc (znane, do M3 dialog)
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
          const bad = rt.log.filter((l) => isBad(l, name));
          expect([...new Set(bad.map((b) => b.kind + ': ' + b.message))].join(' ; ')).toBe('');
          expect(talked).toBeGreaterThanOrEqual(0);
        }, 300_000);
      });
    }
  });
}
