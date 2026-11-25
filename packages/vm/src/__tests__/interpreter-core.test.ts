import { describe, expect, it } from 'vitest';
import {
  Interpreter,
  ScriptInstance,
  VmError,
  type Hooks,
  type OpHandler,
  type Value,
} from '../index.js';
import { RET, buildInt, type Item, type ProcSpec } from './fixtures/build-int.js';

const P = (n: number): Item => ({ push: n });

function hooks(over: Partial<Hooks> = {}): Hooks {
  const store = {
    local: new Map<number, number>(),
    map: new Map<number, number>(),
    global: new Map<number, number>(),
  };
  return {
    getLocalVar: (_i, k) => store.local.get(k) ?? 0,
    setLocalVar: (_i, k, v) => void store.local.set(k, v),
    getMapVar: (_i, k) => store.map.get(k) ?? 0,
    setMapVar: (_i, k, v) => void store.map.set(k, v),
    getGlobalVar: (k) => store.global.get(k) ?? 0,
    setGlobalVar: (k, v) => void store.global.set(k, v),
    ...over,
  };
}

function exec(
  code: Item[],
  more: ProcSpec[] = [],
  h: Hooks = hooks(),
  opts = {},
  args: Value[] = [],
) {
  const script = buildInt('t', [{ name: 'main', argc: args.length, code }, ...more]);
  const interp = new Interpreter(h, opts);
  const inst = new ScriptInstance(script);
  return { script, interp, inst, result: () => interp.run(inst, 'main', args) };
}

const i = (v: number): Value => ({ t: 'int', v });

