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
  hexNeighbors,
  indexObject,
  isHexBlocked,
  objectsAt,
  type GameMap,
  type GameObject,
  type World,
} from '../index.js';
import { fake } from './helpers.js';

const dir = process.env.F2_GAME_DIR;
const patchDir = process.env.F2_PATCH_DIR;

/**
 * Droga z ARTEMPLE do ARVILLAG idzie przez ARCAVES (R8b/R8c w dokumentacja techniczna).
 * Test sprawdza lancuch kondygnacji wg samych regul silnika (bez recznego zdejmowania flag): drzwi sa przechodnie
 * (otwieraja sie przy podejsciu), jedyna przeszkoda bez reguly to mur 0x20003a4 na el1, ktory znika po wybuchu.
 */
describe.skipIf(!dir)('ARCAVES: lancuch kondygnacji do wyjscia ARVILLAG', () => {
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

  const isDoor = (o: GameObject): boolean => o.extra?.kind === 'door';
  /** Blokada dla gracza: jak isHexBlocked, ale heks zajety wylacznie przez drzwi jest przechodni (f2_path_door_passable). */
  const blocked = (map: GameMap, el: 0 | 1 | 2, hex: number): boolean => {
    if (!isHexBlocked(map, el, hex)) return false;
    const blockers = objectsAt(map, el, hex).filter(
      (o) => (o.type === 1 || o.type === 2 || o.type === 3) && (o.flags & 0x11) === 0,
    );
    return blockers.length === 0 || !blockers.every(isDoor);
  };
  const reach = (map: GameMap, el: 0 | 1 | 2, start: number): Set<number> => {
    const seen = new Set<number>([start]);
    const q = [start];
    while (q.length) {
      const c = q.pop()!;
      for (const n of hexNeighbors(c)) {
        if (n < 0 || n >= 40000 || seen.has(n) || blocked(map, el, n)) continue;
        seen.add(n);
        q.push(n);
      }
    }
    return seen;
  };
  const exitsReached = (
    map: GameMap,
    el: 0 | 1 | 2,
    start: number,
    dest: (e: GameMap['exitGrids'][number]) => boolean,
  ) => {
    const r = reach(map, el, start);
    return map.exitGrids.filter((e) => e.elevation === el && dest(e) && r.has(e.hex));
  };

  it('el0: start dochodzi do wyjscia na el1; el1: wejscie bez wybuchu NIE dochodzi do el2, po wybuchu tak; el2: do ARVILLAG (wybuch tworzy obiekt z flagami PRO)', async () => {
    const map: GameMap = await loader.load('ARCAVES');
    const player: GameObject = fake(1, map.header.playerHex, 0, {
      kind: 'critter',
      flags: 0,
      raw: new Int32Array(0),
    });
    player.id = 0x10000;
    map.objects.push(player);
    indexObject(map, player);

    // el0: start (28906) -> wyjscie na el1 (hex 29097)
    const up0 = exitsReached(
      map,
      0,
      map.header.playerHex,
      (e) => e.destMap === 3 && e.destElevation === 1,
    );
    expect(up0.length).toBeGreaterThan(0);
    const arrival1 = up0[0]!.destHex;

    // el1 bez wybuchu: mur 14318-14323 (drzwi 0x20003a4, hex 14322) odcina komore schodow
    const stairs1 = (e: GameMap['exitGrids'][number]) => e.destMap === 3 && e.destElevation === 2;
    expect(exitsReached(map, 1, arrival1, stairs1)).toHaveLength(0);

    // na el1 jest ladunek 0x55 (85) w pojemnikach/ekwipunkach (W: pid 0x55 i 0x31 wystepuja tylko na el1)
    const flat = (o: GameObject): GameObject[] => [o, ...o.inventory.flatMap(flat)];
    const el1Items = map.objects
      .filter((o) => o.elevation === 1)
      .flatMap(flat)
      .filter((o) => o.type === 0)
      .map((o) => o.pid & 0xffffff);
    expect(el1Items).toContain(0x55);

    // wybuch na heksie muru (typ 6) wywoluje damage_p_proc drzwi -> 0x20003a5
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
      {
        vfs,
        rng: () => 0.5,
      },
    );
    world.scripts = rt;
    await rt.loadScriptsForMap(map);
    const door = map.objects.find((o) => o.pid === 0x20003a4)!;
    expect(rt.explodeAt(door.hex, door.elevation)).toContain(door.id);

    const after = exitsReached(map, 1, arrival1, stairs1);
    expect(after.length).toBeGreaterThan(0);
    const arrival2 = after[0]!.destHex;

    // el2: wyjscia ARVILLAG (13326-13328, destMap 4) leza za drzwiami 13528 (przechodnie, o ile nie zamkniete na klucz)
    const toVillage = (e: GameMap['exitGrids'][number]) => e.destMap === 4;
    expect(exitsReached(map, 2, arrival2, toVillage).length).toBeGreaterThan(0);
  }, 180_000);
});
