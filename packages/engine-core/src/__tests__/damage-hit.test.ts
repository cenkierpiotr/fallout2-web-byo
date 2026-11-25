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
import { hexInDirection } from '../hexgrid.js';
import { critterSnapshot, critterState } from '../critter-model.js';
import { fake } from './helpers.js';

const dir = process.env.F2_GAME_DIR;
const patchDir = process.env.F2_PATCH_DIR;

describe.skipIf(!dir)('applyHit/explodeAt: damage_p_proc + metarule 49 (ARCAVES)', () => {
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

  async function setup(before?: (map: GameMap) => void) {
    const map: GameMap = await loader.load('ARCAVES');
    const player: GameObject = fake(1, map.header.playerHex, 0, {
      kind: 'critter',
      flags: 0,
      raw: new Int32Array(0),
    });
    player.id = 0x10000;
    map.objects.push(player);
    indexObject(map, player);
    before?.(map);
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
    const door = map.objects.find((o) => o.pid === 0x20003a4)!;
    return { map, player, rt, door };
  }

  const at = (map: GameMap, hex: number, pid: number) =>
    map.objects.filter((o) => o.hex === hex && o.elevation === 1 && o.pid === pid);

  it('wybuch (typ 6) zamienia drzwi 0x20003a4 na 0x20003a5, inny typ nie', async () => {
    const { map, rt, door, player } = await setup();
    const hex = door.hex;
    expect(door).toBeDefined();
    expect(rt.hasObjectProc(door.id, 'damage_p_proc')).toBe(true);
    const r0 = rt.applyHit(door.id, player.id, 0);
    expect(r0.error).toBe(false);
    expect(at(map, hex, 0x20003a4)).toHaveLength(1);
    expect(at(map, hex, 0x20003a5)).toHaveLength(0);
    const r = rt.applyHit(door.id, player.id, 6);
    expect(r.ran).toBe(true);
    expect(r.error).toBe(false);
    expect(at(map, hex, 0x20003a4)).toHaveLength(0);
    expect(at(map, hex, 0x20003a5)).toHaveLength(1);
    expect(rt.weaponDamageType).toBe(0);
  }, 120_000);

  it('explodeAt trafia obiekty na kaflu', async () => {
    const { map, rt, door } = await setup();
    const hex = door.hex;
    expect(rt.explodeAt(hex, door.elevation)).toContain(door.id);
    expect(at(map, hex, 0x20003a5)).toHaveLength(1);
  }, 120_000);

  it('opkod explosion wykonuje wybuch: drzwi na kaflu otwarte, kryter obok dostaje obrazenia', async () => {
    let victim!: GameObject;
    const { map, rt, door } = await setup((m) => {
      const d = m.objects.find((o) => o.pid === 0x20003a4)!;
      victim = fake(
        1,
        hexInDirection(d.hex, 0),
        0,
        { kind: 'critter', flags: 0, raw: Int32Array.from([0, 0, 0, 0, 0, 0, 0, 40]) },
        d.elevation as 1,
      );
      victim.id = 0x10001;
      victim.proto = { kind: 'misc' } as never;
      m.objects.push(victim);
      indexObject(m, victim);
    });
    const hex = door.hex;
    rt.explosion(hex, door.elevation, 15);
    expect(at(map, hex, 0x20003a5)).toHaveLength(1);
    expect(at(map, hex, 0x20003a4)).toHaveLength(0);
    expect(critterState(victim)).toBe(0);
    expect(critterSnapshot(victim)?.hp).toBe(25);
    expect(rt.weaponDamageType).toBe(0);
  }, 120_000);

  it('explosion z kaflem -1 nic nie robi', async () => {
    const { map, rt, door } = await setup();
    rt.explosion(-1, 0, 15);
    expect(at(map, door.hex, 0x20003a4)).toHaveLength(1);
  }, 120_000);

  it('pickup_obj (pickupItem): przedmiot trafia do ekwipunku, limit udzwigu daje -6 i komunikat 0x389', async () => {
    const { map, rt, player } = await setup();
    const items = map.objects.filter(
      (o) => o.type === 0 && !rt.hasObjectProc(o.id, 'pickup_p_proc'),
    );
    const [a, b] = [items[0]!, items[1]!];
    expect(a).toBeDefined();
    const msgs: number[] = [];
    rt.onPickupBlocked = (_who, id) => void msgs.push(id);
    rt.canCarry = (_who, item) => item !== b.id;
    expect(rt.pickupItem(player.id, b.id)).toBe(-6);
    expect(msgs).toEqual([0x389]);
    expect(player.inventory).not.toContain(b);
    expect(rt.pickupItem(player.id, a.id)).toBe(0);
    expect(player.inventory).toContain(a);
    expect(rt.pickupItem(player.id, player.id)).toBe(-1);
  }, 120_000);
});
