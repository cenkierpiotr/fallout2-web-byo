import { describe, expect, it, vi } from 'vitest';
import {
  Interpreter,
  ScriptInstance,
  combatHandlers,
  gameHandlers,
  type OpHandler,
} from '../index.js';
import { RET, buildInt, type Item } from './fixtures/build-int.js';

const P = (n: number): Item => ({ push: n });
const SETG = 0x80c6;

function run(code: Item[], over: Record<string, unknown> = {}, store = true) {
  const globals: number[] = [];
  const merged = new Map<number, OpHandler>(gameHandlers);
  for (const [k, v] of combatHandlers) merged.set(k, v);
  const hooks = {
    getLocalVar: () => 0,
    setLocalVar: () => {},
    getMapVar: () => 0,
    setMapVar: () => {},
    getGlobalVar: (i: number) => globals[i] ?? 0,
    setGlobalVar: (i: number, v: number) => void (globals[i] = v),
    unsupported: vi.fn(() => ({ t: 'int', v: 0 })),
    isCritter: () => true,
    opcodeHandlers: merged,
    ...over,
  };
  const script = buildInt('t', [
    { name: 'start', code: store ? [P(0), ...code, SETG, P(0), ...RET] : [...code, P(0), ...RET] },
  ]);
  const inst = new ScriptInstance(script);
  new Interpreter(hooks as never).run(inst, 'start');
  return { hooks, inst, g0: globals[0] };
}

describe('give_exp_points', () => {
  it('przekazuje XP', () => {
    const giveExpPoints = vi.fn();
    run([P(250), 0x80a1], { giveExpPoints }, false);
    expect(giveExpPoints).toHaveBeenCalledWith(250);
  });
});

describe('has_skill / roll_vs_skill / how_much', () => {
  it('has_skill zwraca wartosc skilla krytera', () => {
    const skillValue = vi.fn(() => 77);
    expect(run([P(5), P(6), 0x80aa], { skillValue }).g0).toBe(77);
    expect(skillValue).toHaveBeenCalledWith(5, 6);
  });
  it('has_skill dla nie-krytera to 0', () => {
    const skillValue = vi.fn(() => 77);
    expect(run([P(5), P(6), 0x80aa], { skillValue, isCritter: () => false }).g0).toBe(0);
    expect(skillValue).not.toHaveBeenCalled();
  });
  it('roll_vs_skill przekazuje (obj, skill, mod) w kolejnosci i zwraca stopien', () => {
    const rollVsSkill = vi.fn(() => ({ degree: 3, delta: 42 }));
    expect(run([P(5), P(8), P(-20), 0x80ac], { rollVsSkill }).g0).toBe(3);
    expect(rollVsSkill).toHaveBeenCalledWith(5, 8, -20);
  });
  it('roll_vs_skill bez krytera daje 0 i nie rzuca', () => {
    const rollVsSkill = vi.fn();
    expect(run([P(5), P(8), P(0), 0x80ac], { rollVsSkill, isCritter: () => false }).g0).toBe(0);
    expect(rollVsSkill).not.toHaveBeenCalled();
  });
  it('how_much zwraca delta ostatniego rzutu tego skryptu', () => {
    const rollVsSkill = vi.fn(() => ({ degree: 1, delta: -17 }));
    expect(run([P(5), P(8), P(0), 0x80ac, 0x80b1], { rollVsSkill }).g0).toBe(-17);
  });
  it('how_much bez wczesniejszego rzutu to 0', () => {
    expect(run([P(1), 0x80b1]).g0).toBe(0);
  });
});

