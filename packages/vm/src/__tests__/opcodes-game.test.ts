import { describe, expect, it, vi } from 'vitest';
import {
  Interpreter,
  ScriptInstance,
  gameHandlers,
  createGameHandlers,
  type GameHooks,
  type Value,
} from '../index.js';
import { RET, buildInt, type Item } from './fixtures/build-int.js';

const P = (n: number): Item => ({ push: n });
const S = (s: string): Item => ({ pushs: s });
const SETG = 0x80c6;

type Mock = { [K in keyof GameHooks]: ReturnType<typeof vi.fn> };

function mkHooks(over: Partial<Record<keyof GameHooks, unknown>> = {}) {
  const globals: number[] = [];
  const base: Record<string, unknown> = {
    getLocalVar: () => 0,
    setLocalVar: () => {},
    getMapVar: () => 0,
    setMapVar: () => {},
    getGlobalVar: (i: number) => globals[i] ?? 0,
    setGlobalVar: (i: number, v: number) => void (globals[i] = v),
    unsupported: vi.fn(() => ({ t: 'int', v: 0 }) as Value),
    opcodeHandlers: gameHandlers,
  };
  for (const k of [
    'dudeObj',
    'objName',
    'objType',
    'objPid',
    'objElevation',
    'objHex',
    'createObject',
    'destroyObject',
    'moveTo',
    'protoData',
    'getCritterStat',
    'setCritterStat',
    'critterAddTrait',
    'tileDistance',
    'tileInDirection',
    'tileContainsObjPid',
    'tileObjByPid',
    'gameTime',
    'gameTimeHour',
    'gameMonth',
    'gameDay',
    'hasTrait',
    'objArtFid',
    'random',
    'addTimerEvent',
    'rmTimerEvent',
    'animateStand',
    'animateMoveToHex',
    'displayMsg',
    'messageStr',
    'floatMsg',
    'playSfx',
    'setLightLevel',
    'gfade',
    'overrideMapStart',
    'metarule',
    'metarule3',
  ])
    base[k] = vi.fn(() => 0);
  const hooks = { ...base, ...over } as unknown as GameHooks & Mock;
  return { hooks, globals };
}

/** Uruchamia `start` z kodem `code`; wynik (z szczytu) zapisuje do globalu 0 gdy `store`. */
function run(code: Item[], over: Partial<Record<keyof GameHooks, unknown>> = {}, store = true) {
  const { hooks, globals } = mkHooks(over);
  const script = buildInt('t', [
    { name: 'start', code: store ? [P(0), ...code, SETG, P(0), ...RET] : [...code, P(0), ...RET] },
  ]);
  const inst = new ScriptInstance(script);
  new Interpreter(hooks).run(inst, 'start');
  return { hooks, g0: globals[0] };
}

