import { describe, expect, it } from 'vitest';
import { openGameFolderNode } from '@f2/vfs/node';
import { resolveFixes } from '@f2/rules';
import { CLASSIC_RULES, DEFAULT_RULES, rulesFromFixes } from '../rules.js';
import { ProtoCache } from '../proto-cache.js';

describe('rulesFromFixes', () => {
  it('pathNodeLimit wlaczony daje limit domyslny, wylaczony klasyczny', () => {
    expect(rulesFromFixes(resolveFixes({}))).toBe(DEFAULT_RULES);
    expect(rulesFromFixes(resolveFixes({ pathNodeLimit: false }))).toBe(CLASSIC_RULES);
    expect(rulesFromFixes(resolveFixes({}, true))).toBe(CLASSIC_RULES);
  });
});

const g = process.env.F2_GAME_DIR;
const p = process.env.F2_PATCH_DIR;
describe.skipIf(!g || !p)('ProtoCache + poprawki (golden, patch 1.02.25)', () => {
  it('flagi steruja wartosciami prototypu Reactor Guard (PID 102)', async () => {
    const vfs = await openGameFolderNode(g!, p!);
    try {
      const pid = 0x01000000 + 102;
      const on = await new ProtoCache(vfs, resolveFixes({})).get(pid);
      const off = await new ProtoCache(vfs, resolveFixes({ protoNoBarterFlag: false })).get(pid);
      const raw = await new ProtoCache(vfs).get(pid);
      expect(on.kind === 'critter' && on.critterFlags).toBe(0);
      expect(off.kind === 'critter' && off.critterFlags).toBe(2);
      expect(raw.kind === 'critter' && raw.critterFlags).toBe(0); // surowy plik z patcha
    } finally {
      await vfs.close();
    }
  }, 60_000);
});
