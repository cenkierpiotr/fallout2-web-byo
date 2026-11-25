import { int } from '@f2/vm';
import type { Value } from '@f2/vm';
import type { GameObject } from './game-object.js';

/**
 * Opkody VM, czesc B: rzadziej uzywane opkody gry bez wlasnego modelu w silniku (status Z, chyba ze zaznaczono D).
 * Dostarczane przez `hooks.unsupported(nazwa, args)`; wynik wkladany przez vm gdy tabela mowi pushes = 1.
 */

export interface ExtraBContext {
  /** tiki zegara gry (10 na sekunde). */
  ticks: number;
  obj(id: number): GameObject | undefined;
}

export interface RegAnimEntry {
  op: string;
  obj: number;
  args: number[];
  sfx?: string;
}

const REG_ANIM_OPS = new Set([
  'reg_anim_animate_forever', // 0x8126 (0x45addc -> 0x4154c4(obj, -1))
  'reg_anim_animate_reverse', // 0x8110 (0x459dc4 -> 0x414aa8)
  'reg_anim_obj_move_to_obj', // 0x8111
  'reg_anim_obj_run_to_obj', // 0x8112
  'reg_anim_obj_move_to_tile', // 0x8113 (0x459fdc -> 0x414294)
  'reg_anim_obj_run_to_tile', // 0x8114
  'reg_anim_play_sfx', // 0x813b (0x45b740 -> 0x41541c)
]);

/** Opkody bez skutku w modelu: oryginal je wykonuje, silnik nie ma jeszcze odpowiednika (Z). */
const NOP_OPS = new Set(['nop_80d1', 'nop_8108', 'script_op_8146', 'script_op_8148']);

export const EXTRA_B_OPS: ReadonlySet<string> = new Set([
  'game_time_sec',
  'game_days',
  'config_flag_a',
  'config_flag_b',
  'config_flag_c',
  'obj_set_light_level',
  'critter_rm_trait',
  'play_gmovie',
  'set_map_music',
  ...REG_ANIM_OPS,
  ...NOP_OPS,
]);

const CONFIG_KEYS: Record<string, string> = {
  config_flag_a: 'game_difficulty', // 0x812a: ini [preferences] game_difficulty (0x45b010)
  config_flag_b: 'running_burning_guy', // 0x812b (0x45b05c)
  config_flag_c: 'combat_difficulty', // 0x814f (0x45c830)
};

export class ExtraOpsB {
  /** Preferencje gry ([preferences] w ini); brak klucza daje 1, jak niepowodzenie odczytu w oryginale. */
  readonly prefs = new Map<string, number>();
  readonly regAnims: RegAnimEntry[] = [];
  readonly movies: number[] = [];
  readonly musicCalls: number[][] = [];

  handle(opName: string, args: Value[], ctx: ExtraBContext): Value | undefined {
    const num = (i: number): number => {
      const v = args[i];
      return v && (v.t === 'int' || v.t === 'obj' || v.t === 'float') ? Math.trunc(v.v) : -1;
    };
    if (NOP_OPS.has(opName)) return int(0);
    if (REG_ANIM_OPS.has(opName)) {
      const e: RegAnimEntry = {
        op: opName,
        obj: num(0),
        args: args.slice(1).map((_, i) => num(i + 1)),
      };
      const s = args[1];
      if (opName === 'reg_anim_play_sfx' && s?.t === 'str') {
        e.sfx = s.v;
        e.args = [num(2)];
      }
      this.regAnims.push(e);
      return int(0);
    }
    switch (opName) {
      case 'game_time_sec': // 0x457a18: tiki / 10 (D)
        return int(Math.floor(ctx.ticks / 10));
      case 'game_days': // 0x45a528: (tiki - start) / 0xd2f00; start modelowany jako 0 (Z)
        return int(Math.floor(ctx.ticks / 864000));
      case 'config_flag_a':
      case 'config_flag_b':
      case 'config_flag_c':
        return int(this.prefs.get(CONFIG_KEYS[opName] ?? '') ?? 1);
      case 'obj_set_light_level': {
        // (obj, intensywnosc w %, promien) 0x459088; intensywnosc 0 = zostaw domyslna; skala *65536/100 (D, 0x459134)
        const o = ctx.obj(num(0));
        if (!o) return int(0);
        const pct = num(1);
        if (pct !== 0) o.lightIntensity = Math.floor((pct * 65536) / 100);
        o.lightRadius = num(2);
        return int(0);
      }
      case 'critter_rm_trait': // 0x458c2c: bez modelu perkow; oryginal zwraca stale -1 (D)
        return int(-1);
      case 'play_gmovie':
        this.movies.push(num(0));
        return int(0);
      case 'set_map_music':
        this.musicCalls.push(args.map((_, i) => num(i)));
        return int(0);
      default:
        return undefined;
    }
  }
}