describe('interpreter core', () => {
  it('test_push_int_add_return', () => {
    expect(exec([P(2), P(3), 0x8039, ...RET]).result()).toEqual(i(5));
  });

  it('test_comparison_int_float_string_per_spec', () => {
    const cases: [Item[], Item[], number, number][] = [
      // [a, b, op, wynik]
      [[P(2)], [P(2)], 0x8033, 1],
      [[P(2)], [P(3)], 0x8034, 1],
      [[P(2)], [P(3)], 0x8037, 1],
      [[P(3)], [P(3)], 0x8035, 1],
      [[P(3)], [P(2)], 0x8038, 1],
      [[P(2)], [P(3)], 0x8036, 0],
      [[P(2)], [{ pushf: 2 }], 0x8033, 1], // mieszane int/float: numerycznie
      [[{ pushf: 1.5 }], [P(2)], 0x8037, 1],
      [[{ pushs: 'abc' }], [{ pushs: 'abc' }], 0x8033, 1],
      [[{ pushs: 'abc' }], [{ pushs: 'abd' }], 0x8037, 1],
      [[{ pushs: 'abc' }], [{ pushs: 'abd' }], 0x8034, 1],
      [[{ pushs: 'abc' }], [P(1)], 0x8033, 0], // str vs liczba: eq=false
      [[{ pushs: 'abc' }], [P(1)], 0x8034, 1],
    ];
    for (const [a, b, op, want] of cases) {
      expect(exec([...a, ...b, op, ...RET]).result(), `op 0x${op.toString(16)}`).toEqual(i(want));
    }
    expect(() => exec([{ pushs: 'a' }, P(1), 0x8037, ...RET]).result()).toThrow(VmError);
  });

  it('test_jump_if_while_loop_counts_to_10', () => {
    // i = 0; while (i < 10) i = i + 1; return i
    const code: Item[] = [
      P(0), // slot zmiennej lokalnej 0 (ramka)
      P(0),
      P(0),
      0x8031,
      { label: 'L' },
      { ref: 'END' },
      P(0),
      0x8032,
      P(10),
      0x8037,
      0x802f,
      P(0),
      0x8032,
      P(1),
      0x8039,
      P(0),
      0x8031,
      { ref: 'L' },
      0x8004,
      { label: 'END' },
      P(0),
      0x8032,
      ...RET,
    ];
    expect(exec(code).result()).toEqual(i(10));
  });

  it('test_call_proc_with_args_and_return', () => {
    const add: ProcSpec = {
      name: 'add',
      argc: 2,
      code: [P(0), 0x8032, P(1), 0x8032, 0x8039, ...RET],
    };
    const main: Item[] = [
      { ref: 'R' },
      0x800d,
      P(3),
      P(4),
      P(2),
      P(1),
      0x8005,
      { label: 'R' },
      P(10),
      0x803b,
      ...RET,
    ];
    // wynik: (3 + 4) * 10
    expect(exec(main, [add]).result()).toEqual(i(70));
  });

  it('test_run_passes_args_and_reads_proc_locals', () => {
    const r = exec([P(0), 0x8032, P(1), 0x8032, 0x803a, ...RET], [], hooks(), {}, [i(9), i(4)]);
    expect(r.result()).toEqual(i(5));
  });

  it('test_global_local_map_var_fetch_store', () => {
    const h = hooks();
    const code: Item[] = [
      P(3),
      P(11),
      0x80c2, // local[3] = 11
      P(4),
      P(22),
      0x80c4, // map[4] = 22
      P(5),
      P(33),
      0x80c6, // global[5] = 33
      P(3),
      0x80c1,
      P(4),
      0x80c3,
      0x8039,
      P(5),
      0x80c5,
      0x8039,
      ...RET,
    ];
    expect(exec(code, [], h).result()).toEqual(i(66));
    expect(h.getLocalVar(undefined as never, 3)).toBe(11);
    expect(h.getGlobalVar(5)).toBe(33);
  });

  it('test_script_level_vars_persist_across_runs', () => {
    const script = buildInt('t', [
      { name: 'set', code: [P(7), P(0), 0x8013, P(1), ...RET] },
      { name: 'get', code: [P(0), 0x8012, ...RET] },
    ]);
    const interp = new Interpreter(hooks());
    const inst = new ScriptInstance(script);
    interp.run(inst, 'set');
    expect(interp.run(inst, 'get')).toEqual(i(7));
  });

  it('test_string_concat_and_lookup', () => {
    const r = exec([{ pushs: 'foo' }, { pushs: 'barbaz' }, 0x8039, ...RET]).result();
    expect(r).toEqual({ t: 'str', v: 'foobarbaz' });
    expect(
      exec([{ pushs: 'x' }, { pushs: 'yy' }, { pushs: 'x' }, 0x8033, ...RET]).result(),
    ).toEqual(i(0));
    expect(exec([{ pushs: 'x' }, { pushs: 'yy' }, 0x801a, ...RET]).result()).toEqual({
      t: 'str',
      v: 'x',
    });
    expect(exec([{ pushs: 'n=' }, P(5), 0x8039, ...RET]).result()).toEqual({ t: 'str', v: 'n=5' });
  });

  it('test_arithmetic_int_float_and_logic', () => {
    expect(exec([P(7), P(2), 0x803c, ...RET]).result()).toEqual(i(3));
    expect(exec([P(-7), P(2), 0x803c, ...RET]).result()).toEqual(i(-3));
    expect(exec([P(7), P(3), 0x803d, ...RET]).result()).toEqual(i(1));
    expect(exec([P(7), { pushf: 2 }, 0x803c, ...RET]).result()).toEqual({ t: 'float', v: 3.5 });
    expect(exec([P(6), P(3), 0x8040, ...RET]).result()).toEqual(i(2));
    expect(exec([P(6), P(3), 0x8041, ...RET]).result()).toEqual(i(7));
    expect(exec([P(5), 0x8046, ...RET]).result()).toEqual(i(-5));
    expect(exec([P(0), 0x8045, ...RET]).result()).toEqual(i(1));
    expect(exec([P(2), P(0), 0x803e, ...RET]).result()).toEqual(i(0));
    expect(exec([P(2), P(0), 0x803f, ...RET]).result()).toEqual(i(1));
    expect(exec([{ pushf: 2.7 }, 0x8044, ...RET]).result()).toEqual(i(2));
    expect(exec([P(0x7fffffff), P(1), 0x8039, ...RET]).result()).toEqual(i(-0x80000000));
    expect(() => exec([P(1), P(0), 0x803c, ...RET]).result()).toThrow(/zero/);
  });

  it('test_maxSteps_throws_VmError_infinite_loop', () => {
    const r = exec([{ label: 'L' }, { ref: 'L' }, 0x8004], [], hooks(), { maxSteps: 1000 });
    expect(() => r.result()).toThrow(VmError);
    expect(() =>
      exec([{ label: 'L' }, { ref: 'L' }, 0x8004], [], hooks(), { maxSteps: 1000 }).result(),
    ).toThrow(/maxSteps/);
    // po bledzie instancja jest uzywalna ponownie
    expect(r.inst.state).toBe('idle');
  });

  it('test_unknown_core_opcode_throws_VmError_with_pc', () => {
    const r = exec([P(1), 0x8022, ...RET]);
    let err: unknown;
    try {
      r.result();
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(VmError);
    const e = err as VmError;
    expect(e.pc).toBe(r.script.bodies[0]! + 8); // push_frame (2) + push (6)
    expect(e.op).toBe(0x8022);
    expect(e.proc).toBe('main');
    expect(e.script).toBe('t');
  });

  it('test_stack_underflow_wrapped_in_VmError', () => {
    expect(() => exec([0x8039, ...RET]).result()).toThrow(VmError);
  });

  it('test_trace_sink_receives_every_step', () => {
    const steps: { pc: number; op: number; name?: string; depth: number }[] = [];
    const calls: string[] = [];
    const r = exec([P(2), P(3), 0x8039, ...RET], [], hooks(), {
      trace: {
        step: (e) =>
          steps.push({
            pc: e.pc,
            op: e.op,
            ...(e.name ? { name: e.name } : {}),
            depth: e.stackDepth,
          }),
        call: (e) => calls.push(e.proc),
      },
    });
    r.result();
    // preambula i blok inicjalizacji tez sa sledzone; porownujemy tylko kroki ciala main
    const body = steps.filter((s) => s.pc >= r.script.bodies[0]!);
    // push_frame + 3 instrukcje + 6 opkodow powrotu
    expect(body).toHaveLength(10);
    expect(body[0]).toMatchObject({ pc: r.script.bodies[0], op: 0x802b, depth: 9 });
    expect(body[3]).toMatchObject({ name: 'add', depth: 10 });
    expect(body[9]!.op).toBe(0x801c);
    expect(steps[0]).toMatchObject({ pc: 0, op: 0x8002 });
    expect(calls).toEqual(['main']);
  });

  it('test_critical_section_flags', () => {
    const seen: boolean[] = [];
    const probe: OpHandler = (c) => void seen.push(c.instance.critical);
    const h = hooks({ opcodeHandlers: new Map([[0x80ff, probe]]) });
    const r = exec(
      [0x80ff, 0x8002, 0x80ff, 0x8003, 0x80ff, 0x804a, 0x80ff, 0x804b, 0x80ff, P(0), ...RET],
      [],
      h,
    );
    r.result();
    expect(seen).toEqual([false, true, false, true, false]);
    expect(r.inst.critical).toBe(false);
  });

  it('test_suspend_and_resume', () => {
    const r = exec([P(1), 0x8011, P(2), 0x8039, ...RET]);
    expect(r.result()).toBeUndefined();
    expect(r.inst.state).toBe('suspended');
    expect(() => r.interp.run(r.inst, 'main')).toThrow(VmError);
    expect(r.interp.resume(r.inst)).toEqual(i(3));
    expect(r.inst.state).toBe('idle');
  });

  it('test_halt_exit_ends_script', () => {
    const r = exec([0x8010, P(2), ...RET]);
    expect(r.result()).toBeUndefined();
    expect(r.inst.state).toBe('halted');
  });

  it('test_call_unknown_proc_and_bodyless_proc_throw', () => {
    expect(() => exec([P(0), P(9), 0x8005, ...RET]).result()).toThrow(/nieistniejacej/);
  });

  it('test_dup_swap_pop_float_const', () => {
    expect(exec([P(5), 0x801b, 0x8039, ...RET]).result()).toEqual(i(10));
    expect(exec([P(5), P(2), 0x8018, 0x803a, ...RET]).result()).toEqual(i(-3));
    expect(exec([{ pushf: 0.5 }, ...RET]).result()).toEqual({ t: 'float', v: 0.5 });
  });

  it('test_externals_via_hooks', () => {
    const ext = new Map<string, Value>();
    const h = hooks({
      exportVar: (n) => void ext.set(n, i(0)),
      setExternal: (n, v) => void ext.set(n, v),
      getExternal: (n) => ext.get(n),
    });
    const r = exec(
      [
        { pushs: 'x' },
        0x8016,
        P(41),
        { pushs: 'x' },
        0x8015,
        { pushs: 'x' },
        0x8014,
        P(1),
        0x8039,
        ...RET,
      ],
      [],
      h,
    );
    expect(r.result()).toEqual(i(42));
  });

  it('test_external_name_as_int_offset_like_original', () => {
    // oryginal (0x46bf90) nie sprawdza typu nazwy: c001 <offset> dziala jak 0x9001 <offset> (scbrahmn, scslvgrd)
    const ext = new Map<string, Value>([['x', i(7)]]);
    const h = hooks({ getExternal: (n) => ext.get(n) });
    const off = 6; // fixture: pierwszy string tablicy ma offset 6 (jak w push_const 0x9001)
    expect(exec([{ pushs: 'x' }, 0x8014, P(off), 0x8014, 0x8039, ...RET], [], h).result()).toEqual(
      i(14),
    );
  });

  it('test_fetch_external_missing_is_VmError', () => {
    const h = hooks({ getExternal: () => undefined });
    expect(() => exec([{ pushs: 'nie' }, 0x8014, ...RET], [], h).result()).toThrow(VmError);
  });

  it('test_external_ident_and_string_same_offset_collision', () => {
    // id 'main\0' (len 5) zajmuje 7 B => 'box_var' ma offset 13 (!procNameOffs)
    // str 'aaaa\0' (len 5) zajmuje 7 B => 'not_box' rowniez ma offset 13 w tablicy stringow
    const ext = new Map<string, Value>();
    const h = hooks({
      exportVar: (n) => void ext.set(n, i(0)),
      setExternal: (n, v) => void ext.set(n, v),
      getExternal: (n) => ext.get(n),
    });
    const script = buildInt(
      'col',
      [
        {
          name: 'main',
          code: [
            { pushs: 'aaaa' },
            0x801b, // pop (nieuzyty string przesuwajacy offset 'not_box' na 13)
            { pushs: 'not_box' },
            0x8016, // export_var: offset 13 => 'box_var' (nie 'not_box')
            P(99),
            { pushs: 'not_box' },
            0x8015, // store_external: offset 13 => 'box_var'
            { pushs: 'not_box' }, // jako zwykly string => 'not_box'
            ...RET,
          ],
        },
      ],
      { idents: ['box_var'] },
    );
    const interp = new Interpreter(h);
    const inst = new ScriptInstance(script);
    expect(interp.run(inst, 'main')).toEqual({ t: 'str', v: 'not_box' });
    expect(ext.get('box_var')).toEqual(i(99));
    expect(ext.has('not_box')).toBe(false);
  });
});
