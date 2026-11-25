import { describe, expect, it } from 'vitest';
import {
  Interpreter,
  ScriptInstance,
  VmError,
  movieHandlers,
  MOVIE_FILES,
  type Hooks,
  type MovieHooks,
  type MovieOutcome,
} from '../index.js';
import { RET, buildInt, type Item } from './fixtures/build-int.js';

const P = (n: number): Item => ({ push: n });
const PLAY = 0x8115;
const SETGV = 0x80c6;

function mk(play: MovieHooks['play'] | undefined) {
  const globals: number[] = [];
  const seen: number[] = [];
  const hooks = {
    getLocalVar: () => 0,
    setLocalVar: () => {},
    getMapVar: () => 0,
    setMapVar: () => {},
    getGlobalVar: (i: number) => globals[i] ?? 0,
    setGlobalVar: (i: number, v: number) => void (globals[i] = v),
    opcodeHandlers: new Map([
      ...movieHandlers,
      [
        SETGV,
        (c: { stack: { popInt(): number } }) => {
          const v = c.stack.popInt();
          const i = c.stack.popInt();
          globals[i] = v;
        },
      ],
    ]),
    ...(play ? { movie: { play, markSeen: (n: number) => void seen.push(n) } } : {}),
  } as unknown as Hooks;
  return { hooks, globals, seen, interp: new Interpreter(hooks) };
}

/** main: play_gmovie(arg); set_global_var(0, 1) */
const prog = (arg: Item) =>
  buildInt('m', [{ name: 'main', code: [arg, PLAY, P(0), P(1), SETGV, P(0), ...RET] }]);

describe('play_gmovie (0x8115)', () => {
  it('tabela 17 plikow z exe 0x518da0', () => {
    expect(MOVIE_FILES).toHaveLength(17);
    expect(MOVIE_FILES[0]).toBe('iplogo.mve');
    expect(MOVIE_FILES[11]).toBe('derrick.mve');
    expect(MOVIE_FILES[16]).toBe('credits.mve');
  });

  it('wola hook z nazwa pliku z tabeli i oznacza film jako obejrzany', () => {
    const calls: Array<[string, number]> = [];
    const t = mk((name, n) => {
      calls.push([name, n]);
      return 'played';
    });
    const inst = new ScriptInstance(prog(P(11)), 0);
    t.interp.run(inst, 'main');
    expect(calls).toEqual([['derrick.mve', 11]]);
    expect(t.seen).toEqual([11]);
    expect(t.globals[0]).toBe(1);
  });

  it('blokuje skrypt do zakonczenia filmu (Promise)', async () => {
    let done!: (o: MovieOutcome) => void;
    const t = mk(() => new Promise<MovieOutcome>((r) => (done = r)));
    const inst = new ScriptInstance(prog(P(1)), 0);
    t.interp.run(inst, 'main');
    expect(inst.state).toBe('suspended');
    expect(t.globals[0]).toBeUndefined();
    done('skipped');
    await new Promise((r) => setTimeout(r, 0));
    expect(t.globals[0]).toBe(1);
    expect(t.seen).toEqual([1]);
    expect(inst.suspendReason).toBeUndefined();
  });

  it('brak pliku (missing): bez flagi obejrzano, skrypt idzie dalej', () => {
    const t = mk(() => 'missing');
    t.interp.run(new ScriptInstance(prog(P(5)), 0), 'main');
    expect(t.seen).toEqual([]);
    expect(t.globals[0]).toBe(1);
  });

  it('numer poza tabela: hook nie wolany, skrypt idzie dalej', () => {
    let called = false;
    const t = mk(() => ((called = true), 'played'));
    t.interp.run(new ScriptInstance(prog(P(99)), 0), 'main');
    expect(called).toBe(false);
    expect(t.seen).toEqual([]);
    expect(t.globals[0]).toBe(1);
  });

  it('argument nie-int: blad skryptu (0x506c00)', () => {
    const t = mk(() => 'played');
    const inst = new ScriptInstance(prog({ pushs: 'x' }), 0);
    expect(() => t.interp.run(inst, 'main')).toThrow(VmError);
  });

  it('bez hooka movie: opkod bez skutku', () => {
    const t = mk(undefined);
    t.interp.run(new ScriptInstance(prog(P(3)), 0), 'main');
    expect(t.globals[0]).toBe(1);
  });

  it('odrzucony Promise hooka = error: skrypt idzie dalej, bez flagi', async () => {
    const t = mk(() => Promise.reject(new Error('boom')));
    const inst = new ScriptInstance(prog(P(2)), 0);
    t.interp.run(inst, 'main');
    await new Promise((r) => setTimeout(r, 0));
    expect(t.seen).toEqual([]);
    expect(t.globals[0]).toBe(1);
  });
});
