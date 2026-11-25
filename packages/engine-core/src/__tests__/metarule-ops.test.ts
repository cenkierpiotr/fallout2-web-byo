import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openGameFolderNode } from '@f2/vfs/node';
import type { NodeVfs } from '@f2/vfs/node';
import { int, obj as objV } from '@f2/vm';
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
import { fake } from './helpers.js';

const dir = process.env.F2_GAME_DIR;
const patchDir = process.env.F2_PATCH_DIR;

describe.skipIf(!dir)(
  'metarule/metarule3 i statystyki gracza sfall (ScriptRuntime, ARTEMPLE)',
  () => {
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

    it('tile_contains_pid_obj zwraca id obiektu, -1 gdy brak', async () => {
      const { map, player, rt } = await setup();
      expect(rt.tileObjByPid(player.hex, 0, player.pid)).toBe(player.id);
      expect(rt.tileObjByPid(player.hex, 0, 0x1234567)).toBe(-1);
      expect(map.objects.length).toBeGreaterThan(0);
    });

    it('metarule 1 i 28 oraz metarule3 0,1,31,45,300 nie istnieja w vanilla: 0 bez logu', async () => {
      const { rt } = await setup();
      const before = rt.log.length;
      for (const id of [1, 28]) expect(rt.metarule(id, int(0))).toEqual(int(0));
      for (const id of [0, 1, 31, 45, 300])
        expect(rt.metarule3(id, int(0), int(0))).toEqual(int(0));
      expect(rt.log.length).toBe(before);
    });

    it('metarule 31 startuje samochod: -1 bez paliwa, inaczej 0 i flaga ruchu', async () => {
      const { rt } = await setup();
      rt.carFuel = 0;
      expect(rt.metarule(31, int(0))).toEqual(int(-1));
      expect(rt.carMoving).toBe(false);
      rt.carFuel = 100;
      expect(rt.metarule(31, int(0))).toEqual(int(0));
      expect(rt.carMoving).toBe(true);
    });

    it('carFuel/carArea to widok CarState (rt.car): zapis w jedna i w druga strone, wlasnosc, JSON', async () => {
      const { rt } = await setup();
      expect(rt.car.fuel).toBe(80000);
      expect(rt.carArea).toBe(-1);
      expect(rt.car.owned).toBe(false);
      rt.carArea = 3;
      expect(rt.car.parkedArea).toBe(3);
      expect(rt.car.owned).toBe(true);
      rt.car.fuel = 1234;
      expect(rt.carFuel).toBe(1234);
      expect(rt.metarule3(110, int(0), int(0))).toEqual(int(0));
      rt.carFuel = 0;
      expect(rt.metarule3(110, int(0), int(0))).toEqual(int(1));
      expect(rt.car.stow(5, 2, 3)).toBe(true);
      const j = JSON.parse(JSON.stringify(rt.car.toJSON()));
      rt.car.restoreFrom({ ...j, fuel: 9, trunk: [] });
      expect(rt.carFuel).toBe(9);
      rt.car.restoreFrom(j);
      expect(rt.car.trunkCount).toBe(2);
    });

    it('metarule 52/53 zapisuje i czyta wartosc', async () => {
      const { rt } = await setup();
      expect(rt.metarule(53, int(0))).toEqual(int(0));
      expect(rt.metarule(52, objV(42))).toEqual(int(1));
      expect(rt.metarule(53, int(0))).toEqual(int(42));
    });

    it('premie statystyk gracza (sfall 0x815b/0x815d)', async () => {
      const { rt } = await setup();
      expect(rt.unsupported('get_pc_extra_stat', [int(3)])).toEqual(int(0));
      rt.unsupported('set_pc_extra_stat', [int(3), int(2)]);
      expect(rt.unsupported('get_pc_extra_stat', [int(3)])).toEqual(int(2));
    });
  },
);
