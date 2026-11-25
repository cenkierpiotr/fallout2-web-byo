import { describe, expect, it } from 'vitest';
import {
  GameClock,
  GameVars,
  MovementSystem,
  ScriptRuntime,
  createGameView,
  createViewDialogHooks,
  type MessageSource,
  type World,
} from '../index.js';
import { emptyMap, fake } from './helpers.js';

describe('mowa w dialogu: hooki widoku i messageAudio', () => {
  it('speak jest przekazywany, end() zatrzymuje mowe', () => {
    const calls: string[] = [];
    const view = createGameView();
    const h = createViewDialogHooks(view, {
      speak: (l) => calls.push(`speak:${l.list}:${l.msgId}`),
      speakStop: () => calls.push('stop'),
    });
    h.speak?.({ list: 3, msgId: 7, text: 'x', npcObjId: 1, headFid: 2 });
    h.end();
    expect(calls).toEqual(['speak:3:7', 'stop']);
  });

  it('bez opcji speak hook nie istnieje (VM pomija mowe)', () => {
    expect(createViewDialogHooks(createGameView()).speak).toBeUndefined();
  });

  it('messageAudio: pole audio wpisu MSG, undefined gdy puste/brak', () => {
    const map = emptyMap();
    const world = {
      map,
      player: fake(1, 100, 0, { kind: 'critter', flags: 0, raw: new Int32Array(0) }),
      clock: new GameClock(),
      movement: new MovementSystem(map),
      loader: {} as World['loader'],
      view: createGameView(),
    } as World;
    const rt = new ScriptRuntime(
      world,
      {} as MessageSource,
      new GameVars(new Int32Array(10)),
      createViewDialogHooks(world.view!),
      { vfs: {} as never },
    );
    const lists = (rt as unknown as { msgLists: Map<number, Map<number, unknown>> }).msgLists;
    lists.set(
      5,
      new Map([
        [100, { id: 100, audio: 'KLINT01', text: 'a' }],
        [101, { id: 101, audio: '', text: 'b' }],
      ]),
    );
    expect(rt.messageAudio(5, 100)).toBe('KLINT01');
    expect(rt.messageAudio(5, 101)).toBeUndefined();
    expect(rt.messageAudio(5, 999)).toBeUndefined();
    expect(rt.messageAudio(6, 100)).toBeUndefined();
  });
});

describe('createViewDialogHooks: barter', () => {
  it('przekazuje hook gdialog_barter (npc, mod); brak opcji = brak hooka', () => {
    const calls: [number, number][] = [];
    const h = createViewDialogHooks(createGameView(), { barter: (n, m) => calls.push([n, m]) });
    h.barter!(7, -25);
    expect(calls).toEqual([[7, -25]]);
    expect(createViewDialogHooks(createGameView()).barter).toBeUndefined();
  });
});
