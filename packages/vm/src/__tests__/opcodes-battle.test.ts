import { describe, expect, it, vi } from 'vitest';
import {
  Interpreter,
  ScriptInstance,
  gameHandlers,
  battleHandlers,
  type OpHandler,
} from '../index.js';
import { RET, buildInt, type Item } from './fixtures/build-int.js';

const P = (n: number): Item => ({ push: n });

function run(code: Item[], over: Record<string, unknown> = {}) {
  const merged = new Map<number, OpHandler>(gameHandlers);
  for (const [k, v] of battleHandlers) merged.set(k, v);
  const hooks = {
    getLocalVar: () => 0,
    setLocalVar: () => {},
    getMapVar: () => 0,
    setMapVar: () => {},
    getGlobalVar: () => 0,
    setGlobalVar: () => {},
    unsupported: vi.fn(() => ({ t: 'int', v: 0 })),
    opcodeHandlers: merged,
    ...over,
  };
  const script = buildInt('t', [{ name: 'start', code: [...code, P(0), ...RET] }]);
  new Interpreter(hooks as never).run(new ScriptInstance(script), 'start');
  return hooks;
}

describe('opkody walki', () => {
  it('critter_damage(obj, dmg, flags)', () => {
    const critterDamage = vi.fn();
    run([P(7), P(12), P(0x103), 0x80ef], { critterDamage });
    expect(critterDamage).toHaveBeenCalledWith(7, 12, 0x103);
  });
  it('critter_damage bez obiektu = blad', () => {
    expect(() => run([P(-1), P(1), P(0), 0x80ef], { critterDamage: vi.fn() })).toThrow();
  });
  it('attack: ofiara + 7 liczb w kolejnosci stosu', () => {
    const attack = vi.fn();
    run([P(9), P(1), P(2), P(3), P(4), P(5), P(6), P(7), 0x80d0], { attack });
    expect(attack.mock.calls[0]?.[1]).toBe(9);
    expect(attack.mock.calls[0]?.[2]).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
  it('attack_setup(attacker, defender)', () => {
    const attackSetup = vi.fn();
    run([P(3), P(4), 0x8143], { attackSetup });
    expect(attackSetup.mock.calls[0]?.slice(1)).toEqual([3, 4]);
  });
  it('use_obj_on_obj(item, target)', () => {
    const useObjOnObj = vi.fn();
    run([P(5), P(6), 0x8145], { useObjOnObj });
    expect(useObjOnObj.mock.calls[0]?.slice(1)).toEqual([5, 6]);
  });
  it('explosion(tile, elev, dmg); tile -1 = bez dzialania', () => {
    const explosion = vi.fn();
    run([P(20100), P(0), P(30), 0x811a], { explosion });
    expect(explosion).toHaveBeenCalledWith(20100, 0, 30);
    run([P(-1), P(0), P(30), 0x811a], { explosion });
    expect(explosion).toHaveBeenCalledTimes(1);
  });
});

describe('opkody obiektowe (scr_return, use_obj, drop_obj)', () => {
  it('scr_return(val)', () => {
    const scrReturn = vi.fn();
    run([P(42), 0x80a2], { scrReturn });
    expect(scrReturn.mock.calls[0]?.[1]).toBe(42);
  });
  it('use_obj(item) i drop_obj(item)', () => {
    const useObj = vi.fn();
    const dropObj = vi.fn();
    run([P(9), 0x80db, P(8), 0x80d7], { useObj, dropObj });
    expect(useObj.mock.calls[0]?.[1]).toBe(9);
    expect(dropObj.mock.calls[0]?.[1]).toBe(8);
  });
  it('use_obj bez obiektu = blad', () => {
    expect(() => run([P(-1), 0x80db], { useObj: vi.fn() })).toThrow();
  });
});
