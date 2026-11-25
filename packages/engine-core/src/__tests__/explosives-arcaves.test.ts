import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openGameFolderNode } from '@f2/vfs/node';
import type { NodeVfs } from '@f2/vfs/node';
import {
  EventQueue,
  GameClock,
  GameVars,
  MapLoader,
  MessageSource,
  MovementSystem,
  ProtoCache,
  ScriptRuntime,
  createGameView,
  createViewDialogHooks,
  handleExplosiveEvent,
  indexObject,
  plantExplosive,
  type GameMap,
  type GameObject,
  type World,
} from '../index.js';
import { fake } from './helpers.js';

const dir = process.env.F2_GAME_DIR;
const patchDir = process.env.F2_PATCH_DIR;

/**
 * Mur 0x20003a4 (ARCAVES el1): jego damage_p_proc sprawdza metarule(49, target_obj) == 6, gdzie target_obj = BRON
 * (0x424c04, D). Ladunek (misc 0x55) nie jest bronia: jego wybuch nie wola damage_p_proc muru (0x412cf4, D).
 */
describe.skipIf(!dir)('ARCAVES: ladunek vs mur 0x20003a4', () => {
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

  async function setup(): Promise<{ rt: ScriptRuntime; map: GameMap; player: GameObject }> {
    const map: GameMap = await loader.load('ARCAVES');
    const door = map.objects.find((o) => o.pid === 0x20003a4)!;
    const player: GameObject = fake(
      1,
      door.hex + 1,
      0,
      { kind: 'critter', flags: 0, raw: new Int32Array(0) },
      door.elevation as 0 | 1 | 2,
    );
    player.id = 0x10000;
    player.proto = {
      kind: 'critter',
      baseStats: new Array<number>(40).fill(200),
      bonusStats: new Array<number>(40).fill(0),
    } as never;
    map.objects.push(player);
    indexObject(map, player);
    for (const [id, pid, type] of [
      [7, 0x55, 0],
      [8, 0x19, 0],
    ] as const) {
      const x = fake(0, 0, 0, { kind: 'misc', flags: 0 }, door.elevation as 0 | 1 | 2);
      x.id = id;
      x.pid = pid;
      x.type = type;
      map.objects.push(x);
    }
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
    return { rt, map, player };
  }

  it('ladunek plastikowy nie niszczy muru, bron typu Explosion tak', async () => {
    const { rt, map, player } = await setup();
    const door = map.objects.find((o) => o.pid === 0x20003a4)!;
    const doorHex = door.hex;
    const queue = new EventQueue();

    // ladunek w ekwipunku gracza, ustawiony na 10 s (rzut Traps = sukces)
    const charge = map.objects.find((o) => o.id === 7)!;
    rt.inventory.registerInventories([player]);
    rt.inventory.addObjToInven(player.id, charge.id);
    const r = plantExplosive(rt, queue, {
      playerId: player.id,
      itemId: charge.id,
      seconds: 10,
      rollResult: 2,
      demolitionExpert: false,
      nowTick: 1000,
    });
    expect(r).toEqual({ ok: true, kind: 'explosion', atTick: 1100 });
    expect(charge.pid).toBe(0xd1);
    expect(queue.size).toBe(1);

    queue.processUntil(1100, (e) => handleExplosiveEvent(rt, queue, e, 1100));
    expect(queue.size).toBe(0);
    // ladunek zniszczony, mur nietkniety (wybuch nie wola damage_p_proc na nie-krytterze)
    expect(rt.getObject(charge.id)).toBeUndefined();
    expect(map.objects.some((o) => o.pid === 0x20003a4)).toBe(true);

    // atak bronia typu Explosion (6) w mur: damage_p_proc (target_obj = bron) niszczy go
    const weapon = map.objects.find((o) => o.id === 8)!;
    expect(rt.applyWeaponHit(door.id, player.id, weapon.id, 6).ran).toBe(true);
    expect(map.objects.some((o) => o.pid === 0x20003a4)).toBe(false);
    expect(map.objects.some((o) => o.pid === 0x20003a5 && o.hex === doorHex)).toBe(true);
  });

  it('typ obrazen inny niz Explosion nie niszczy muru', async () => {
    const { rt, map, player } = await setup();
    const door = map.objects.find((o) => o.pid === 0x20003a4)!;
    const weapon = map.objects.find((o) => o.id === 8)!;
    rt.applyWeaponHit(door.id, player.id, weapon.id, 0);
    expect(map.objects.some((o) => o.pid === 0x20003a4)).toBe(true);
  });
});
