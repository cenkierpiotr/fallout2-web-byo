import { describe, expect, it } from 'vitest';
import { Interpreter, ScriptInstance, VmError, type Hooks, type Value } from '../index.js';
import { RET, buildInt, type Item, type ProcSpec } from './fixtures/build-int.js';

const P = (n: number): Item => ({ push: n });
const S = (s: string): Item => ({ pushs: s });
const i = (v: number): Value => ({ t: 'int', v });

interface Env {
  clock: number;
  exits: number;
  exported: string[];
  launched: { mode: string; name: string }[];
  child?: ScriptInstance;
}

function setup(
  main: Item[],
  opts: { frame?: boolean; more?: ProcSpec[]; hooks?: Partial<Hooks> } = {},
) {
  const env: Env = { clock: 0, exits: 0, exported: [], launched: [] };
  const other: ProcSpec = { name: 'other', argc: 2, code: [P(42), ...RET] };
  const third: ProcSpec = { name: 'third', code: [P(43), ...RET] };
  const script = buildInt('t', [
    { name: 'main', ...(opts.frame === false ? { frame: false } : {}), code: main },
    other,
    third,
    ...(opts.more ?? []),
  ]);
  const hooks: Hooks = {
    getLocalVar: () => 0,
    setLocalVar: () => {},
    getMapVar: () => 0,
    setMapVar: () => {},
    getGlobalVar: () => 0,
    setGlobalVar: () => {},
    nowMs: () => env.clock,
    onExit: () => void env.exits++,
    exportProcedure: (_i, name) => void env.exported.push(name),
    execScript: (req) => {
      env.launched.push({ mode: req.mode, name: req.name });
      env.child = new ScriptInstance(script);
      return env.child;
    },
    ...opts.hooks,
  };
  const interp = new Interpreter(hooks);
  const inst = new ScriptInstance(script);
  return { env, script, interp, inst, run: () => interp.run(inst, 'main') };
}

describe('ramki i zmienne (R9 z28b)', () => {
  it('test_preamble_creates_script_vars_on_stack', () => {
    const t = setup([P(0), 0x8012, ...RET]);
    t.run();
    expect(t.inst.initialized).toBe(true);
    expect(t.inst.base18).toBe(0);
    expect(t.inst.stack.depth()).toBe(8);
  });

  it('test_fetch_store_global_use_script_base_and_local_use_frame_base', () => {
    const t = setup([P(3), P(1), 0x8013, P(1), 0x8012, ...RET]);
    expect(t.run()).toEqual(i(3));
    const u = setup([P(9), P(4), P(0), 0x8031, P(0), 0x8032, ...RET]);
    expect(u.run()).toEqual(i(4));
  });

  it('test_fetch_global_out_of_stack_is_VmError', () => {
    expect(() => setup([P(100), 0x8012, ...RET]).run()).toThrow(/poza stosem/);
    expect(() => setup([P(1), P(100), 0x8013, P(0), ...RET]).run()).toThrow(VmError);
  });

  it('test_set_ret_base_moves_script_base', () => {
    expect(setup([0x802c, P(55), P(0), 0x8012, ...RET]).run()).toEqual(i(55));
  });

  it('test_ret_stack_op_swaps_top_two', () => {
    const t = setup([P(1), 0x800d, P(2), 0x800d, 0x8019, 0x800c, 0x800c, 0x801c], { frame: false });
    expect(t.run()).toEqual(i(2));
  });

  it('test_pop_frame_drops_stack_down_to_base14', () => {
    expect(setup([P(1), P(2), 0x802a, P(8), ...RET]).run()).toEqual(i(8));
  });

  it('test_call_keeps_args_on_stack_and_callee_gets_frame', () => {
    const main: Item[] = [
      { ref: 'R' },
      0x800d,
      P(3),
      P(4),
      P(2),
      P(1),
      0x8005,
      { label: 'R' },
      ...RET,
    ];
    const t = setup(main, { more: [] });
    // procedura 'other' ignoruje argumenty i zwraca 42
    expect(t.run()).toEqual(i(42));
    expect(t.inst.stack.depth()).toBe(8);
  });

  it('test_pop_n_pops_n_entries', () => {
    expect(setup([P(1), P(2), P(3), P(2), 0x802e, ...RET]).run()).toEqual(i(1));
    expect(() => setup([P(-1), 0x802e, ...RET]).run()).toThrow(/ujemne/);
  });

  it('test_jmp_if_false_w_jumps_only_when_false_and_leaks_address_when_true', () => {
    const f: Item[] = [{ ref: 'L' }, P(0), 0x8030, P(1), ...RET, { label: 'L' }, P(2), ...RET];
    expect(setup(f).run()).toEqual(i(2));
    const tr: Item[] = [{ ref: 'L' }, P(1), 0x8030, P(5), ...RET, { label: 'L' }, P(2), ...RET];
    const t = setup(tr);
    expect(t.run()).toEqual(i(5));
    // adres zostal na stosie pod wynikiem i zostal zdjety dopiero przez pop_frame
    expect(t.inst.stack.depth()).toBe(8);
  });
});

