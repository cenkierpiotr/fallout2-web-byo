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
  type World,
} from '../index.js';
import { critterDamage, critterHp } from '../critter-model.js';
import { fake } from './helpers.js';

const dir = process.env.F2_GAME_DIR;
const patchDir = process.env.F2_PATCH_DIR;
const A = 'KLAMALL';
const B = 'KLATRAP';
const HOUR = 36000;

/** Stan map miedzy wizytami (zmienne lokalne skryptow, obiekty, timery, starzenie) na prawdziwych mapach. */
describe.skipIf(!dir)('Powrot na mape: stan zachowany', () => {
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

  async function rig() {
    const first: GameMap = await loader.load(A);
    const player: GameObject = fake(1, first.header.playerHex, 0, {
      kind: 'critter',
      flags: 0,
      raw: new Int32Array(0),
    });
    player.id = 0x10000;
    const place = (m: GameMap): void => {
      m.objects = m.objects.filter((o) => o !== player);
      m.objects.push(player);
      indexObject(m, player);
    };
    place(first);
    const view = createGameView();
    const world: World = {
      map: first,
      player,
      clock: new GameClock(),
      movement: new MovementSystem(first),
      loader,
      view,
    };
    const vars = new GameVars(Int32Array.from({ length: 700 }, () => 0));
    const rt = new ScriptRuntime(world, msgs, vars, createViewDialogHooks(view), {
      vfs,
      rng: () => 0.5,
    });
    world.scripts = rt;
    await rt.loadScriptsForMap(first);
    const go = async (name: string): Promise<GameMap> => {
      const m = await loader.load(name);
      world.map = m;
      world.movement.setMap(m);
      place(m);
      await rt.loadScriptsForMap(m);
      return m;
    };
    return { world, rt, player, first, go };
  }

  it('zmienne lokalne skryptu i zmienne mapy przezywaja wyjscie i powrot, timery nie', async () => {
    const { rt, first, go, world } = await rig();
    const entry = rt.scheduler.all().find((e) => e.localVars.length > 0)!;
    expect(entry).toBeTruthy();
    const sid = entry.sid;
    entry.localVars[0] = 42;
    first.globalVars = Int32Array.from([...first.globalVars, 0, 0]);
    first.globalVars[first.globalVars.length - 1] = 9;
    rt.scheduler.addTimerEvent(sid, 5000, 3);
    const dueAt = world.clock.ticks + 5000;

    await go(B);
    expect(rt.registry.has(A)).toBe(true);

    await go(A);
    const back = rt.scheduler.get(sid)!;
    expect(back.localVars[0]).toBe(42);
    expect(world.map.globalVars[world.map.globalVars.length - 1]).toBe(9);
    // 0x483c98/0x4a2920: timery skryptow sa czyszczone przy opuszczaniu mapy i nie wracaja (D)
    expect(rt.scheduler.timers.snapshot((s) => s === sid)).toEqual([]);
    world.clock.advance(5000);
    rt.syncClock();
    expect(rt.scheduler.timers.snapshot((s) => s === sid)).toEqual([]);
    void dueAt;
  }, 120_000);

  it('obiekty: przesuniecie i zabicie zostaja; po 200 h krytery sie leczy a martwy znika', async () => {
    const { first, go, world, player } = await rig();
    const critters = first.objects.filter((o) => o.type === 1 && o.id !== player.id && o.id > 0);
    const [hurt, victim] = [critters[0]!, critters[1]!];
    const hurtId = hurt.id;
    const victimId = victim.id;
    const hurtMax = 6;
    critterDamage(hurt, 2, hurtMax);
    const hpBefore = critterHp(hurt, hurtMax);
    const moved = hurt.hex === 100 ? 101 : 100;
    hurt.hex = moved;
    critterDamage(victim, 9999, hurtMax);

    await go(B);
    world.clock.advance(10 * HOUR);
    const m = await go(A);
    const h2 = m.objects.find((o) => o.id === hurtId)!;
    expect(h2.hex).toBe(moved);
    expect(critterHp(h2, hurtMax)).toBeGreaterThanOrEqual(hpBefore);
    expect(m.objects.some((o) => o.id === victimId)).toBe(true);

    await go(B);
    world.clock.advance(200 * HOUR);
    const m2 = await go(A);
    expect(m2.objects.some((o) => o.id === victimId)).toBe(false);
    expect(m2.objects.find((o) => o.id === hurtId)).toBeTruthy();
  }, 120_000);
});