describe('tile_in_tile_rect', () => {
  // kafel = y*200 + x; ul ma najwiekszy x i najmniejszy y, lr odwrotnie
  const ul = 10 * 200 + 50;
  const lr = 20 * 200 + 40;
  const rect = (tile: number) => run([P(ul), P(ul), P(lr), P(lr), P(tile), 0x80cf]).g0;
  it('srodek i brzegi wewnatrz', () => {
    expect(rect(15 * 200 + 45)).toBe(1);
    expect(rect(ul)).toBe(1);
    expect(rect(lr)).toBe(1);
  });
  it('poza prostokatem', () => {
    expect(rect(15 * 200 + 51)).toBe(0);
    expect(rect(15 * 200 + 39)).toBe(0);
    expect(rect(9 * 200 + 45)).toBe(0);
    expect(rect(21 * 200 + 45)).toBe(0);
  });
  it('uzywa tylko pierwszego i czwartego argumentu rogu', () => {
    expect(run([P(ul), P(1), P(2), P(lr), P(15 * 200 + 45), 0x80cf]).g0).toBe(1);
  });
});

describe('obj_can_see_obj / anim_busy / reg_anim_func', () => {
  it('canSee wywolane (src, target)', () => {
    const canSee = vi.fn(() => true);
    expect(run([P(3), P(4), 0x80dc], { canSee }).g0).toBe(1);
    expect(canSee).toHaveBeenCalledWith(3, 4);
  });
  it('canSee z pustym obiektem to 0', () => {
    const canSee = vi.fn(() => true);
    expect(run([P(-1), P(4), 0x80dc], { canSee }).g0).toBe(0);
    expect(canSee).not.toHaveBeenCalled();
  });
  it('anim_busy', () => {
    const animBusy = vi.fn((id: number) => id === 3);
    expect(run([P(3), 0x80e7], { animBusy }).g0).toBe(1);
    expect(run([P(4), 0x80e7], { animBusy }).g0).toBe(0);
    expect(run([P(-1), 0x80e7], { animBusy }).g0).toBe(0);
  });
  it('reg_anim_func (op, wartosc)', () => {
    const regAnimFunc = vi.fn();
    run([P(1), P(2), 0x810e], { regAnimFunc }, false);
    run([P(2), P(9), 0x810e], { regAnimFunc }, false);
    run([P(3), P(0), 0x810e], { regAnimFunc }, false);
    expect(regAnimFunc.mock.calls).toEqual([
      [1, 2],
      [2, 9],
      [3, 0],
    ]);
  });
});

describe('using_skill / do_check / skill_contest / roll_dice', () => {
  it('using_skill (krytter, skill) przekazuje argumenty', () => {
    const usingSkill = vi.fn(() => 1);
    expect(run([P(5), P(8), 0x80ab], { usingSkill }).g0).toBe(1);
    expect(usingSkill).toHaveBeenCalledWith(5, 8);
  });
  it('using_skill bez obiektu to 0', () => {
    const usingSkill = vi.fn(() => 1);
    expect(run([P(-1), P(8), 0x80ab], { usingSkill }).g0).toBe(0);
    expect(usingSkill).not.toHaveBeenCalled();
  });
  it('do_check (obj, stat, mod) zwraca stopien i ustawia how_much', () => {
    const statCheck = vi.fn(() => ({ degree: 2, delta: 4 }));
    const r = run([P(5), P(1), P(-2), 0x80ae], { statCheck });
    expect(r.g0).toBe(2);
    expect(statCheck).toHaveBeenCalledWith(5, 1, -2);
    expect(run([P(5), P(1), P(-2), 0x80ae, 0x80b1], { statCheck }).g0).toBe(4);
  });
  it('do_check: brak obiektu lub stat poza 0..6 to 0 bez rzutu', () => {
    const statCheck = vi.fn(() => ({ degree: 2, delta: 4 }));
    expect(run([P(0), P(1), P(0), 0x80ae], { statCheck }).g0).toBe(0);
    expect(run([P(-1), P(1), P(0), 0x80ae], { statCheck }).g0).toBe(0);
    expect(run([P(5), P(7), P(0), 0x80ae], { statCheck }).g0).toBe(0);
    expect(run([P(5), P(-1), P(0), 0x80ae], { statCheck }).g0).toBe(0);
    expect(statCheck).not.toHaveBeenCalled();
  });
  it('skill_contest (3 arg) i roll_dice (2 arg) to atrapy zwracajace 0', () => {
    expect(run([P(1), P(2), P(3), 0x80ad]).g0).toBe(0);
    expect(run([P(1), P(2), 0x80b5]).g0).toBe(0);
  });
});
