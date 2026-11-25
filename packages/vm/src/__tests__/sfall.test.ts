import { describe, expect, it } from 'vitest';
import {
  GlobalScriptRunner,
  HookScriptRunner,
  SFALL_OPCODES,
  SfallArrays,
  ValueStack,
  createSfallImpl,
  float,
  int,
  registerSfallOpcodes,
  str,
  type OpHandler,
} from '../index.js';

const op = (name: string): number => SFALL_OPCODES.find((d) => d.name === name)!.op;
const ctx = (stack: ValueStack, instance: unknown = {}) =>
  ({ stack, instance, hooks: {} }) as never;
const setup = () => {
  const map = new Map<number, OpHandler>();
  const impl = createSfallImpl();
  registerSfallOpcodes(map, impl, { enabled: true, log: () => {} });
  return { map, impl };
};

describe('sfall podzbior', () => {
  it('flaga domyslnie wylaczona: brak handlerow', () => {
    const map = new Map<number, OpHandler>();
    expect(registerSfallOpcodes(map, createSfallImpl())).toBe(0);
    expect(map.size).toBe(0);
  });

  it('nieobslugiwany opkod zdejmuje argumenty i wypycha 0', () => {
    const { map } = setup();
    const st = new ValueStack();
    st.push(int(5));
    map.get(op('read_int'))!(ctx(st));
    expect(st.popInt()).toBe(0);
  });

  it('opkody tablic i gvarow', () => {
    const { map, impl } = setup();
    const st = new ValueStack();
    const run = (n: string) => map.get(op(n))!(ctx(st));
    st.push(int(3));
    st.push(int(0));
    run('create_array');
    const id = st.popInt();
    st.push(int(id));
    st.push(int(1));
    st.push(int(42));
    run('set_array');
    st.push(int(id));
    st.push(int(1));
    run('get_array');
    expect(st.popInt()).toBe(42);
    st.push(int(id));
    run('len_array');
    expect(st.popInt()).toBe(3);
    st.push(str('GVAR_ABC'));
    st.push(int(7));
    run('set_sfall_global');
    expect(impl.globals.getInt('GVAR_ABC')).toBe(7);
    st.push(str('GVAR_ABC'));
    run('get_sfall_global_int');
    expect(st.popInt()).toBe(7);
  });

  it('serializacja i odtworzenie tablic', () => {
    const a = new SfallArrays();
    const id = a.create(2);
    a.set(id, 0, 5);
    a.set(id, 1, 'x');
    const b = new SfallArrays();
    b.restore(JSON.parse(JSON.stringify(a.serialize())));
    expect(b.get(id, 0)).toBe(5);
    expect(b.get(id, 1)).toBe('x');
  });

  it('hook tohit nadpisuje wartosc', () => {
    const h = new HookScriptRunner();
    h.register('tohit', (c) =>
      HookScriptRunner.setReturn(c, 0, HookScriptRunner.getArg(c, 0) + 10),
    );
    expect(h.on('tohit', 50)).toEqual({ handled: true, returns: [60] });
    expect(new HookScriptRunner().on('tohit', 50).handled).toBe(false);
  });

  it('global scripts: liczy gl_*.int i tickuje', async () => {
    let runs = 0;
    const r = new GlobalScriptRunner();
    const n = await r.load({
      list: () => ['scripts/gl_a.int', 'scripts/GL_B.INT', 'scripts/other.int', 'scripts/gl_a.int'],
      start: () => ({ instance: {}, run: () => void runs++ }),
    });
    expect(n).toBe(2);
    r.tick();
    expect(runs).toBe(2);
  });

  it('nowe opkody RPU: abs, array_key, arrayexpr, get_ini_setting, sprintf, list_as_array, metarule2_explosions', () => {
    const { map, impl } = setup();
    const st = new ValueStack();
    const run = (n: string) => map.get(op(n))!(ctx(st));

    // abs (int i float)
    st.push(int(-17));
    run('abs');
    expect(st.popInt()).toBe(17);
    st.push(float(-2.5));
    run('abs');
    expect(st.pop()).toEqual(float(2.5));

    // get_ini_setting -> -1
    st.push(str('mods\\upu.ini|main|wipe_inventory'));
    run('get_ini_setting');
    expect(st.popInt()).toBe(-1);

    // sprintf
    st.push(str('val=%d'));
    st.push(int(99));
    run('sprintf');
    expect(st.pop()).toEqual(str('val=99'));

    // temp_array + arrayexpr + array_key
    st.push(int(-1));
    st.push(int(1));
    run('temp_array');
    const arrId = st.popInt();
    st.push(str('k1'));
    st.push(int(123));
    run('arrayexpr');
    expect(st.popInt()).toBe(0);
    expect(impl.arrays.get(arrId, 'k1')).toBe(123);
    st.push(int(arrId));
    st.push(int(0));
    run('array_key');
    expect(st.pop()).toEqual(str('k1'));

    // list_as_array zwraca prawidlowe id pustej tablicy
    st.push(int(0));
    run('list_as_array');
    const listId = st.popInt();
    expect(listId).toBeGreaterThan(0);
    expect(impl.arrays.len(listId)).toBe(0);

    // metarule2_explosions (3 pops, 1 push)
    st.push(int(1));
    st.push(int(2));
    st.push(int(3));
    run('metarule2_explosions');
    expect(st.popInt()).toBe(0);
    expect(st.depth()).toBe(0);
  });
});
