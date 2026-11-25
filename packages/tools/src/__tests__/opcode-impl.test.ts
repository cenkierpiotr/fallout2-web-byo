import { describe, expect, it } from 'vitest';
import { OPCODES } from '@f2/vm';
import {
  gameOpcodeImpl,
  injectImplSection,
  renderImplSection,
  scanNamedOps,
} from '../opcode-impl.js';

describe('scanNamedOps', () => {
  it('lapie opName === literaly nalezace do zbioru, ignoruje reszte', () => {
    const rt =
      "if (opName === 'poison') x; if (opName === 'radiation_inc' || opName === 'radiation_dec') y; foo('nie_opkod'); opName === 'obcy'";
    expect(
      scanNamedOps(rt, 'runtime', new Set(['poison', 'radiation_inc', 'radiation_dec', 'foo'])),
    ).toEqual(['poison', 'radiation_dec', 'radiation_inc']);
  });
  it('tryb all zbiera dowolne literaly ze zbioru', () => {
    const b = "case 'game_time_sec': ...; const A = new Set(['pickup_obj', 'zly']);";
    expect(scanNamedOps(b, 'all', new Set(['game_time_sec', 'pickup_obj']))).toEqual([
      'game_time_sec',
      'pickup_obj',
    ]);
  });
});

describe('gameOpcodeImpl', () => {
  const r = gameOpcodeImpl();
  it('mianownik to opkody gry z tabeli (264)', () => {
    expect(r.total).toBe([...OPCODES.values()].filter((d) => d.kind === 'game').length);
    expect(r.total).toBe(264);
  });
  it('opkody czesci B (bcc771e) i fali 11/15 sa zaimplementowane', () => {
    for (const n of [
      'game_time_sec',
      'game_days',
      'config_flag_a',
      'config_flag_b',
      'config_flag_c',
      'obj_set_light_level',
      'critter_rm_trait',
      'reg_anim_play_sfx',
      'play_gmovie',
      'set_map_music',
      'poison',
      'kill_critter',
      'tile_is_visible',
      'party_member_obj',
      'op_global_var',
      'set_local_var',
    ])
      expect(r.byName.has(n), n).toBe(true);
  });
  it('licznik zgodny z lista, no-opy liczone osobno, brak nakladania z missing', () => {
    expect(r.implemented).toBe(r.byOp.size);
    expect(r.noop).toBeLessThanOrEqual(r.implemented);
    expect(r.implemented + r.missing.length).toBe(r.total);
    expect(r.implemented).toBeGreaterThan(123);
  });
  it('sekcja markdown ma licznik i wstrzykuje sie idempotentnie', () => {
    const s = renderImplSection(r);
    expect(s).toContain(`${r.implemented}/264`);
    const md = '# T\n\n## Top 100 x\n';
    const once = injectImplSection(md, s);
    expect(injectImplSection(once, s)).toBe(once);
  });
});
