import { describe, expect, it } from 'vitest';
import { FormatError } from '../errors.js';
import { parseInt, SYSTEM_PROCS } from '../int.js';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { openGameFolderNode } from '../../../vfs/src/node.js';

const dir = process.env.F2_GAME_DIR;
const patchDir = process.env.F2_PATCH_DIR;

function toBuf(u: Uint8Array): ArrayBuffer {
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
}

async function load(name: string) {
  const vfs = await openGameFolderNode(dir!, patchDir);
  try {
    return { buf: toBuf(await vfs.open(`scripts/${name}`)), name };
  } finally {
    await vfs.close?.();
  }
}

describe('SYSTEM_PROCS', () => {
  it('test_SYSTEM_PROCS_length_and_order', () => {
    expect(SYSTEM_PROCS.length).toBe(28); // spec int-format.md: 28 slotow (brief mowil 23)
    expect(SYSTEM_PROCS[0]).toBe('no_p_proc');
    expect(SYSTEM_PROCS[1]).toBe('start');
    expect(SYSTEM_PROCS[11]).toBe('talk_p_proc');
    expect(SYSTEM_PROCS[15]).toBe('map_enter_p_proc');
    expect(SYSTEM_PROCS[SYSTEM_PROCS.length - 1]).toBe('combat_is_over_p_proc');
  });
});

describe('parseInt syntetyczne', () => {
  it('test_parseInt_rejects_truncated', () => {
    expect(() => parseInt(new ArrayBuffer(10), 'x.int')).toThrow(FormatError);
    const b = new Uint8Array(0x40);
    b[0] = 0x80;
    b[1] = 0x02;
    new DataView(b.buffer).setUint32(0x2a, 1000);
    expect(() => parseInt(b.buffer, 'x.int')).toThrow(FormatError);
  });
});

describe.skipIf(!dir || !patchDir)('parseInt na prawdziwych skryptach', () => {
  it('test_parseInt_artemple_has_start_and_map_enter', async () => {
    const f = await load('artemple.int');
    const s = parseInt(f.buf, f.name);
    expect(s.procByName.has('start')).toBe(true);
    expect(s.procByName.has('map_enter_p_proc')).toBe(true);
  });
  it('test_parseInt_acklint_has_talk_p_proc', async () => {
    const f = await load('acklint.int');
    const s = parseInt(f.buf, f.name);
    expect(s.procByName.has('talk_p_proc')).toBe(true);
    expect(s.procs.length).toBe(22);
  });
  it('test_parseInt_proc_offsets_inside_code', async () => {
    const f = await load('acklint.int');
    const s = parseInt(f.buf, f.name);
    for (const p of s.procs) expect(p.bodyOffset).toBeLessThan(s.code.byteLength);
    expect(s.codeOffset).toBeLessThanOrEqual(s.code.byteLength);
  });
  it('test_parseInt_strings_section_decoded', async () => {
    const f = await load('acklint.int');
    const s = parseInt(f.buf, f.name);
    expect(s.strings.length).toBeGreaterThanOrEqual(1);
    expect(s.strings.every((x) => typeof x === 'string')).toBe(true);
    expect(s.codeOffset).toBeGreaterThan(0);
    expect(s.identifiers).toContain('talk_p_proc');
  });
});

describe.skipIf(!dir || !patchDir)('parseInt golden na wszystkich skryptach', () => {
  it('test_parseInt_all_scripts_golden', async () => {
    const vfs = await openGameFolderNode(dir!, patchDir);
    const names = vfs.list('scripts/').filter((n) => n.toLowerCase().endsWith('.int'));
    expect(names.length).toBe(1454);
    let procTotal = 0;
    const out: Record<string, unknown> = {};
    for (const n of names) {
      const bytes = await vfs.open(n);
      const s = parseInt(toBuf(bytes), n);
      procTotal += s.procs.length;
      for (const p of s.procs) expect(p.name.length).toBeGreaterThan(0);
      out[n] = {
        sha256: createHash('sha256').update(bytes).digest('hex'),
        procs: s.procs.length,
        identifiers: s.identifiers.length,
        strings: s.strings.length,
        codeOffset: s.codeOffset,
        names: s.procs.map((p) => p.name).join(','),
      };
    }
    expect(procTotal).toBe(34481);
    const gp = new URL('../../../../tests/golden/int.json', import.meta.url);
    if (!existsSync(gp) || process.env.UPDATE_GOLDEN) {
      const { writeFileSync } = await import('node:fs');
      writeFileSync(gp, JSON.stringify(out, null, 1) + '\n');
    }
    const golden = JSON.parse(readFileSync(gp, 'utf8'));
    expect(out).toEqual(golden);
  }, 120000);
});
