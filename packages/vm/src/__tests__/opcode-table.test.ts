import { describe, expect, it } from 'vitest';
import { OPCODES, hasInlineArg } from '../opcode-table.js';

describe('OPCODES', () => {
  it('zawiera 348 unikalnych opkodow', () => {
    expect(OPCODES.size).toBe(348);
  });
  it('zna kluczowe opkody', () => {
    expect(OPCODES.get(0x8004)).toMatchObject({
      name: 'jmp',
      pops: 1,
      pushes: 0,
      kind: 'core',
      status: 'D',
    });
    expect(OPCODES.get(0x8039)).toMatchObject({ name: 'add', pops: 2, pushes: 1 });
    expect(OPCODES.get(0x8154)).toMatchObject({ name: 'debug_msg', kind: 'game' });
    expect(OPCODES.get(0x8001)?.inlineArg).toBe('i32');
  });
  it('inline arg dla indeksu 1', () => {
    expect(hasInlineArg(0xc001)).toBe(true);
    expect(hasInlineArg(0x9001)).toBe(true);
    expect(hasInlineArg(0xa001)).toBe(true);
    expect(hasInlineArg(0x8002)).toBe(false);
  });
});
