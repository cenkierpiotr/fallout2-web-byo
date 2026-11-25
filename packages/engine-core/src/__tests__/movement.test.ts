import { describe, expect, it } from 'vitest';
import {
  GameClock,
  GameCommands,
  MovementSystem,
  createGameView,
  directionTo,
  hexInDirection,
  hexNeighbors,
  isDoorOpen,
  type GameMap,
  type World,
} from '../index.js';
import { door, emptyMap, fake, put } from './helpers.js';

const START = 20100;
const T = { ticksPerHexWalk: 2, ticksPerHexRun: 1, framesPerHex: 4 };

function world(m: GameMap, loader?: World['loader']) {
  const player = put(m, fake(1, START));
  const movement = new MovementSystem(m, T);
  const w: World = {
    map: m,
    player,
    clock: new GameClock(0),
    movement,
    loader: loader ?? { load: () => Promise.reject(new Error('brak')) },
    view: createGameView(),
  };
  return { w, cmd: new GameCommands(w), player, movement };
}

describe('MovementSystem', () => {
  it('test_movement_tick_advances_hex_per_frames_from_spec', () => {
    const m = emptyMap();
    const { player, movement } = world(m);
    const p = [1, 2, 3].map((n) => hexInDirection(START, 0, n));
    expect(movement.start(player, p, false)).toEqual({ ok: true });
    expect(movement.start(player, p, false)).toEqual({ ok: false, reason: 'busy' });
    expect(movement.tick(player, 1)).toEqual({ arrived: false });
    expect(player.hex).toBe(START);
    expect(movement.stateOf(player)!.frame).toBe(2);
    expect(movement.tick(player, 1)).toEqual({ arrived: false, enteredHex: p[0] });
    expect(player.hex).toBe(p[0]);
    expect(m.byHex.get(p[0]!)).toContain(player);
    expect(movement.tick(player, 2).enteredHex).toBe(p[1]);
    expect(movement.tick(player, 2)).toEqual({ arrived: true, enteredHex: p[2] });
    expect(movement.stateOf(player)).toBeUndefined();
  });

  it('bieg jest szybszy, kod animacji', () => {
    const m = emptyMap();
    const { player, movement } = world(m);
    const p = [1, 2].map((n) => hexInDirection(START, 3, n));
    movement.start(player, p, true);
    expect(movement.stateOf(player)!.animCode).toBe('AT');
    expect(movement.tick(player, 2)).toEqual({ arrived: true, enteredHex: p[1] });
  });

  it('test_movement_rotation_follows_direction', () => {
    const m = emptyMap();
    const { player, movement } = world(m);
    const a = hexInDirection(START, 2, 1);
    const b = hexInDirection(a, 4, 1);
    movement.start(player, [a, b], false);
    movement.tick(player, 2);
    expect(player.rotation).toBe(directionTo(START, a));
    movement.tick(player, 2);
    expect(player.rotation).toBe(directionTo(a, b));
    expect(directionTo(START, a)).not.toBe(directionTo(a, b));
  });

  it('drzwi otwieraja sie przy wejsciu', () => {
    const m = emptyMap();
    const { player, movement } = world(m);
    const mid = hexInDirection(START, 0, 1);
    const to = hexInDirection(START, 0, 2);
    const d = put(m, door(mid));
    movement.start(player, [mid, to], false);
    movement.tick(player, 2);
    expect(isDoorOpen(d)).toBe(true);
    expect(player.hex).toBe(mid);
  });

  it('wlasny opener drzwi jest wolany; odmowa blokuje ruch', () => {
    const m = emptyMap();
    const player = put(m, fake(1, START));
    const mid = hexInDirection(START, 0, 1);
    const d = put(m, door(mid));
    const seen: unknown[] = [];
    const deny = new MovementSystem(m, T, undefined, undefined, (mv, dr) => {
      seen.push([mv, dr]);
      return false;
    });
    deny.start(player, [mid], false);
    deny.tick(player, 2);
    expect(seen[0]).toEqual([player, d]);
    expect(isDoorOpen(d)).toBe(false);
    expect(player.hex).toBe(START);
  });

  it('polityka NPC: czworonog nie otwiera drzwi, a doorPolicy jest publiczne', () => {
    const m = emptyMap();
    const dog = put(m, fake(1, START));
    const mid = hexInDirection(START, 0, 1);
    const d = put(m, door(mid));
    const ms = new MovementSystem(m, T, undefined, () => false);
    expect(ms.doorPolicy(dog, d)).toBe(false);
    ms.start(dog, [mid], false);
    ms.tick(dog, 2);
    expect(dog.hex).toBe(START);
    expect(isDoorOpen(d)).toBe(false);
  });

  it('nagle zablokowany heks: ponowne planowanie omija przeszkode', () => {
    const m = emptyMap();
    const { player, movement } = world(m);
    const a = hexInDirection(START, 0, 1);
    const to = hexInDirection(START, 0, 3);
    const path = [a, hexInDirection(START, 0, 2), to];
    movement.start(player, path, false);
    put(m, fake(3, path[0]!));
    const r = movement.tick(player, 100);
    expect(r.arrived).toBe(true);
    expect(player.hex).toBe(to);
  });

  it('zamkniete na klucz drzwi bez obejscia: ruch konczy sie bez dojscia', () => {
    const m = emptyMap();
    const { player, movement } = world(m);
    const a = hexInDirection(START, 0, 1);
    const to = hexInDirection(START, 0, 2);
    for (const n of new Set([...hexNeighbors(START), ...hexNeighbors(a), ...hexNeighbors(to)])) {
      if (n !== START && n !== a && n !== to) put(m, fake(3, n));
    }
    movement.start(player, [a, to], false);
    put(m, door(a, 0x2));
    expect(movement.tick(player, 10).arrived).toBe(false);
    expect(movement.stateOf(player)).toBeUndefined();
    expect(player.hex).toBe(START);
  });
});

