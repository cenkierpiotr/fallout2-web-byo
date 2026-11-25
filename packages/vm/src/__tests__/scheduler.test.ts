import { describe, expect, it } from 'vitest';
import { Interpreter, Scheduler, contextOpHandlers, type Hooks } from '../index.js';
import { RET, buildInt, type Item } from './fixtures/build-int.js';

const P = (n: number): Item => ({ push: n });
const OP_SOURCE = 0x80bd;
const OP_TARGET = 0x80be;
const OP_FIXED = 0x80ff; // numer testowy (fixed_param jest nieidentyfikowany w tabeli)
const OP_SETGV = 0x80c6; // set_global_var: [idx, val]

function mk(opts: { critterInterval?: number; owners?: Record<number, number> } = {}) {
  const globals: number[] = [];
  const nowRef = { ms: 0 };
  const ref: { s?: Scheduler } = {};
  const hooks: Hooks & { objType(id: number): number } = {
    getLocalVar: () => 0,
    setLocalVar: () => {},
    getMapVar: () => 0,
    setMapVar: () => {},
    getGlobalVar: (i) => globals[i] ?? 0,
    setGlobalVar: (i, v) => void (globals[i] = v),
    nowMs: () => nowRef.ms,
    objType: (id) => opts.owners?.[id] ?? 1,
    opcodeHandlers: new Map([
      ...contextOpHandlers({ entryOf: (i: never) => ref.s!.entryOf(i) } as Scheduler, {
        sourceObj: OP_SOURCE,
        targetObj: OP_TARGET,
        fixedParam: OP_FIXED,
      }),
    ]),
  };
  const interp = new Interpreter(hooks);
  const sched = new Scheduler(interp, hooks, { critterInterval: opts.critterInterval ?? 30 });
  ref.s = sched;
  return { sched, globals, nowRef };
}

/** procedura zapisuje wynik do globalu `g` */
const setG = (g: number, expr: Item[]): Item[] => [P(g), ...expr, OP_SETGV, P(0), ...RET];