describe('procedury: nazwy, eksport, argc, adres', () => {
  it('test_proc_address_and_tag_check', () => {
    const t = setup([P(1), 0x802d, ...RET]);
    expect(t.run()).toEqual(i(t.script.bodies[1]!));
    expect(() => setup([{ pushf: 1 }, 0x802d, ...RET]).run()).toThrow(/nie jest int/);
    expect(() => setup([P(99), 0x802d, ...RET]).run()).toThrow(/nieistniejaca/);
  });

  it('test_check_argc_mismatch_names_procedure', () => {
    expect(setup([P(1), P(2), 0x8027, P(0), ...RET]).run()).toEqual(i(0));
    expect(() => setup([P(1), P(3), 0x8027, P(0), ...RET]).run()).toThrow(/other.*argc=2/);
  });

  it('test_lookup_proc_by_name_case_insensitive_and_bounds', () => {
    expect(setup([S('OTHER'), 0x8028, ...RET]).run()).toEqual(i(1));
    // petla i=1..count-2: pierwsza (0) i ostatnia procedura nigdy nie pasuja (osobliwosc oryginalu wg spec)
    expect(() => setup([S('third'), 0x8028, ...RET]).run()).toThrow(/brak procedury/);
    expect(() => setup([S('nope'), 0x8028, ...RET]).run()).toThrow(/brak procedury/);
  });

  it('test_export_procedure_registers_and_rejects_duplicates', () => {
    const t = setup([P(2), P(1), 0x8017, P(0), ...RET]);
    t.run();
    expect(t.inst.exports.get('other')).toEqual({ index: 1, argc: 2 });
    expect(t.env.exported).toEqual(['other']);
    expect(() => t.run()).toThrow(/juz wyeksportowana/);
  });
});

describe('czas i planowanie', () => {
  it('test_call_at_time_call_if_cancel', () => {
    const t = setup([P(3), P(1), 0x8006, P(9), P(2), 0x8007, P(0), ...RET]);
    t.env.clock = 1000;
    t.run();
    expect(t.inst.procRuntime[1]).toEqual({ flags: 1, time: 4000, cond: 0 });
    expect(t.inst.procRuntime[2]).toEqual({ flags: 2, time: 0, cond: 9 });
    const c = setup([P(3), P(1), 0x8006, P(1), 0x8048, P(0), ...RET]);
    c.run();
    expect(c.inst.procRuntime[1]).toEqual({ flags: 0, time: 0, cond: 0 });
    const all = setup([P(3), P(1), 0x8006, P(9), P(2), 0x8007, 0x8049, P(0), ...RET]);
    all.run();
    expect(all.inst.procRuntime.every((r) => r.flags === 0 && r.time === 0 && r.cond === 0)).toBe(
      true,
    );
    expect(() => setup([P(99), 0x8048, P(0), ...RET]).run()).toThrow(/nieistniejaca/);
  });

  it('test_wait_suspends_until_clock_passes', () => {
    const t = setup([P(500), 0x8047, P(7), ...RET]);
    expect(t.run()).toBeUndefined();
    expect(t.inst.state).toBe('suspended');
    t.env.clock = 499;
    expect(t.interp.resume(t.inst)).toBeUndefined();
    expect(t.inst.state).toBe('suspended');
    t.env.clock = 500;
    expect(t.interp.resume(t.inst)).toEqual(i(7));
    expect(t.inst.state).toBe('idle');
  });
});

