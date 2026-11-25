import { describe, expect, it, vi } from 'vitest';
import {
  Interpreter,
  ScriptInstance,
  gameHandlers,
  batch4Handlers,
  type OpHandler,
} from '../index.js';
import { RET, buildInt, type Item } from './fixtures/build-int.js';

const P = (n: number): Item => ({ push: n });
const SETG = 0x80c6;

function run(code: Item[], over: Record<string, unknown> = {}, store = true) {
  const globals: number[] = [];
  const merged = new Map<number, OpHandler>(gameHandlers);
  for (const [k, v] of batch4Handlers) merged.set(k, v);
  const hooks = {
    getLocalVar: () => 0,
    setLocalVar: () => {},
    getMapVar: () => 0,
    setMapVar: () => {},
    getGlobalVar: (i: number) => globals[i] ?? 0,
    setGlobalVar: (i: number, v: number) => void (globals[i] = v),
    unsupported: vi.fn(() => ({ t: 'int', v: 0 })),
    opcodeHandlers: merged,
    ...over,
  };
  const script = buildInt('t', [
    { name: 'start', code: store ? [P(0), ...code, SETG, P(0), ...RET] : [...code, P(0), ...RET] },
  ]);
  new Interpreter(hooks as never).run(new ScriptInstance(script), 'start');
  return { hooks, g0: globals[0] };
}

describe('opkody batch4', () => {
  it('critter_heal(obj, ilosc) zwraca wynik hooka', () => {
    const critterHeal = vi.fn(() => 1);
    expect(run([P(7), P(25), 0x80e8], { critterHeal }).g0).toBe(1);
    expect(critterHeal).toHaveBeenCalledWith(7, 25);
  });
  it('critter_heal bez obiektu to blad VM', () => {
    expect(() => run([P(-1), P(5), 0x80e8], { critterHeal: vi.fn() })).toThrow();
  });
  it('critter_state(obj)', () => {
    const critterState = vi.fn(() => 3);
    expect(run([P(7), 0x80fb], { critterState }).g0).toBe(3);
    expect(critterState).toHaveBeenCalledWith(7);
  });
  it('critter_state: nie-krytter lub NULL zwraca 1 bez bledu (0x4585e8)', () => {
    expect(run([P(7), 0x80fb], { critterState: () => -1 }).g0).toBe(1);
    expect(run([P(-1), 0x80fb], { critterState: () => -1 }).g0).toBe(1);
  });
  it('critter_is_fleeing / critter_set_flee_state', () => {
    const critterIsFleeing = vi.fn(() => 1);
    const critterSetFleeState = vi.fn();
    expect(run([P(7), 0x8151], { critterIsFleeing }).g0).toBe(1);
    run([P(7), P(1), 0x8152], { critterSetFleeState }, false);
    expect(critterSetFleeState).toHaveBeenCalledWith(7, true);
  });
  it('critter_injure(obj, flagi) maskuje 0x7c, bit 0x800000 zdejmuje', () => {
    const critterInjure = vi.fn();
    run([P(7), P(0x7e), 0x8127], { critterInjure }, false);
    run([P(7), P(0x800000 | 0x30), 0x8127], { critterInjure }, false);
    expect(critterInjure).toHaveBeenNthCalledWith(1, 7, 0x7c, false);
    expect(critterInjure).toHaveBeenNthCalledWith(2, 7, 0x30, true);
  });
  it('get_pc_stat(stat) zdejmuje jeden argument', () => {
    const pcStat = vi.fn(() => 9);
    expect(run([P(2), 0x80a6], { pcStat }).g0).toBe(9);
    expect(pcStat).toHaveBeenCalledWith(2);
  });
  it('move_obj_inven_to_obj(zrodlo, cel)', () => {
    const moveInventory = vi.fn();
    run([P(3), P(4), 0x8147], { moveInventory }, false);
    expect(moveInventory).toHaveBeenCalledWith(3, 4);
  });
  it('critter_attempt_placement(obj, tile, elev) zwraca wynik', () => {
    const attemptPlacement = vi.fn(() => 0);
    expect(run([P(3), P(20100), P(1), 0x80ff], { attemptPlacement }).g0).toBe(0);
    expect(attemptPlacement).toHaveBeenCalledWith(3, 20100, 1);
  });
  it('anim i reg_anim_animate przekazuja trzy argumenty', () => {
    const animate = vi.fn();
    run([P(3), P(5), P(0), 0x810c], { animate }, false);
    run([P(3), P(6), P(10), 0x810f], { animate }, false);
    expect(animate).toHaveBeenNthCalledWith(1, 3, 5, 0);
    expect(animate).toHaveBeenNthCalledWith(2, 3, 6, 10);
  });
});