describe('opkody gry batch 1', () => {
  it('test_op_tile_distance', () => {
    const { hooks, g0 } = run([P(18492), P(18692), 0x80d2], { tileDistance: vi.fn(() => 12) });
    expect(hooks.tileDistance).toHaveBeenCalledWith(18492, 18692);
    expect(g0).toBe(12);
  });
  it('test_op_tile_distance_objs_uses_obj_hexes', () => {
    const objHex = vi.fn((id: number) => (id === 1 ? 100 : 200));
    const { hooks, g0 } = run([P(1), P(2), 0x80d3], { objHex, tileDistance: vi.fn(() => 5) });
    expect(hooks.tileDistance).toHaveBeenCalledWith(100, 200);
    expect(g0).toBe(5);
  });
  it('test_op_tile_distance_objs_missing_obj_is_9999', () => {
    const { g0 } = run([P(1), P(-1), 0x80d3], { objHex: vi.fn(() => 5) });
    expect(g0).toBe(9999);
  });
  it('test_op_tile_num_returns_obj_hex', () => {
    expect(run([P(3), 0x80d4], { objHex: vi.fn(() => 777) }).g0).toBe(777);
  });
  it('test_op_tile_num_in_direction', () => {
    const { hooks, g0 } = run([P(20000), P(2), P(3), 0x80d5], {
      tileInDirection: vi.fn(() => 321),
    });
    expect(hooks.tileInDirection).toHaveBeenCalledWith(20000, 2, 3);
    expect(g0).toBe(321);
  });
  it('test_op_tile_num_in_direction_invalid_dir_logs_not_throws', () => {
    const { hooks, g0 } = run([P(20000), P(9), P(3), 0x80d5]);
    expect(hooks.tileInDirection).not.toHaveBeenCalled();
    expect(hooks.unsupported).toHaveBeenCalled();
    expect(g0).toBe(-1);
  });
  it('test_op_tile_num_in_direction_tile_minus1_or_n0_gives_minus1', () => {
    const r1 = run([P(-1), P(2), P(3), 0x80d5], { tileInDirection: vi.fn(() => 5) });
    expect(r1.hooks.tileInDirection).not.toHaveBeenCalled();
    expect(r1.g0).toBe(-1);
    const r2 = run([P(20000), P(2), P(0), 0x80d5], { tileInDirection: vi.fn(() => 5) });
    expect(r2.hooks.tileInDirection).not.toHaveBeenCalled();
    expect(r2.g0).toBe(-1);
  });
  it('test_op_tile_num_in_direction_negative_result_gives_minus1', () => {
    const { g0 } = run([P(20000), P(2), P(3), 0x80d5], { tileInDirection: vi.fn(() => -7) });
    expect(g0).toBe(-1);
  });
  it('test_op_has_trait_pops_trait_obj_kind', () => {
    const { hooks, g0 } = run([P(2), P(7), P(13), 0x80f3], { hasTrait: vi.fn(() => 1) });
    expect(hooks.hasTrait).toHaveBeenCalledWith(2, 7, 13);
    expect(g0).toBe(1);
  });
  it('test_op_obj_art_fid_and_month_day', () => {
    expect(run([P(7), 0x8149], { objArtFid: vi.fn(() => 0x1000010) }).g0).toBe(0x1000010);
    expect(run([0x8118], { gameMonth: vi.fn(() => 7) }).g0).toBe(7);
    expect(run([0x8119], { gameDay: vi.fn(() => 25) }).g0).toBe(25);
  });
  it('test_op_tile_contains_pid_obj', () => {
    const { hooks, g0 } = run([P(100), P(1), P(0x1000002), 0x80bb], {
      tileContainsObjPid: vi.fn(() => 55),
    });
    expect(hooks.tileContainsObjPid).toHaveBeenCalledWith(100, 1, 0x1000002);
    expect(g0).toBe(55);
  });
  it('test_op_tile_contains_pid_obj_returns_object', () => {
    const { hooks, g0 } = run([P(100), P(1), P(0x1000002), 0x80a7], {
      tileObjByPid: vi.fn(() => 77),
    });
    expect(hooks.tileObjByPid).toHaveBeenCalledWith(100, 1, 0x1000002);
    expect(g0).toBe(77);
  });
  it('test_op_sfall_pc_stats', () => {
    const base = {
      dudeObj: vi.fn(() => 9),
      setCritterStat: vi.fn(() => 0),
      getCritterStat: vi.fn(() => 6),
    };
    const r = run([P(2), P(8), 0x815a], base, false);
    expect(r.hooks.setCritterStat).toHaveBeenCalledWith(9, 2, 8);
    expect(run([P(2), 0x815c], base).g0).toBe(6);
    const un = { unsupported: vi.fn(() => ({ t: 'int', v: 4 }) as const) };
    run([P(1), P(3), 0x815b], un, false);
    expect(un.unsupported).toHaveBeenCalledWith('set_pc_extra_stat', [
      { t: 'int', v: 1 },
      { t: 'int', v: 3 },
    ]);
    expect(run([P(1), 0x815d], un).g0).toBe(4);
  });
  it('test_op_obj_pid_type_elevation_name', () => {
    expect(run([P(4), 0x8100], { objPid: vi.fn(() => 9) }).g0).toBe(9);
    expect(run([P(4), 0x80c8], { objType: vi.fn(() => 1) }).g0).toBe(1);
    expect(run([P(4), 0x80ec], { objElevation: vi.fn(() => 2) }).g0).toBe(2);
    const r = run([P(4), 0x80a4, 0x80b8], { objName: vi.fn(() => 'Bob') }, false);
    expect(r.hooks.displayMsg).toHaveBeenCalledWith('Bob');
  });
  it('test_op_dude_obj', () => {
    expect(run([0x80bf], { dudeObj: vi.fn(() => 16777216) }).g0).toBe(16777216);
  });
  it('test_op_create_and_destroy_object', () => {
    const r = run([P(0x1000005), P(20000), P(0), P(-1), 0x80b7], { createObject: vi.fn(() => 42) });
    expect(r.hooks.createObject).toHaveBeenCalledWith(0x1000005, 20000, 0, -1);
    expect(r.g0).toBe(42);
    const d = run([P(42), 0x80f4], {}, false);
    expect(d.hooks.destroyObject).toHaveBeenCalledWith(42);
  });
  it('test_op_move_to', () => {
    const { hooks } = run([P(5), P(20100), P(1), 0x80b6, 0x801a], {}, false);
    expect(hooks.moveTo).toHaveBeenCalledWith(5, 20100, 1);
  });
  it('test_op_critter_stats_and_traits', () => {
    const a = run([P(5), P(4), 0x80ca], { getCritterStat: vi.fn(() => 8) });
    expect(a.hooks.getCritterStat).toHaveBeenCalledWith(5, 4);
    expect(a.g0).toBe(8);
    const b = run([P(5), P(4), P(9), 0x80cb], { setCritterStat: vi.fn(() => 1) });
    expect(b.hooks.setCritterStat).toHaveBeenCalledWith(5, 4, 9);
    const t = run([P(5), P(1), P(2), P(3), 0x8102], { critterAddTrait: vi.fn(() => 1) });
    expect(t.hooks.critterAddTrait).toHaveBeenCalledWith(5, 1, 2, 3);
  });
  it('test_op_proto_data', () => {
    const r = run([P(0x1000001), P(24), 0x8104], { protoData: vi.fn(() => 6) });
    expect(r.hooks.protoData).toHaveBeenCalledWith(0x1000001, 24);
    expect(r.g0).toBe(6);
  });
  it('test_op_global_var_read', () => {
    const { hooks, g0 } = run([P(3), 0x80c5], { getGlobalVar: vi.fn(() => 77) });
    expect(hooks.getGlobalVar).toHaveBeenCalledWith(3);
    expect(g0).toBe(77);
  });
  it('test_op_random', () => {
    const r = run([P(1), P(6), 0x80b4], { random: vi.fn(() => 4) });
    expect(r.hooks.random).toHaveBeenCalledWith(1, 6);
    expect(r.g0).toBe(4);
  });
  it('test_op_game_time_hour_ticks', () => {
    expect(run([0x80ea], { gameTime: vi.fn(() => 1234) }).g0).toBe(1234);
    expect(run([0x80f6], { gameTimeHour: vi.fn(() => 1830) }).g0).toBe(1830);
    expect(run([P(3), 0x80f2]).g0).toBe(30);
  });
  it('test_op_add_timer_event', () => {
    const { hooks } = run([P(5), P(100), P(7), 0x80f0], {}, false);
    expect(hooks.addTimerEvent).toHaveBeenCalledWith(5, 100, 7);
  });
  it('test_op_add_timer_event_with_scheduler_uses_script_sid', () => {
    const { hooks } = mkHooks();
    const sched = {
      entryOf: () => ({ sid: 33 }),
    } as unknown as Parameters<typeof createGameHandlers>[0];
    hooks.opcodeHandlers = createGameHandlers(sched);
    const script = buildInt('t', [
      { name: 'start', code: [P(5), P(100), P(7), 0x80f0, P(5), 0x80f1, P(0), ...RET] },
    ]);
    new Interpreter(hooks).run(new ScriptInstance(script), 'start');
    expect(hooks.addTimerEvent).toHaveBeenCalledWith(33, 100, 7);
    expect(hooks.rmTimerEvent).toHaveBeenCalledWith(33);
  });
  it('test_op_rm_timer_event', () => {
    const { hooks } = run([P(5), 0x80f1], {}, false);
    expect(hooks.rmTimerEvent).toHaveBeenCalledWith(5);
  });
  it('test_op_animate_stand_and_move', () => {
    expect(run([P(5), 0x80cc], {}, false).hooks.animateStand).toHaveBeenCalledWith(5);
    const m = run([P(5), P(20100), P(0x10), 0x80ce], {}, false);
    expect(m.hooks.animateMoveToHex).toHaveBeenCalledWith(5, 20100, true);
    const w = run([P(5), P(20100), P(0), 0x80ce], {}, false);
    expect(w.hooks.animateMoveToHex).toHaveBeenCalledWith(5, 20100, false);
  });
  it('test_op_message_str', () => {
    const r = run([P(105), P(200), 0x8105, 0x80b8], { messageStr: vi.fn(() => 'Cześć') }, false);
    expect(r.hooks.messageStr).toHaveBeenCalledWith(105, 200);
    expect(r.hooks.displayMsg).toHaveBeenCalledWith('Cześć');
  });
  it('test_op_float_msg_color', () => {
    const r = run([P(5), S('Hej'), P(-2), 0x810a], {}, false);
    expect(r.hooks.floatMsg).toHaveBeenCalledWith(5, 'Hej', -2);
  });
  it('test_op_play_sfx_light_gfade_override_map_start', () => {
    expect(run([S('wav01'), 0x80a3], {}, false).hooks.playSfx).toHaveBeenCalledWith('wav01');
    expect(run([P(65536), 0x80e9], {}, false).hooks.setLightLevel).toHaveBeenCalledWith(65536);
    expect(run([P(30), 0x8136], {}, false).hooks.gfade).toHaveBeenCalledWith('out', 30);
    expect(run([P(30), 0x8137], {}, false).hooks.gfade).toHaveBeenCalledWith('in', 30);
    const o = run([P(10), P(20), P(1), P(3), 0x80a9], {}, false);
    expect(o.hooks.overrideMapStart).toHaveBeenCalledWith(10, 20, 1, 3);
  });
  it('test_op_metarule_routes_id_and_arg', () => {
    const r = run([P(22), P(5), 0x810b], { metarule: vi.fn(() => ({ t: 'int', v: 9 })) });
    expect(r.hooks.metarule).toHaveBeenCalledWith(22, { t: 'int', v: 5 }, expect.anything());
    expect(r.g0).toBe(9);
    const r3 = run([P(50), P(1), P(2), P(3), 0x80e1], {
      metarule3: vi.fn(() => ({ t: 'int', v: 4 })),
    });
    expect(r3.hooks.metarule3).toHaveBeenCalledWith(
      50,
      { t: 'int', v: 1 },
      { t: 'int', v: 2 },
      { t: 'int', v: 3 },
    );
    expect(r3.g0).toBe(4);
  });
  it('test_op_unknown_game_opcode_calls_unsupported_and_continues', () => {
    // 0x80e8 critter_heal (2->1): bez implementacji w batchu 1
    const unsupported = vi.fn(() => ({ t: 'int', v: 3 }) as Value);
    const r = run([P(5), P(10), 0x80e8], { unsupported });
    expect(unsupported).toHaveBeenCalledWith('critter_heal', [
      { t: 'int', v: 5 },
      { t: 'int', v: 10 },
    ]);
    expect(r.g0).toBe(3);
  });
});
