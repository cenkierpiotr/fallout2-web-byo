import { describe, expect, it } from 'vitest';
import { parseInt as parseIntScript, type IntScript } from '@f2/formats';
import { Interpreter, ScriptInstance, type Hooks, type OpHandler, type Value } from '@f2/vm';
import { openGameFolderNode } from '@f2/vfs/node';

const dir = process.env.F2_GAME_DIR;
const patchDir = process.env.F2_PATCH_DIR;

async function load(name: string): Promise<IntScript> {
  const vfs = await openGameFolderNode(dir!, patchDir);
  try {
    const u = await vfs.open(`scripts/${name}`);
    return parseIntScript(
      u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer,
      name,
    );
  } finally {
    await vfs.close?.();
  }
}

const hooks = (over: Partial<Hooks> = {}): Hooks => ({
  getLocalVar: () => 0,
  setLocalVar: () => {},
  getMapVar: () => 0,
  setMapVar: () => {},
  getGlobalVar: () => 0,
  setGlobalVar: () => {},
  ...over,
});

/** Atrapy opkodow gry uzywanych przez checkPartyMembersNearDoor: 80bc self_obj, 814b party_member_obj, 80d3 tile_distance_objs. */
function gameStubs(present: boolean, distance: number): Map<number, OpHandler> {
  return new Map<number, OpHandler>([
    [0x80bc, (c) => c.stack.push({ t: 'obj', v: 1 })],
    [
      0x814b,
      (c) => {
        c.stack.pop();
        c.stack.push(present ? { t: 'obj', v: 77 } : { t: 'null' });
      },
    ],
    [
      0x80d3,
      (c) => {
        c.stack.pop();
        c.stack.pop();
        c.stack.push({ t: 'int', v: distance });
      },
    ],
  ]);
}

describe.skipIf(!dir)('VM na prawdziwych skryptach (R9 z28b)', () => {
  it('test_acklint_preamble_builds_script_vars_on_stack', async () => {
    const script = await load('acklint.int');
    const inst = new ScriptInstance(script);
    new Interpreter(hooks()).initialize(inst);
    expect(inst.initialized).toBe(true);
    expect(inst.base18).toBe(0);
    expect(inst.stack.depth()).toBe(27);
    const v = (n: number): Value => inst.stack.get(inst.base18 + n);
    expect(v(1)).toEqual({ t: 'int', v: 1 });
    expect(v(21)).toEqual({ t: 'int', v: 2 });
    expect(v(0)).toEqual({ t: 'int', v: 0 });
    expect(inst.state).toBe('idle');
  });

  it('test_arbridge_preamble_and_start_proc', async () => {
    const script = await load('arbridge.int');
    const inst = new ScriptInstance(script);
    const interp = new Interpreter(hooks({ opcodeHandlers: gameStubs(false, 99) }));
    interp.initialize(inst);
    const depth = inst.stack.depth();
    expect(depth).toBe(20);
    // 'start' z prawdziwego skryptu: push_frame ... return; stos po powrocie wraca do stanu zmiennych
    expect(interp.run(inst, 'start')).toEqual({ t: 'int', v: 0 });
    expect(inst.stack.depth()).toBe(depth);
    expect(inst.base14).toBe(0);
  });

  it('test_acklint_checkPartyMembersNearDoor_returns_1_when_member_near', async () => {
    const script = await load('acklint.int');
    const inst = new ScriptInstance(script);
    const r = new Interpreter(hooks({ opcodeHandlers: gameStubs(true, 3) })).run(
      inst,
      'checkPartyMembersNearDoor',
    );
    expect(r).toEqual({ t: 'int', v: 1 });
    expect(inst.stack.depth()).toBe(27);
    expect(inst.base14).toBe(0);
  });

  it('test_acklint_checkPartyMembersNearDoor_zero_when_nobody_near', async () => {
    const script = await load('acklint.int');
    const inst = new ScriptInstance(script);
    const interp = new Interpreter(hooks({ opcodeHandlers: gameStubs(false, 99) }));
    expect(interp.run(inst, 'checkPartyMembersNearDoor')).toEqual({ t: 'int', v: 0 });
    expect(inst.stack.depth()).toBe(27);
  });

  it('test_arbridge_checkPartyMembersNearDoor_both_cases', async () => {
    const script = await load('arbridge.int');
    const near = new Interpreter(hooks({ opcodeHandlers: gameStubs(true, 2) }));
    const far = new Interpreter(hooks({ opcodeHandlers: gameStubs(true, 50) }));
    expect(near.run(new ScriptInstance(script), 'checkPartyMembersNearDoor')).toEqual({
      t: 'int',
      v: 1,
    });
    expect(far.run(new ScriptInstance(script), 'checkPartyMembersNearDoor')).toEqual({
      t: 'int',
      v: 0,
    });
  });
});
