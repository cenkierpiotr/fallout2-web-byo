import { describe, expect, it } from 'vitest';
import { parseInt as parseIntScript, type IntScript } from '@f2/formats';
import { Interpreter, ScriptInstance, gameHandlers, type GameHooks, type Value } from '@f2/vm';
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

/** Mock hookow gry: wszystko zwraca 0/pusty string; `unsupported` zapisuje nazwy (PK-M3b). */
function mockHooks(unsupported: string[]): GameHooks {
  const base: Record<string, unknown> = {
    getLocalVar: () => 0,
    setLocalVar: () => {},
    getMapVar: () => 0,
    setMapVar: () => {},
    getGlobalVar: () => 0,
    setGlobalVar: () => {},
    messageStr: () => '',
    objName: () => '',
    metarule: () => ({ t: 'int', v: 0 }),
    metarule3: () => ({ t: 'int', v: 0 }),
    unsupported: (name: string): Value => {
      unsupported.push(name);
      return { t: 'int', v: 0 };
    },
    opcodeHandlers: gameHandlers,
  };
  return new Proxy(base, {
    get: (t, k) => (k in t ? t[k as string] : () => 0),
  }) as unknown as GameHooks;
}

describe.skipIf(!dir)('dry-run opkodow gry na prawdziwych skryptach (Z30 krok 5)', () => {
  for (const name of ['artemple.int']) {
    it(`test_dryrun_${name}_start_and_map_enter_without_vmerror`, async () => {
      const unsupported: string[] = [];
      const script = await load(name);
      const inst = new ScriptInstance(script);
      const interp = new Interpreter(mockHooks(unsupported));
      for (const proc of ['start', 'map_enter_p_proc']) {
        expect(() => interp.run(inst, proc)).not.toThrow();
      }
      // lista nieobsluzonych opkodow -> PK-M3b
      process.stdout.write(`unsupported(${name}): ${[...new Set(unsupported)].join(', ')}\n`);
    });
  }
});
