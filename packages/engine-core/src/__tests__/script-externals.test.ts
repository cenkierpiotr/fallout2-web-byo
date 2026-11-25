import { describe, expect, it } from 'vitest';
import {
  GameVars,
  ScriptRuntime,
  createGameView,
  createViewDialogHooks,
  type World,
} from '../index.js';

function runtime(): ScriptRuntime {
  const view = createGameView();
  const world = { map: { objects: [], header: {} }, view } as unknown as World;
  return new ScriptRuntime(
    world,
    {} as never,
    new GameVars(new Int32Array(10)),
    createViewDialogHooks(view),
    {
      vfs: {} as never,
      rng: () => 0,
    } as never,
  );
}

describe('zmienne zewnetrzne: nazwy bez rozrozniania wielkosci liter (D, specyfikacja formatu 0x4dece6)', () => {
  it('fetch "numDeathclaws" znajduje eksport "numDeathClaws"', () => {
    const rt = runtime();
    rt.exportVar('numDeathClaws');
    rt.setExternal('numDeathClaws', { t: 'int', v: 3 });
    expect(rt.getExternal('numDeathclaws')).toEqual({ t: 'int', v: 3 });
    expect(rt.getExternal('NUMDEATHCLAWS')).toEqual({ t: 'int', v: 3 });
    expect(rt.getExternal('inna')).toBeUndefined();
  });
  it('spacja koncowa jest znaczaca ("Fighter " != "Fighter")', () => {
    const rt = runtime();
    rt.exportVar('Fighter');
    expect(rt.getExternal('Fighter ')).toBeUndefined();
  });
});
