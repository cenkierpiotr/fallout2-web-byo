import { describe, expect, it } from 'vitest';
import { int, obj as objV } from '@f2/vm';
import {
  GameClock,
  GameVars,
  MovementSystem,
  ScriptRuntime,
  createGameView,
  createViewDialogHooks,
  type GameMap,
  type World,
} from '../index.js';
import { emptyMap, fake } from './helpers.js';

// metarule(51) 0x42d920 (D): gracz -> stat 34 (plec) == 1 ? 1 : 0; kryter -> killType protoka; reszta -> -1.
function make(gender: number) {
  const map: GameMap = emptyMap();
  const player = fake(1, 100, 0, { kind: 'critter', flags: 0, raw: new Int32Array(0) });
  player.id = 0x10000;
  const npc = fake(1, 200, 0, { kind: 'critter', flags: 0, raw: new Int32Array(0) });
  (npc as { proto?: unknown }).proto = { killType: 7 };
  const item = fake(1, 300, 0, { kind: 'item', flags: 0, raw: new Int32Array(0) });
  map.objects.push(player, npc, item);
  const view = createGameView();
  const world = {
    map,
    player,
    clock: new GameClock(),
    movement: new MovementSystem(map),
    loader: {} as never,
    view,
  } as World;
  const rt = new ScriptRuntime(
    world,
    {} as never,
    new GameVars(new Int32Array(10)),
    createViewDialogHooks(view),
    {
      vfs: {} as never,
    },
  );
  world.scripts = rt;
  const reg = (rt as unknown as { objects: Map<number, unknown> }).objects;
  for (const o of [player, npc, item]) reg.set(o.id, o);
  (rt as unknown as { getCritterStat: (id: number, s: number) => number }).getCritterStat = (
    id,
    s,
  ) => (id === player.id && s === 34 ? gender : 0);
  return { rt, player, npc, item };
}

describe('metarule 51', () => {
  it('gracz: plec 1 -> 1, plec 0 -> 0 (nie killType)', () => {
    const f = make(1);
    expect(f.rt.metarule(51, objV(f.player.id))).toEqual(int(1));
    const m = make(0);
    expect(m.rt.metarule(51, objV(m.player.id))).toEqual(int(0));
  });
  it('NPC: killType protoka; przedmiot: -1', () => {
    const f = make(1);
    expect(f.rt.metarule(51, objV(f.npc.id))).toEqual(int(7));
    expect(f.rt.metarule(51, objV(f.item.id))).toEqual(int(-1));
  });
});