describe('GameCommands', () => {
  it('test_commands_moveTo_blocked_returns_reason_no_throw', () => {
    const m = emptyMap();
    const { cmd } = world(m);
    const t = hexInDirection(START, 0, 4);
    put(m, fake(3, t));
    expect(cmd.moveTo(t)).toEqual({ ok: false, reason: 'blocked' });
    expect(cmd.moveTo(START)).toEqual({ ok: false, reason: 'sameHex' });
  });

  it('test_commands_moveTo_outOfMap', () => {
    const { cmd } = world(emptyMap());
    expect(cmd.moveTo(-1)).toEqual({ ok: false, reason: 'outOfMap' });
    expect(cmd.moveTo(40000)).toEqual({ ok: false, reason: 'outOfMap' });
    expect(cmd.moveTo(1.5)).toEqual({ ok: false, reason: 'outOfMap' });
  });

  it('moveTo + update dochodzi, busy w trakcie, widok i zegar', () => {
    const m = emptyMap();
    const { cmd, w, player } = world(m);
    const t = hexInDirection(START, 1, 3);
    expect(cmd.moveTo(t, true)).toEqual({ ok: true });
    expect(w.view.player.value.moving).toBe(true);
    expect(cmd.moveTo(t)).toEqual({ ok: false, reason: 'busy' });
    cmd.update(10);
    expect(player.hex).toBe(t);
    expect(w.view.player.value).toEqual({ hex: t, elevation: 0, moving: false });
    expect(w.clock.gameTime()).toBe(10);
  });

  it('moveTo bez sciezki: noPath', () => {
    const m = emptyMap();
    const { cmd } = world(m);
    for (const n of hexNeighbors(START)) put(m, fake(3, n));
    expect(cmd.moveTo(START + 1000)).toEqual({ ok: false, reason: 'noPath' });
  });

  it('update zwraca exit grid po wejsciu na niego', () => {
    const m = emptyMap();
    const { cmd } = world(m);
    const t = hexInDirection(START, 0, 2);
    m.exitGrids.push({
      hex: t,
      elevation: 0,
      destMap: 7,
      destHex: 10,
      destElevation: 0,
      destOrientation: 2,
    });
    cmd.moveTo(t);
    expect(cmd.update(100).exit?.destMap).toBe(7);
  });

  it('useObject i setElevation', () => {
    const m = emptyMap();
    m.tiles[1] = { floor: new Uint16Array(0), roof: new Uint16Array(0) };
    const { cmd, player } = world(m);
    const d = put(m, door(START + 5));
    expect(cmd.useObject(d.id)).toEqual({ ok: true });
    expect(cmd.useObject(99999)).toEqual({ ok: false, reason: 'noPath' });
    expect(cmd.setElevation(1)).toEqual({ ok: true });
    expect(player.elevation).toBe(1);
    expect(m.byHex.get(100000 + START)).toContain(player);
    expect(cmd.setElevation(2)).toEqual({ ok: false, reason: 'outOfMap' });
    expect(cmd.setElevation(1)).toEqual({ ok: false, reason: 'sameHex' });
  });

  it('test_commands_travelTo_loads_map_and_places_player', async () => {
    const a = emptyMap();
    a.name = 'A';
    const b = emptyMap();
    b.name = 'B';
    b.header.playerHex = 777;
    const loader = {
      load: (n: string) => (n === 'B' ? Promise.resolve(b) : Promise.reject(new Error('x'))),
    };
    const { cmd, w, player } = world(a, loader);
    expect(await cmd.travelTo('ZZZ')).toEqual({ ok: false, reason: 'outOfMap' });
    expect(await cmd.travelTo('B')).toEqual({ ok: true });
    expect(w.map).toBe(b);
    expect(player.hex).toBe(777);
    expect(b.byHex.get(777)).toContain(player);
    expect(a.byHex.has(START)).toBe(false);
    expect(a.objects).not.toContain(player);
    expect(w.view.currentMap.value).toEqual({ name: 'B', elevation: 0 });
    expect(await cmd.travelTo('B', 900, 0)).toEqual({ ok: true });
    expect(player.hex).toBe(900);
    expect(b.objects.filter((o) => o === player).length).toBe(1);
    expect(await cmd.travelTo('B', 50000)).toEqual({ ok: false, reason: 'outOfMap' });
  });
});

import { openGameFolderNode } from '@f2/vfs/node';
import { MapLoader, ProtoCache, findPath, isHexBlocked } from '../index.js';

const gameDir = process.env.F2_GAME_DIR;
describe.skipIf(!gameDir)('pathfinding na artemple (dane z gry)', () => {
  it('sciezka od startu gracza do exit grid, bez blokad po drodze', async () => {
    const vfs = await openGameFolderNode(gameDir!);
    try {
      const map = await new MapLoader(vfs, new ProtoCache(vfs)).load('ARTEMPLE');
      const el = map.header.playerElevation as 0 | 1 | 2;
      const player = fake(1, map.header.playerHex, 0, { kind: 'misc', flags: 0 }, el);
      const eg = map.exitGrids.find((e) => e.elevation === el);
      expect(eg).toBeDefined();
      const p = findPath(map, el, player.hex, eg!.hex, player)!;
      expect(p).not.toBeNull();
      expect(p.at(-1)).toBe(eg!.hex);
      for (const h of p) expect(isHexBlocked(map, el, h, player)).toBe(false);
    } finally {
      await vfs.close();
    }
  }, 120_000);
});
