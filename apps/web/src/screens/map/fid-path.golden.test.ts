import { describe, expect, it } from 'vitest';
import { openGameFolderNode } from '../../../../../packages/vfs/src/node';
import { animFileChars } from '@f2/engine-core';

const dir = process.env.F2_GAME_DIR;

/** Znane sufiksy bez odwzorowania (Z): 'au' wystepuje w danych, nie wiadomo ktore anim go uzywa. */
const KNOWN_UNMAPPED = new Set(['au']);

describe.skipIf(!dir)('fid-path golden: art/critters', () => {
  it('kazdy plik krytera ma sufiks osiagalny z (anim, bron) lub jest na liscie wyjatkow', async () => {
    const vfs = await openGameFolderNode(dir!);
    try {
      const reachable = new Set<string>();
      for (let anim = 0; anim <= 0x40; anim++) {
        for (let w = 0; w <= 10; w++) {
          const c = animFileChars(anim, w);
          if (c) reachable.add(c);
        }
      }
      const unreachable = new Map<string, number>();
      for (const f of vfs.list('art/critters/')) {
        if (f.endsWith('.lst')) continue;
        const suf = f.slice('art/critters/'.length + 6, 'art/critters/'.length + 8);
        if (!reachable.has(suf) && !KNOWN_UNMAPPED.has(suf))
          unreachable.set(suf, (unreachable.get(suf) ?? 0) + 1);
      }
      expect([...unreachable]).toEqual([]);
    } finally {
      await vfs.close();
    }
  }, 120_000);
});