describe('Scheduler', () => {
  it('test_scheduler_runProc_missing_proc_is_noop', () => {
    const { sched } = mk();
    const script = buildInt('a', [{ name: 'start', code: [P(1), ...RET] }]);
    sched.create({ sid: 1, script });
    expect(sched.runProc(1, 'talk_p_proc')).toBeUndefined();
    expect(sched.runProc(99, 'start')).toBeUndefined();
    expect(sched.errors).toEqual([]);
  });

  it('test_scheduler_runStartAll_runs_start_in_every_instance_once', () => {
    const { sched, globals } = mk();
    const mkScript = (g: number) =>
      buildInt('s' + g, [
        // global[g] += 1
        { name: 'start', code: [P(g), P(g), 0x80c5, P(1), 0x8039, OP_SETGV, P(0), ...RET] },
      ]);
    sched.create({ sid: 1, script: mkScript(0) });
    sched.create({ sid: 2, script: mkScript(1) });
    sched.runStartAll();
    sched.runStartAll();
    expect(sched.errors).toEqual([]);
    expect(globals[0]).toBe(1);
    expect(globals[1]).toBe(1);
  });

  it('test_scheduler_jumpTo_fires_due_timers_absolute_time_no_critter_loop', () => {
    const { sched, globals } = mk({ critterInterval: 1 });
    const script = buildInt('t', [
      { name: 'timed_event_p_proc', code: setG(0, [OP_FIXED]) },
      { name: 'critter_p_proc', code: [P(1), P(1), 0x80c5, P(1), 0x8039, OP_SETGV, P(0), ...RET] },
    ]);
    sched.create({ sid: 5, script, ownerObjectId: 3 });
    sched.setNow(1000);
    sched.addTimerEvent(5, 500, 4);
    sched.jumpTo(1400);
    expect(globals[0]).toBeUndefined();
    sched.jumpTo(5_000_000);
    expect(sched.errors).toEqual([]);
    expect(globals[0]).toBe(4);
    expect(globals[1]).toBeUndefined();
    expect(sched.now).toBe(5_000_000);
  });

  it('test_scheduler_timer_fires_timed_event_with_fixedParam', () => {
    const { sched, globals } = mk();
    const script = buildInt('t', [{ name: 'timed_event_p_proc', code: setG(0, [OP_FIXED]) }]);
    sched.create({ sid: 5, script, ownerObjectId: 3 });
    sched.addTimerEvent(5, 10, 7);
    sched.tick(9);
    expect(globals[0]).toBeUndefined();
    sched.tick(1);
    expect(sched.errors).toEqual([]);
    expect(globals[0]).toBe(7);
    sched.tick(100);
    expect(globals[0]).toBe(7);
    expect(sched.timers.size).toBe(0);
  });

  it('test_scheduler_timer_remove', () => {
    const { sched, globals } = mk();
    const script = buildInt('t', [{ name: 'timed_event_p_proc', code: setG(0, [P(1)]) }]);
    sched.create({ sid: 5, script });
    sched.addTimerEvent(5, 5, 0);
    sched.rmTimerEvent(5);
    sched.tick(10);
    expect(globals[0]).toBeUndefined();
  });

  it('test_scheduler_critter_p_proc_interval_from_spec', () => {
    const { sched, globals } = mk({ critterInterval: 30, owners: { 10: 1, 11: 0 } });
    const mkS = (g: number) =>
      buildInt('c' + g, [
        {
          name: 'critter_p_proc',
          code: [P(g), P(g), 0x80c5, P(1), 0x8039, OP_SETGV, P(0), ...RET],
        },
      ]);
    sched.create({ sid: 1, script: mkS(0), ownerObjectId: 10 });
    sched.create({ sid: 2, script: mkS(1), ownerObjectId: 11 }); // nie critter
    sched.create({ sid: 3, script: mkS(2), ownerObjectId: -1 }); // skrypt mapy
    sched.tick(29);
    expect(globals[0]).toBeUndefined();
    sched.tick(1);
    expect(globals[0]).toBe(1);
    sched.tick(60);
    expect(globals[0]).toBe(3);
    expect(globals[1]).toBeUndefined();
    expect(globals[2]).toBeUndefined();
  });

  it('test_scheduler_runProc_sets_source_target_fixedParam', () => {
    const { sched, globals } = mk();
    const script = buildInt('u', [
      {
        name: 'use_p_proc',
        code: [
          P(0),
          OP_SOURCE,
          OP_SETGV,
          P(1),
          OP_TARGET,
          OP_SETGV,
          P(2),
          OP_FIXED,
          OP_SETGV,
          P(0),
          ...RET,
        ],
      },
    ]);
    sched.create({ sid: 1, script, ownerObjectId: 4 });
    sched.runProc(1, 'use_p_proc', { source: 11, target: 22, fixedParam: 33 });
    expect(sched.errors).toEqual([]);
    expect(globals.slice(0, 3)).toEqual([11, 22, 33]);
  });

  it('test_scheduler_vmError_in_one_script_does_not_stop_others', () => {
    const { sched, globals } = mk();
    const bad = buildInt('bad', [{ name: 'start', code: [0x8000 + 0x3ff, ...RET] }]);
    const good = buildInt('good', [{ name: 'start', code: setG(0, [P(5)]) }]);
    sched.create({ sid: 1, script: bad });
    sched.create({ sid: 2, script: good });
    sched.runStartAll();
    expect(sched.errors.length).toBe(1);
    expect(sched.errors[0]!.sid).toBe(1);
    expect(globals[0]).toBe(5);
    // instancja po bledzie jest znowu uzywalna
    expect(sched.get(1)!.instance.state).toBe('idle');
  });

  it('test_scheduler_call_start_child_clears_parent_flags_and_resumes_parent', () => {
    const { sched, globals } = mk();
    const child = buildInt('child', [{ name: 'start', code: setG(1, [P(9)]) }]);
    const parent = buildInt('parent', [
      {
        name: 'start',
        // call_start("child"); po powrocie global[2] = 1
        code: [{ pushs: 'child' }, 0x8008, ...setG(2, [P(1)])],
      },
    ]);
    let nextSid = 100;
    const hooks = sched.hooks as Hooks;
    hooks.execScript = () => sched.adopt({ sid: nextSid++, script: child }).instance;
    sched.create({ sid: 1, script: parent });
    sched.runProc(1, 'start');
    const pe = sched.get(1)!;
    expect(pe.instance.state).toBe('suspended');
    expect(pe.instance.flags & 0x20).toBe(0x20);
    sched.tick(1);
    expect(sched.errors).toEqual([]);
    expect(globals[1]).toBe(9);
    expect(pe.instance.flags & (0x20 | 0x100)).toBe(0);
    expect(pe.instance.child).toBeUndefined();
    expect(globals[2]).toBe(1);
  });

  it('test_scheduler_runStartAll_initializes_all_preambles_before_start', () => {
    const ext = new Map<string, ReturnType<typeof Object>>();
    const globals: number[] = [];
    const hooks: Hooks & { objType(id: number): number } = {
      getLocalVar: () => 0,
      setLocalVar: () => {},
      getMapVar: () => 0,
      setMapVar: () => {},
      getGlobalVar: (i) => globals[i] ?? 0,
      setGlobalVar: (i, v) => void (globals[i] = v),
      exportVar: (name) => void ext.set(name.toLowerCase(), { t: 'int', v: 0 }),
      getExternal: (name) => ext.get(name.toLowerCase()) as never,
      setExternal: (name, v) => void ext.set(name.toLowerCase(), v),
      nowMs: () => 0,
      objType: () => 1,
    };
    const sched = new Scheduler(new Interpreter(hooks), hooks);
    // skrypt A zarejestrowany PRZED skryptem B zapisuje w start zmienna eksportowana w preambule B
    const scriptA = buildInt('script_a', [
      { name: 'start', code: [P(42), { pushs: 'late_box' }, 0x8015, P(0), ...RET] },
    ]);
    const scriptB = buildInt(
      'script_b',
      [{ name: 'start', code: [P(0), ...RET] }],
      { init: [{ pushs: 'late_box' }, 0x8016] },
    );
    sched.create({ sid: 1, script: scriptA });
    sched.create({ sid: 2, script: scriptB });
    sched.runStartAll();
    expect(sched.errors).toEqual([]);
    expect(ext.get('late_box')).toEqual({ t: 'int', v: 42 });
  });
});
