import { describe, expect, it, vi } from 'vitest';
import {
  Interpreter,
  ScriptInstance,
  gameHandlers,
  inventoryHandlers,
  implementedInventoryOpcodes,
  type OpHandler,
} from '../index.js';
import { RET, buildInt, type Item } from './fixtures/build-int.js';

const P = (n: number): Item => ({ push: n });
const SETG = 0x80c6;

function run(code: Item[], inv: Record<string, unknown>, store = true) {
  const globals: number[] = [];
  const merged = new Map<number, OpHandler>(gameHandlers);
  for (const [k, v] of inventoryHandlers) merged.set(k, v);
  const hooks = {
    getLocalVar: () => 0,
    setLocalVar: () => {},
    getMapVar: () => 0,
    setMapVar: () => {},
    getGlobalVar: (i: number) => globals[i] ?? 0,
    setGlobalVar: (i: number, v: number) => void (globals[i] = v),
    unsupported: vi.fn(() => ({ t: 'int', v: 0 })),
    opcodeHandlers: merged,
    ...inv,
  };
  const script = buildInt('t', [
    { name: 'start', code: store ? [P(0), ...code, SETG, P(0), ...RET] : [...code, P(0), ...RET] },
  ]);
  new Interpreter(hooks as never).run(new ScriptInstance(script), 'start');
  return { hooks, g0: globals[0] };
}

describe('opkody ekwipunku i druzyny', () => {
  it('test_op_party_member_obj_pid_to_obj', () => {
    const partyMemberObj = vi.fn(() => 77);
    const r = run([P(16777300), 0x814b], { partyMemberObj });
    expect(partyMemberObj).toHaveBeenCalledWith(16777300);
    expect(r.g0).toBe(77);
  });
  it('test_op_party_member_obj_none_is_zero', () => {
    expect(run([P(5), 0x814b], { partyMemberObj: () => -1 }).g0).toBe(0);
  });
  it('test_op_obj_is_carrying_obj_pid_count', () => {
    const invenCountPid = vi.fn(() => 3);
    const r = run([P(9), P(41), 0x80ba], { invenCountPid });
    expect(invenCountPid).toHaveBeenCalledWith(9, 41);
    expect(r.g0).toBe(3);
  });
  it('test_op_critter_inven_obj_slots_and_count', () => {
    const invenSlotObj = vi.fn(() => 12);
    const invenCount = vi.fn(() => 4);
    expect(run([P(9), P(1), 0x8106], { invenSlotObj, invenCount }).g0).toBe(12);
    expect(invenSlotObj).toHaveBeenCalledWith(9, 1);
    expect(run([P(9), P(-2), 0x8106], { invenSlotObj, invenCount }).g0).toBe(4);
    expect(run([P(9), P(-1), 0x8106], { invenSlotObj, invenCount }).g0).toBe(0);
    expect(run([P(9), P(7), 0x8106], { invenSlotObj, invenCount }).g0).toBe(0);
    expect(invenCount).toHaveBeenCalledWith(9);
  });
  it('test_op_obj_carrying_pid_obj_returns_item', () => {
    const invenObjByPid = vi.fn(() => 33);
    expect(run([P(9), P(40), 0x810d], { invenObjByPid }).g0).toBe(33);
    expect(invenObjByPid).toHaveBeenCalledWith(9, 40);
  });
  it('test_op_add_and_rm_obj_inven_arg_order', () => {
    const addObjToInven = vi.fn();
    const rmObjFromInven = vi.fn();
    run([P(9), P(21), 0x80d8], { addObjToInven }, false);
    expect(addObjToInven).toHaveBeenCalledWith(9, 21);
    run([P(9), P(21), 0x80d9], { rmObjFromInven }, false);
    expect(rmObjFromInven).toHaveBeenCalledWith(9, 21);
  });
  it('test_op_add_mult_and_rm_mult', () => {
    const addMultObjsToInven = vi.fn();
    const rmMultObjsFromInven = vi.fn(() => 2);
    run([P(9), P(21), P(5), 0x8116], { addMultObjsToInven }, false);
    expect(addMultObjsToInven).toHaveBeenCalledWith(9, 21, 5);
    const r = run([P(9), P(21), P(5), 0x8117], { rmMultObjsFromInven });
    expect(rmMultObjsFromInven).toHaveBeenCalledWith(9, 21, 5);
    expect(r.g0).toBe(2);
  });
  it('test_op_item_subtype', () => {
    expect(run([P(21), 0x80c9], { itemSubtype: () => 3 }).g0).toBe(3);
  });
  it('test_op_party_add_remove_wield_caps', () => {
    const partyAdd = vi.fn();
    const partyRemove = vi.fn();
    const wieldObjCritter = vi.fn();
    const itemCapsTotal = vi.fn(() => 250);
    const itemCapsAdjust = vi.fn(() => -1);
    run([P(9), 0x8124], { partyAdd }, false);
    run([P(9), 0x8125], { partyRemove }, false);
    run([P(9), P(21), 0x80da], { wieldObjCritter }, false);
    expect(partyAdd).toHaveBeenCalledWith(9);
    expect(partyRemove).toHaveBeenCalledWith(9);
    expect(wieldObjCritter).toHaveBeenCalledWith(9, 21);
    expect(run([P(9), 0x8138], { itemCapsTotal }).g0).toBe(250);
    expect(run([P(9), P(-100), 0x8139], { itemCapsAdjust }).g0).toBe(-1);
    expect(itemCapsAdjust).toHaveBeenCalledWith(9, -100);
  });
  it('test_inventory_handlers_set_is_nonempty', () => {
    expect(implementedInventoryOpcodes.size).toBe(14);
  });
});
