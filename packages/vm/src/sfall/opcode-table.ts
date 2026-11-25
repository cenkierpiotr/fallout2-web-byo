/**
 * Tablica opkodow sfall dla RPU 2.4.34 i Et Tu. Numery oraz (pops, pushes) zweryfikowane
 * przeciwko `sfall/Modules/Scripting/Opcodes.cpp` oraz dezasemblacji skryptow `.int` z `rpu.dat`.
 * Mozna je nadpisac w `registerSfallOpcodes(..., { opcodes })`.
 * plan: impl = realna implementacja, noop = log + wartosc 0 / '' (stos spojny).
 */
export interface SfallOpDef {
  name: string;
  op: number;
  pops: number;
  pushes: 0 | 1;
  plan: 'impl' | 'noop';
  status: 'W' | 'Z';
}

const d = (
  name: string,
  op: number,
  pops: number,
  pushes: 0 | 1,
  plan: 'impl' | 'noop',
  status: 'W' | 'Z' = 'W',
): SfallOpDef => ({
  name,
  op,
  pops,
  pushes,
  plan,
  status,
});

export const SFALL_OPCODES: readonly SfallOpDef[] = [
  d('read_byte', 0x8156, 1, 1, 'noop'),
  d('read_short', 0x8157, 1, 1, 'noop'),
  d('read_int', 0x8158, 1, 1, 'noop'),
  d('read_string', 0x8159, 1, 1, 'noop'),
  d('tap_key', 0x8162, 1, 0, 'noop'),
  d('game_loaded', 0x8164, 0, 1, 'noop'),
  d('graphics_funcs_available', 0x8165, 0, 1, 'noop'),
  d('set_global_script_repeat', 0x816a, 1, 0, 'impl'),
  d('input_funcs_available', 0x816b, 0, 1, 'noop'),
  d('key_pressed', 0x816c, 1, 1, 'noop'),
  d('in_world_map', 0x8170, 0, 1, 'noop'),
  d('force_encounter', 0x8171, 1, 0, 'noop'),
  d('set_world_map_pos', 0x8172, 2, 0, 'noop'),
  d('set_global_script_type', 0x819b, 1, 0, 'noop'),
  d('set_sfall_global', 0x819d, 2, 0, 'impl'),
  d('get_sfall_global_int', 0x819e, 1, 1, 'impl'),
  d('get_sfall_global_float', 0x819f, 1, 1, 'impl'),
  d('get_ini_setting', 0x81ac, 1, 1, 'impl'),
  d('get_game_mode', 0x81af, 0, 1, 'noop'),
  d('set_car_current_town', 0x81b6, 1, 0, 'noop'),
  d('set_fake_perk', 0x81bb, 4, 0, 'noop'),
  d('show_iface_tag', 0x81dc, 1, 0, 'noop'),
  d('hide_iface_tag', 0x81dd, 1, 0, 'noop'),
  d('is_iface_tag_active', 0x81de, 1, 1, 'noop'),
  d('get_sfall_arg', 0x81e4, 0, 1, 'noop'),
  d('abs', 0x81ed, 1, 1, 'impl'),
  d('get_script', 0x81f5, 1, 1, 'noop'),
  d('fs_copy', 0x81f8, 2, 1, 'noop'),
  d('fs_write_short', 0x81fb, 2, 0, 'noop'),
  d('fs_seek', 0x8202, 2, 0, 'noop'),
  d('get_proto_data', 0x8204, 2, 1, 'noop'),
  d('set_proto_data', 0x8205, 3, 0, 'noop'),
  d('set_self', 0x8206, 1, 0, 'noop'),
  d('fs_read_short', 0x820a, 1, 1, 'noop'),
  d('set_hero_race', 0x8214, 1, 0, 'noop'),
  d('set_hero_style', 0x8215, 1, 0, 'noop'),
  d('set_critter_burst_disable', 0x8216, 2, 0, 'noop'),
  d('get_weapon_ammo_pid', 0x8217, 1, 1, 'noop'),
  d('set_weapon_ammo_pid', 0x8218, 2, 0, 'noop'),
  d('get_weapon_ammo_count', 0x8219, 1, 1, 'noop'),
  d('set_weapon_ammo_count', 0x821a, 2, 0, 'noop'),
  d('write_string', 0x821b, 2, 0, 'noop'),
  d('get_window_under_mouse', 0x821f, 0, 1, 'noop'),
  d('refresh_pc_art', 0x8227, 0, 0, 'noop'),
  d('create_array', 0x822d, 2, 1, 'impl'),
  d('set_array', 0x822e, 3, 0, 'impl'),
  d('get_array', 0x822f, 2, 1, 'impl'),
  d('free_array', 0x8230, 1, 0, 'impl'),
  d('len_array', 0x8231, 1, 1, 'impl'),
  d('resize_array', 0x8232, 2, 0, 'impl'),
  d('temp_array', 0x8233, 2, 1, 'impl'),
  d('fix_array', 0x8234, 1, 0, 'impl'),
  d('list_as_array', 0x8236, 1, 1, 'impl'),
  d('scan_array', 0x8239, 2, 1, 'impl'),
  d('sprintf', 0x8250, 2, 1, 'impl'),
  d('array_key', 0x8256, 2, 1, 'impl'),
  d('arrayexpr', 0x8257, 2, 1, 'impl'),
  d('reg_anim_combat_check', 0x825c, 1, 0, 'noop'),
  d('metarule2_explosions', 0x8261, 3, 1, 'noop'),
  d('register_hook_proc', 0x8262, 2, 0, 'noop'),
  d('message_str_game', 0x826b, 2, 1, 'noop'),
  d('party_member_list', 0x8271, 1, 1, 'impl'),
  d('sfall_func0', 0x8276, 1, 1, 'noop'),
  d('sfall_func1', 0x8277, 2, 1, 'noop'),
  d('sfall_func2', 0x8278, 3, 1, 'noop'),
  d('sfall_func3', 0x8279, 4, 1, 'noop', 'Z'),
  d('sfall_func4', 0x827a, 5, 1, 'noop'),
];

export type SfallOpName = (typeof SFALL_OPCODES)[number]['name'];
