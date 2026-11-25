import { describe, expect, it } from 'vitest';
import {
  GameClock,
  GameVars,
  MovementSystem,
  ScriptRuntime,
  createGameView,
  createViewDialogHooks,
  type GameObject,
  type MessageSource,
  type ScriptInstance,
  type World,
} from '../index.js';
import { emptyMap, fake } from './helpers.js';

type Priv = {
  objects: Map<number, GameObject>;
  critterArt: string[];
  critterArtLoading: boolean;
  scheduler: { entryOf(i: ScriptInstance): { ownerObjectId: number } | undefined };
};

function mk(withBuilders: boolean) {
  const map = emptyMap();
  const player = fake(1, 100, 0, { kind: 'critter', flags: 0, raw: new Int32Array(0) });
  const world = {
    map,
    player,
    clock: new GameClock(),
    movement: new MovementSystem(map),
    loader: {} as World['loader'],
    view: createGameView(),
  } as World;
  const calls: string[] = [];
  const rt = new ScriptRuntime(
    world,
    {} as MessageSource,
    new GameVars(new Int32Array(10)),
    createViewDialogHooks(world.view!),
    {
      vfs: {} as never,
      ...(withBuilders
        ? {
            sfxNames: {
              charName: (b, a, w, e) => {
                calls.push(`c:${b}:${a}:${w}:${e}`);
                return `${b}X${a}`;
              },
              weaponName: (i) => {
                calls.push(`w:${i.action}:${i.weaponChar}:${i.hitMode}:${i.material}`);
                return i.weaponChar ? 'WXYZ' : null;
              },
            },
          }
        : {}),
    },
  );
  const p = rt as unknown as Priv;
  p.critterArtLoading = true; // bez ladowania critters.lst z VFS
  return { rt, p, player, calls };
}

describe('ScriptRuntime: hooki sfx_build_*', () => {
  it('sfx_build_char_name: baza z listy art wg FID, tylko krytery', () => {
    const { rt, p, calls } = mk(true);
    p.critterArt = ['HMWARR', 'HFJMPS'];
    const c = fake(1, 5);
    c.fid = (1 << 24) | (2 << 12) | 1;
    p.objects.set(7, c);
    expect(rt.sfxBuildCharName(7, 0, 0)).toBe('HFJMPSX0');
    expect(calls[0]).toBe('c:HFJMPS:0:2:0');
    const item = fake(0, 6);
    item.fid = 1;
    p.objects.set(8, item);
    expect(rt.sfxBuildCharName(8, 0, 0)).toBe('');
    expect(rt.sfxBuildCharName(99, 0, 0)).toBe('');
    c.fid = (1 << 24) | 50; // poza lista
    expect(rt.sfxBuildCharName(7, 0, 0)).toBe('');
  });

  it('sfx_build_char_name/weapon_name: bez generatorow zwracaja pusty string', () => {
    const { rt, p } = mk(false);
    p.critterArt = ['HMWARR'];
    const c = fake(1, 5);
    c.fid = 1 << 24;
    p.objects.set(7, c);
    expect(rt.sfxBuildCharName(7, 0, 0)).toBe('');
    expect(rt.sfxBuildWeaponName(0, -1, 0, -1)).toBe('');
  });

  it('sfx_build_weapon_name: brak broni daje W<akcja>, material celu-krytera = -1', () => {
    const { rt, p, calls } = mk(true);
    expect(rt.sfxBuildWeaponName(2, -1, 0, -1)).toBe('WO');
    const t = fake(1, 5);
    t.fid = 1 << 24;
    p.objects.set(9, t);
    rt.sfxBuildWeaponName(4, -1, 1, 9);
    expect(calls[calls.length - 1]).toBe('w:4::1:-1');
  });

  it('terminate_combat: wola host walki z id wlasciciela skryptu, bez hosta nic', () => {
    const { rt, p } = mk(true);
    const inst = {} as ScriptInstance;
    p.scheduler.entryOf = () => ({ ownerObjectId: 42 });
    expect(() => rt.terminateCombat(inst)).not.toThrow();
    const got: number[] = [];
    rt.onTerminateCombat = (id) => got.push(id);
    rt.terminateCombat(inst);
    expect(got).toEqual([42]);
  });
});
