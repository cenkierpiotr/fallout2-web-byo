import { describe, expect, it } from 'vitest';
import { parseInt as parseIntScript, type IntScript } from '@f2/formats';
import { openGameFolderNode } from '@f2/vfs/node';
import { disassemble, opcodeStats, type DisasmInput } from '../int-disasm.js';

const dir = process.env.F2_GAME_DIR;
const patchDir = process.env.F2_PATCH_DIR;

function synth(bytes: number[], codeOffset = 0): DisasmInput {
  const u = new Uint8Array(bytes);
  return { name: 'synth.int', code: new DataView(u.buffer), codeOffset };
}

describe('disassemble syntetyczne', () => {
  it('pushInt ma argument, kolejne offsety', () => {
    const r = disassemble(synth([0x80, 0x02, 0xc0, 0x01, 0, 0, 0, 0x12, 0x80, 0x0d], 10));
    expect(r.map((i) => [i.offset, i.op, i.arg])).toEqual([
      [0, 0x8002, undefined],
      [2, 0xc001, 0x12],
      [8, 0x800d, undefined],
    ]);
    expect(r[0]?.def?.name).toBe('critical_begin');
  });
  it('rzuca na brak bitu 0x8000 i na ucięty argument', () => {
    expect(() => disassemble(synth([0x00, 0x12], 0))).toThrow();
    expect(() => disassemble(synth([0xc0, 0x01, 0, 0], 0))).toThrow();
  });
  it('test_opcodeStats_counts_and_scripts', () => {
    const a = synth([0x80, 0x03, 0x80, 0x03, 0xc0, 0x01, 0, 0, 0, 1]);
    const b = synth([0x80, 0x03]);
    const { byOp, unknownCore } = opcodeStats([a, b]);
    expect(byOp.get(0x8003)).toEqual({ count: 3, scripts: 2, name: 'critical_end' });
    expect(byOp.get(0xc001)).toMatchObject({ count: 1, scripts: 1 });
    expect(unknownCore).toEqual([]);
    expect(opcodeStats([synth([0x80, 0x7f])]).unknownCore).toEqual([]);
    expect(opcodeStats([synth([0x80, 0x4c + 0x500 - 0x500])]).unknownCore).toEqual([]);
  });
});

describe.skipIf(!dir)('disassemble golden', () => {
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

  it('test_disassemble_artemple_no_unknown_core', async () => {
    const instr = disassemble(await load('artemple.int'));
    expect(instr.length).toBeGreaterThan(100);
    expect(instr.every((i) => i.def || i.op >= 0x8100)).toBe(true);
  });
  it('test_disassemble_covers_whole_code_section', async () => {
    const s = await load('artemple.int');
    const instr = disassemble(s);
    const last = instr[instr.length - 1]!;
    expect(last.offset + 2 + (last.arg !== undefined ? 4 : 0)).toBe(s.code.byteLength);
  });
  it('test_disassemble_pushInt_0xC001_has_arg', async () => {
    const instr = disassemble(await load('artemple.int'));
    expect(instr.slice(0, 6).map((i) => [i.op, i.arg])).toEqual([
      [0x8002, undefined],
      [0xc001, 0x12],
      [0x800d, undefined],
      [0xc001, 0x2ae],
      [0x8004, undefined],
      [0x8010, undefined],
    ]);
  });
});
