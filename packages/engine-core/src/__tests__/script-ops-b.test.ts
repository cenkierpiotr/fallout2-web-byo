import { describe, expect, it } from 'vitest';
import { int, obj as objV, str } from '@f2/vm';
import { ExtraOpsB, EXTRA_B_OPS } from '../script-ops-b.js';
import { fake } from './helpers.js';

const mk = (ticks = 0, objs: Record<number, ReturnType<typeof fake>> = {}) => {
  const ops = new ExtraOpsB();
  const call = (name: string, args: ReturnType<typeof int>[] = []) =>
    ops.handle(name, args, { ticks, obj: (id) => objs[id] });
  return { ops, call };
};

describe('opkody VM czesc B (rozne, Z)', () => {
  it('game_time_sec (0x80eb, 0x457a18): tiki / 10', () => {
    expect(mk(12345).call('game_time_sec')).toEqual(int(1234));
  });
  it('game_days (0x811b, 0x45a528): doby od startu (864000 tikow)', () => {
    expect(mk(864000 * 3 + 5).call('game_days')).toEqual(int(3));
  });
  it('config_flag_a/b/c: klucze preferences, domyslnie 1 (0x45b010/0x45b05c/0x45c830)', () => {
    const { ops, call } = mk();
    expect(call('config_flag_a')).toEqual(int(1));
    ops.prefs.set('game_difficulty', 2);
    ops.prefs.set('running_burning_guy', 0);
    ops.prefs.set('combat_difficulty', 0);
    expect(call('config_flag_a')).toEqual(int(2));
    expect(call('config_flag_b')).toEqual(int(0));
    expect(call('config_flag_c')).toEqual(int(0));
  });
  it('obj_set_light_level(obj, intensywnosc%, promien) (0x459088)', () => {
    const o = fake(1, 100);
    const { call } = mk(0, { 7: o });
    call('obj_set_light_level', [objV(7), int(50), int(4)]);
    expect(o.lightRadius).toBe(4);
    expect(o.lightIntensity).toBe(Math.floor((50 * 65536) / 100));
  });
  it('obj_set_light_level: intensywnosc 0 zostawia domyslna, brak obiektu nic nie robi', () => {
    const o = fake(1, 100);
    o.lightIntensity = 77;
    const { call } = mk(0, { 7: o });
    call('obj_set_light_level', [objV(7), int(0), int(2)]);
    expect(o.lightIntensity).toBe(77);
    expect(o.lightRadius).toBe(2);
    expect(() => call('obj_set_light_level', [objV(9), int(1), int(1)])).not.toThrow();
  });
  it('critter_rm_trait zawsze zwraca -1 (0x458c2c, brak modelu perkow)', () => {
    const { call } = mk(0, { 1: fake(1, 5) });
    expect(call('critter_rm_trait', [objV(1), int(0), int(3), int(1)])).toEqual(int(-1));
  });
  it('sekwencje reg_anim_*: wpisy w dzienniku z argumentami', () => {
    const { ops, call } = mk();
    call('reg_anim_animate_forever', [objV(1), int(5)]);
    call('reg_anim_animate_reverse', [objV(1), int(2), int(-1)]);
    call('reg_anim_obj_move_to_tile', [objV(1), int(20100), int(-1)]);
    call('reg_anim_obj_run_to_tile', [objV(1), int(20101), int(-1)]);
    call('reg_anim_obj_move_to_obj', [objV(1), objV(2), int(-1)]);
    call('reg_anim_obj_run_to_obj', [objV(1), objV(2), int(-1)]);
    call('reg_anim_play_sfx', [objV(1), str('shot'), int(0)]);
    expect(ops.regAnims.map((a) => a.op)).toEqual([
      'reg_anim_animate_forever',
      'reg_anim_animate_reverse',
      'reg_anim_obj_move_to_tile',
      'reg_anim_obj_run_to_tile',
      'reg_anim_obj_move_to_obj',
      'reg_anim_obj_run_to_obj',
      'reg_anim_play_sfx',
    ]);
    expect(ops.regAnims[2]).toMatchObject({ obj: 1, args: [20100, -1] });
    expect(ops.regAnims[6]?.sfx).toBe('shot');
  });
  it('play_gmovie, set_map_music: zapis do dziennika; nopy zwracaja undefined-sukces', () => {
    const { ops, call } = mk();
    call('play_gmovie', [int(7)]);
    call('set_map_music', [int(1), int(2), int(3), int(4)]);
    expect(ops.movies).toEqual([7]);
    expect(ops.musicCalls).toHaveLength(1);
    for (const n of ['nop_80d1', 'nop_8108', 'script_op_8146', 'script_op_8148']) {
      expect(call(n, [int(1)])).toEqual(int(0));
    }
  });
  it('nieznany opkod zwraca undefined; lista obslugiwanych jest spojna', () => {
    expect(mk().call('nie_istnieje')).toBeUndefined();
    expect(EXTRA_B_OPS.has('game_days')).toBe(true);
  });
});
