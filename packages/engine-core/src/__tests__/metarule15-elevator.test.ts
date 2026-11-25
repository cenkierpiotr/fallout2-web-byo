import { describe, expect, it } from 'vitest';
import { int, type ScriptInstance } from '@f2/vm';
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

// metarule(15) 0x4a466c (D): stub windy pid 0x200050d w oknie 10x10 kafli (-5..+4) wokol wlasciciela.
function make(stubHex: number | undefined, stubRaw = [3, 1]) {
  const map: GameMap = emptyMap();
  const player = fake(1, 100, 0, { kind: 'critter', flags: 0, raw: new Int32Array(0) });
  player.id = 0x10000;
  const owner = fake(2, 20100, 0, {
    kind: 'scenery',
    subtype: 5,
    flags: 0,
    raw: new Int32Array(0),
  });
  owner.id = 77;
  map.objects.push(player, owner);
  if (stubHex !== undefined) {
    const stub = fake(2, stubHex, 0, {
      kind: 'elevator',
      subtype: 2,
      flags: 0,
      raw: new Int32Array(stubRaw),
    });
    stub.pid = 0x200050d;
    stub.id = 78;
    map.objects.push(stub);
  }
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
  for (const o of map.objects) reg.set(o.id, o);
  const inst = {} as ScriptInstance;
  (rt.scheduler as unknown as { entryOf: (i: ScriptInstance) => unknown }).entryOf = (i) =>
    i === inst ? { ownerObjectId: 77 } : undefined;
  return { rt, inst };
}

describe('metarule 15 (winda)', () => {
  it('stub w oknie nadpisuje typ i kondygnacje, zwraca 0 i zglasza zadanie', () => {
    const f = make(20100 - 5 * 200 - 5 + 3);
    const seen: unknown[] = [];
    f.rt.onElevatorRequest = (r) => seen.push(r);
    expect(f.rt.metarule(15, int(9), f.inst)).toEqual(int(0));
    expect(seen).toEqual([{ type: 3, level: 1 }]);
    expect(f.rt.takeElevatorRequest()).toEqual({ type: 3, level: 1 });
    expect(f.rt.takeElevatorRequest()).toBeUndefined();
  });
  it('stub poza oknem (+5 kolumn) nie jest widziany: typ z argumentu, kondygnacja biezaca', () => {
    const f = make(20100 + 5);
    expect(f.rt.metarule(15, int(9), f.inst)).toEqual(int(0));
    expect(f.rt.takeElevatorRequest()).toEqual({ type: 9, level: 0 });
  });
  it('typ -1 => -1 bez zadania; brak wlasciciela => -1', () => {
    const f = make(undefined);
    expect(f.rt.metarule(15, int(-1), f.inst)).toEqual(int(-1));
    expect(f.rt.takeElevatorRequest()).toBeUndefined();
    expect(f.rt.metarule(15, int(2))).toEqual(int(-1));
  });
});
