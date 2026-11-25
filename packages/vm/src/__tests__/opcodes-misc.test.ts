import { describe, expect, it, vi } from 'vitest';
import {
  Interpreter,
  ScriptInstance,
  gameHandlers,
  miscHandlers,
  type OpHandler,
} from '../index.js';
import { RET, buildInt, type Item } from './fixtures/build-int.js';

const P = (n: number): Item => ({ push: n });
const SETG = 0x80c6;

function run(code: Item[], over: Record<string, unknown> = {}, store = true) {
  const globals: number[] = [];
  const merged = new Map<number, OpHandler>(gameHandlers);
  for (const [k, v] of miscHandlers) merged.set(k, v);
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
  const inst = new ScriptInstance(script);
  new Interpreter(hooks as never).run(inst, 'start');
  return { hooks, inst, g0: globals[0] };
}

describe('opkody flag/mapy/blokad', () => {
  it('script_overrides przekazuje instancje skryptu', () => {
    const scriptOverrides = vi.fn();
    const r = run([0x80b9], { scriptOverrides }, false);
    expect(scriptOverrides).toHaveBeenCalledWith(r.inst);
  });
  it('cur_map_index zwraca indeks mapy', () => {
    expect(run([0x8101], { curMapIndex: () => 17 }).g0).toBe(17);
  });
  it('rotation_to_tile przekazuje (a,b) w kolejnosci', () => {
    const tileDirection = vi.fn(() => 4);
    expect(run([P(100), P(200), 0x814c], { tileDirection }).g0).toBe(4);
    expect(tileDirection).toHaveBeenCalledWith(100, 200);
  });
  it('set_obj_visibility: flaga !=0 ukrywa, 0 pokazuje', () => {
    const setObjHidden = vi.fn();
    run([P(5), P(1), 0x80e3], { setObjHidden }, false);
    run([P(5), P(0), 0x80e3], { setObjHidden }, false);
    expect(setObjHidden).toHaveBeenNthCalledWith(1, 5, true);
    expect(setObjHidden).toHaveBeenNthCalledWith(2, 5, false);
  });
  it('set_obj_visibility bez obiektu to blad VM', () => {
    expect(() => run([P(-1), P(1), 0x80e3], { setObjHidden: vi.fn() }, false)).toThrow();
  });
  it('script_action, obj_being_used_with, mouse_state_flag', () => {
    expect(run([0x80c7], { scriptAction: () => 21 }).g0).toBe(21);
    expect(run([0x80c0], { objBeingUsedWith: () => 9 }).g0).toBe(9);
    expect(run([0x8128], { mouseButtons: () => 3 }).g0).toBe(1);
    expect(run([0x8128], { mouseButtons: () => 2 }).g0).toBe(0);
  });
  it('game_ui_disable/enable', () => {
    const setUiEnabled = vi.fn();
    run([0x8133, 0x8134], { setUiEnabled }, false);
    expect(setUiEnabled.mock.calls).toEqual([[false], [true]]);
  });
  it('game_time_advance przekazuje tiki', () => {
    const gameTimeAdvance = vi.fn();
    run([P(600), 0x80fc], { gameTimeAdvance }, false);
    expect(gameTimeAdvance).toHaveBeenCalledWith(600);
  });
  it('rodzina blokad i otwarcia', () => {
    const o = {
      objIsLocked: vi.fn(() => 1),
      objIsOpen: vi.fn(() => 1),
      setObjLocked: vi.fn(),
      setObjOpen: vi.fn(),
    };
    expect(run([P(3), 0x812d], o).g0).toBe(1);
    expect(run([P(3), 0x8130], o).g0).toBe(1);
    run([P(3), 0x812e, P(4), 0x812f, P(5), 0x814d], o, false);
    run([P(6), 0x8131, P(7), 0x8132], o, false);
    expect(o.setObjLocked.mock.calls).toEqual([
      [3, true],
      [4, false],
      [5, true],
    ]);
    expect(o.setObjOpen.mock.calls).toEqual([
      [6, true],
      [7, false],
    ]);
  });
  it('success i critical interpretuja poziom rzutu', () => {
    const s = [0, 1, 2, 3].map((r) => run([P(r), 0x80af]).g0);
    const c = [0, 1, 2, 3].map((r) => run([P(r), 0x80b0]).g0);
    expect(s).toEqual([0, 0, 1, 1]);
    expect(c).toEqual([1, 0, 0, 1]);
  });
});
