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
  type GameObject,
  type World,
} from '../index.js';
import { emptyMap, fake } from './helpers.js';

function makeRt() {
  const map: GameMap = emptyMap();
  const player: GameObject = fake(1, 100, 0, { kind: 'critter', flags: 0, raw: new Int32Array(0) });
  player.id = 0x10000;
  map.objects.push(player);
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
  const reg = (rt as unknown as { objects: Map<number, GameObject> }).objects;
  reg.set(player.id, player);
  return { rt, player, map };
}

describe('sygnaly konca gry ze skryptow', () => {
  it('metarule 13 (SIGNAL_END_GAME) ustawia flage i wola callback raz', () => {
    const { rt } = makeRt();
    let n = 0;
    rt.onEndGame = () => n++;
    expect(rt.endGameRequested).toBe(false);
    expect(rt.metarule(13, int(0))).toEqual(int(0));
    rt.metarule(13, int(0));
    expect(rt.endGameRequested).toBe(true);
    expect(n).toBe(1);
    rt.clearEndSignals();
    expect(rt.endGameRequested).toBe(false);
  });
  it('kill_critter na graczu zglasza smierc, na NPC nie', () => {
    const { rt, player, map } = makeRt();
    const npc = fake(1, 200, 0, { kind: 'critter', flags: 0, raw: new Int32Array(0) });
    map.objects.push(npc);
    (rt as unknown as { objects: Map<number, GameObject> }).objects.set(npc.id, npc);
    rt.unsupported('kill_critter', [objV(npc.id), int(0)]);
    expect(rt.playerDeathRequested).toBe(false);
    rt.unsupported('kill_critter', [objV(player.id), int(0)]);
    expect(rt.playerDeathRequested).toBe(true);
  });
});
