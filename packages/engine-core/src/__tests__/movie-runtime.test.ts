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
import { ScriptInstance as VmInstance, type MovieOutcome } from '@f2/vm';
import { buildInt, RET } from '../../../vm/src/__tests__/fixtures/build-int.js';
import { emptyMap, fake } from './helpers.js';

function mk(movie?: (file: string, num: number) => MovieOutcome | Promise<MovieOutcome>) {
  const map = emptyMap();
  const player = fake(1, 100, 0, { kind: 'critter', flags: 0, raw: new Int32Array(0) });
  const world = {
    map,
    player,
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
    { vfs: {} as never, ...(movie ? { movie } : {}) },
  );
  return rt;
}

const prog = (n: number) =>
  buildInt('m', [{ name: 'main', code: [{ push: n }, 0x8115, { push: 0 }, ...RET] }]);

describe('play_gmovie w ScriptRuntime (0x8115)', () => {
  it('wola odtwarzacz z nazwa z tabeli i ustawia flage obejrzano', () => {
    const calls: string[] = [];
    const rt = mk((f, n) => (calls.push(`${f}:${n}`), 'played'));
    rt.interp.run(new VmInstance(prog(11), 0), 'main');
    expect(calls).toEqual(['derrick.mve:11']);
    expect(rt.movieFlags[11]).toBe(1);
    expect(rt.movieFlags[10]).toBe(0);
  });
  it('film przerwany/blad/brak pliku: tylko played i skipped daja flage', () => {
    const rt = mk(() => 'missing');
    rt.interp.run(new VmInstance(prog(12), 0), 'main');
    expect(rt.movieFlags[12]).toBe(0);
  });
  it('bez odtwarzacza: numer zapisany w extraB.movies, skrypt idzie dalej', () => {
    const rt = mk();
    rt.interp.run(new VmInstance(prog(16), 0), 'main');
    expect(rt.extraB.movies).toEqual([16]);
    expect(rt.movieFlags[16]).toBe(0);
  });
  it('Promise odtwarzacza zawiesza skrypt do konca filmu', async () => {
    let done!: (o: MovieOutcome) => void;
    const rt = mk(() => new Promise<MovieOutcome>((r) => (done = r)));
    const inst = new VmInstance(prog(1), 0);
    rt.interp.run(inst, 'main');
    expect(inst.state).toBe('suspended');
    done('played');
    await new Promise((r) => setTimeout(r, 0));
    expect(inst.state).toBe('idle');
    expect(rt.movieFlags[1]).toBe(1);
  });
});
