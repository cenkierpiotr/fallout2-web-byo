import { describe, expect, it, vi } from 'vitest';
import {
  Interpreter,
  ScriptInstance,
  gameHandlers,
  gapHandlers,
  type OpHandler,
} from '../index.js';
import { RET, buildInt, type Item } from './fixtures/build-int.js';

const P = (n: number): Item => ({ push: n });
const SETG = 0x80c6;

function run(code: Item[], over: Record<string, unknown> = {}, store = true) {
  const globals: number[] = [];
  const merged = new Map<number, OpHandler>(gameHandlers);
  for (const [k, v] of gapHandlers) merged.set(k, v);
  const hooks = {
    getLocalVar: () => 0,
    setLocalVar: () => {},
    getMapVar: () => 0,
    setMapVar: () => {},
    getGlobalVar: (i: number) => globals[i] ?? 0,
    setGlobalVar: (i: number, v: number) => void (globals[i] = v),
    unsupported: vi.fn(() => ({ t: 'int', v: 0 })),
    opcodeHandlers: merged,
    ...over,
  };
  const script = buildInt('t', [
    { name: 'start', code: store ? [P(0), ...code, SETG, P(0), ...RET] : [...code, P(0), ...RET] },
  ]);
  const inst = new ScriptInstance(script);
  new Interpreter(hooks as never).run(inst, 'start');
  return { hooks, inst, g0: globals[0] };
}

describe('opkody domykajace luki bramki', () => {
  it('art_anim zwraca typ animacji z FID (bity 16..23)', () => {
    expect(run([P(0x01020304), 0x814a]).g0).toBe(0x02);
    expect(run([P(0x0000ffff), 0x814a]).g0).toBe(0);
  });
  it('inven_unwield wola hook z instancja, bez hooka zglasza unsupported', () => {
    const invenUnwield = vi.fn();
    const r = run([0x812c], { invenUnwield }, false);
    expect(invenUnwield).toHaveBeenCalledWith(r.inst);
    const r2 = run([0x812c], {}, false);
    expect(r2.hooks.unsupported).toHaveBeenCalledWith('inven_unwield', []);
  });
  it('terminate_combat wola hook (wzorzec z actemvil/mcslggrd: samotny opkod)', () => {
    const terminateCombat = vi.fn();
    const r = run([0x8153], { terminateCombat }, false);
    expect(terminateCombat).toHaveBeenCalledWith(r.inst);
  });
  it('inven_cmds 13 zwraca przedmiot pod indeksem, inne cmd 0', () => {
    const invenIndexPtr = vi.fn(() => 77);
    expect(run([P(5), P(13), P(2), 0x8109], { invenIndexPtr }).g0).toBe(77);
    expect(invenIndexPtr).toHaveBeenCalledWith(5, 2);
    expect(run([P(5), P(1), P(2), 0x8109], { invenIndexPtr }).g0).toBe(0);
  });
  it('inven_cmds bez przedmiotu zwraca null (setg zapisuje 0)', () => {
    expect(run([P(5), P(13), P(0), 0x8109], { invenIndexPtr: () => -1 }).g0).toBe(0);
  });
  it('print zdejmuje string i wola printText', () => {
    const printText = vi.fn();
    run([{ pushs: 'tekst' }, 0x806b], { printText }, false);
    expect(printText).toHaveBeenCalledWith('tekst');
  });
  it('sfx_build_char_name i sfx_build_weapon_name: domyslnie pusty string, stos poprawny', () => {
    const sfxBuildCharName = vi.fn(() => 'x');
    run([P(9), P(2), P(3), 0x813d], { sfxBuildCharName }, false);
    expect(sfxBuildCharName).toHaveBeenCalledWith(9, 2, 3);
    const sfxBuildWeaponName = vi.fn(() => 'w');
    run([P(1), P(2), P(3), P(4), 0x8141], { sfxBuildWeaponName }, false);
    expect(sfxBuildWeaponName).toHaveBeenCalledWith(1, 2, 3, 4);
  });
  it('sfall 0x815e-0x8161: staty krytera (nhmyron)', () => {
    const setCritterStat = vi.fn(() => 0);
    run([P(8), P(3), P(10), 0x815e], { setCritterStat }, false);
    expect(setCritterStat).toHaveBeenCalledWith(8, 3, 10);
    expect(run([P(8), P(3), 0x8160], { getCritterStat: () => 6 }).g0).toBe(6);
    const r = run([P(8), P(3), P(4), 0x815f], {}, false);
    expect(r.hooks.unsupported).toHaveBeenCalledWith('set_critter_extra_stat', expect.any(Array));
    const unsupported = vi.fn(() => ({ t: 'int', v: 5 }));
    expect(run([P(8), P(3), 0x8161], { unsupported }).g0).toBe(5);
  });
});