describe('potomkowie i wyjscie', () => {
  it('test_call_start_waits_for_child_until_flag_cleared', () => {
    const t = setup([S('kid'), 0x8008, P(1), ...RET]);
    expect(t.run()).toBeUndefined();
    expect(t.env.launched).toEqual([{ mode: 'call_start', name: 'kid' }]);
    expect(t.inst.flags & 0x20).toBe(0x20);
    expect(t.inst.child).toBe(t.env.child);
    expect(t.env.child!.parent).toBe(t.inst);
    expect(t.interp.resume(t.inst)).toBeUndefined();
    t.inst.flags &= ~0x20;
    expect(t.interp.resume(t.inst)).toEqual(i(1));
  });

  it('test_call_start_with_existing_child_is_error', () => {
    const t = setup([S('kid'), 0x8008, S('kid'), 0x8008, ...RET]);
    t.run();
    t.inst.flags = 0;
    expect(() => t.interp.resume(t.inst)).toThrow(/potomka/);
  });

  it('test_spawn_sets_0x100_and_inherits_critical', () => {
    const t = setup([0x8002, S('kid'), 0x800a, P(1), ...RET]);
    t.run();
    expect(t.inst.flags & 0x100).toBe(0x100);
    expect(t.env.child!.critical).toBe(true);
    t.inst.flags &= ~0x100;
    expect(t.interp.resume(t.inst)).toEqual(i(1));
  });

  it('test_fork_is_independent_and_does_not_wait', () => {
    const t = setup([S('kid'), 0x800b, P(1), ...RET]);
    expect(t.run()).toEqual(i(1));
    expect(t.env.launched).toEqual([{ mode: 'fork', name: 'kid' }]);
    expect(t.env.child!.parent).toBeUndefined();
    expect(t.inst.child).toBeUndefined();
  });

  it('test_exec_replaces_current_program', () => {
    const parent = setup([P(0), ...RET]);
    const t = setup([S('next'), 0x8009, P(1), ...RET]);
    t.inst.parent = parent.inst;
    parent.inst.child = t.inst;
    parent.inst.flags = 0x100;
    expect(t.run()).toBeUndefined();
    expect(t.inst.state).toBe('halted');
    expect(t.inst.flags & 1).toBe(1);
    expect(t.inst.parent).toBeUndefined();
    expect(t.env.child!.parent).toBe(parent.inst);
    expect(parent.inst.child).toBe(t.env.child);
    expect(parent.inst.flags & 0x100).toBe(0);
  });

  it('test_exit_sets_flag_notifies_once_and_halts', () => {
    const parent = setup([P(0), ...RET]);
    const t = setup([0x800e, P(1), ...RET]);
    t.inst.parent = parent.inst;
    parent.inst.flags = 0x100 | 0x20;
    expect(t.run()).toBeUndefined();
    expect(t.inst.state).toBe('halted');
    expect(t.inst.flags & 1).toBe(1);
    expect(t.env.exits).toBe(1);
    expect(parent.inst.flags).toBe(0x20);
  });

  it('test_detach_clears_parent_wait_flags', () => {
    const parent = setup([P(0), ...RET]);
    const t = setup([0x800f, P(1), ...RET]);
    t.inst.parent = parent.inst;
    parent.inst.child = t.inst;
    parent.inst.flags = 0x20 | 0x100 | 0x40;
    expect(t.run()).toEqual(i(1));
    expect(parent.inst.flags).toBe(0x40);
    expect(parent.inst.child).toBeUndefined();
    // bez rodzica: brak efektu
    expect(setup([0x800f, P(2), ...RET]).run()).toEqual(i(2));
  });

  it('test_call_start_without_execScript_hook_is_clear_error', () => {
    const t = setup([S('kid'), 0x8008, ...RET], { hooks: { execScript: undefined } });
    expect(() => t.run()).toThrow(/execScript/);
  });
});

describe('powroty z kontekstem 0x801d-0x8026', () => {
  it('test_return_v1_sets_result_flag', () => {
    const t = setup([P(77), 0x801d], { frame: false });
    expect(t.run()).toEqual(i(77));
    expect(t.inst.flags & 0x40).toBe(0x40);
  });

  it('test_pop_ret_discards_one_entry', () => {
    expect(setup([P(5), 0x801e, 0x801c]).run()).toEqual(i(5));
  });

  it('test_restore_ctx_order_userdata_callback_flags', () => {
    const t = setup([P(2), P(5), P(6), 0x801f, P(0), 0x801c], { frame: false });
    t.run();
    expect(t.inst.userdata).toEqual(i(6));
    expect(t.inst.callback).toEqual(i(5));
    expect(t.inst.flags).toBe(2);
  });

  it('test_exit_v1_v2_restore_then_return', () => {
    const a = setup([P(2), P(5), P(6), 0x8020], { frame: false });
    a.run();
    expect(a.inst.flags).toBe(2);
    expect(a.inst.state).toBe('idle');
    const b = setup([P(2), P(5), P(6), 0x8021], { frame: false });
    b.run();
    expect(b.inst.flags).toBe(0x42);
  });

  it('test_exit_v6_returns_value_with_result_flag', () => {
    const t = setup([P(2), P(5), P(6), P(99), 0x8025], { frame: false });
    expect(t.run()).toEqual(i(99));
    expect(t.inst.flags).toBe(0x42);
  });

  it.each([0x8022, 0x8023, 0x8024, 0x8026])(
    'test_target_ctx_opcode_0x%s_throws_clear_VmError',
    (op) => {
      const t = setup([P(1), P(2), P(3), P(4), op], { frame: false });
      expect(() => t.run()).toThrow(/ctx docelowy nieznany/);
    },
  );
});
