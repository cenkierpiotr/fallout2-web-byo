import { describe, expect, it, vi } from 'vitest';
import type { ScriptInstance } from '@f2/vm';
import { BattleModel } from '../battle-model.js';
import { critterInjure, critterState } from '../critter-model.js';
import { fake } from './helpers.js';

const raw = (hp: number): Int32Array => Int32Array.from([0, 0, 0, 0, 0, 0, 0, hp]);
const crit = (hp: number) => fake(1, 100, 0, { kind: 'critter', flags: 0, raw: raw(hp) });

function model(
  objs: ReturnType<typeof crit>[],
  runUseProc = vi.fn(() => false),
  extra: {
    defaultUse?: (s: number, t: number) => boolean;
    runUseP?: () => boolean;
    dropToGround?: (o: number, i: number) => boolean;
    setReturn?: () => void;
  } = {},
) {
  return new BattleModel({
    obj: (id) => objs.find((o) => o.id === id),
    maxHp: () => 50,
    selfOf: () => 77,
    runUseProc,
    runUseP: extra.runUseP ?? (() => false),
    ...(extra.defaultUse ? { defaultUse: extra.defaultUse } : {}),
    setReturn: extra.setReturn ?? (() => undefined),
    dropToGround: extra.dropToGround ?? (() => false),
  });
}

describe('BattleModel', () => {
  it('critter_damage: obrazenia zmniejszaja HP, smierc przy HP <= 0', () => {
    const c = crit(20);
    const m = model([c]);
    m.critterDamage(c.id, 5, 0);
    expect(critterState(c)).toBe(0);
    m.critterDamage(c.id, 15, 0);
    expect(critterState(c)).toBe(1);
    expect(m.deaths).toEqual([c.id]);
  });
  it('niesmiertelny nie ginie z flaga DEAD', () => {
    const c = crit(5);
    c.flags |= 0x400;
    model([c]).critterDamage(c.id, 100, 0);
    expect(c.flags & 0x400).toBe(0x400);
  });
  it('ujemne obrazenia nie lecza; nie-krytter ignorowany', () => {
    const c = crit(10);
    const m = model([c]);
    m.critterDamage(c.id, -9, 0);
    expect(critterState(c)).toBe(0);
    m.critterDamage(999, 5, 0);
    expect(m.deaths).toEqual([]);
  });
  it('critter_injure nie sprawdza smierci (D: 0x45ae8c tylko ustawia flagi + odswieza UI gracza)', () => {
    const c = crit(1);
    critterInjure(c, 0x04, false);
    expect(critterState(c)).toBe(0x04);
  });
  it('attack/attack_setup/explosion zapisuja zadania', () => {
    const m = model([]);
    m.attack({} as ScriptInstance, 5, [1, 2, 3, 4, 5, 6, 7]);
    m.attackSetup({} as ScriptInstance, 6, 7);
    m.explosion(20100, 0, 30);
    expect(m.requests.map((r) => r.kind)).toEqual(['attack', 'attackSetup', 'explosion']);
    expect(m.requests[0]).toMatchObject({ source: 77, target: 5 });
  });
  it('explosion: zapisuje zadanie i wywoluje hook wykonania; kafel -1 pomijany', () => {
    const explode = vi.fn();
    const m = new BattleModel({
      obj: () => undefined,
      maxHp: () => 50,
      selfOf: () => 77,
      runUseProc: () => false,
      runUseP: () => false,
      setReturn: () => undefined,
      dropToGround: () => false,
      explode,
    });
    m.explosion(20100, 1, 30);
    m.explosion(-1, 0, 5);
    expect(explode).toHaveBeenCalledTimes(1);
    expect(explode).toHaveBeenCalledWith(20100, 1, 30);
    expect(m.requests).toHaveLength(2);
  });
  it('pickup_obj: wola hook pickup dla self_obj, wynik w lastPickup; bez wlasciciela nic', () => {
    const pickup = vi.fn(() => -6);
    const m = new BattleModel({
      obj: () => undefined,
      maxHp: () => 50,
      selfOf: () => 77,
      runUseProc: () => false,
      runUseP: () => false,
      setReturn: () => undefined,
      dropToGround: () => false,
      pickup,
    });
    m.pickupObj({} as ScriptInstance, 9);
    expect(pickup).toHaveBeenCalledWith(77, 9);
    expect(m.lastPickup).toBe(-6);
  });
  it('use_obj_on_obj: nadpisanie przez skrypt = brak domyslnego efektu', () => {
    const run = vi.fn(() => true);
    const m = model([], run);
    m.useObjOnObj({} as ScriptInstance, 3, 4);
    expect(run).toHaveBeenCalledWith(77, 3, 4);
    expect(m.requests).toEqual([]);
    const m2 = model([]);
    m2.useObjOnObj({} as ScriptInstance, 3, 4);
    expect(m2.requests[0]?.kind).toBe('useObjOnObj');
  });
  it('use_obj: use_p_proc nadpisuje, inaczej zadanie useObj', () => {
    const m = model([], undefined, { runUseP: () => true });
    m.useObj({} as ScriptInstance, 9);
    expect(m.requests).toEqual([]);
    const m2 = model([]);
    m2.useObj({} as ScriptInstance, 9);
    expect(m2.requests[0]).toMatchObject({ kind: 'useObj', source: 77, target: 9 });
  });
  it('use_obj: domyslne uzycie (hook gry) obsluguje i nie zapisuje zadania; false = zadanie', () => {
    const du = vi.fn(() => true);
    const m = model([], undefined, { defaultUse: du });
    m.useObj({} as ScriptInstance, 9);
    expect(du).toHaveBeenCalledWith(77, 9);
    expect(m.requests).toEqual([]);
    const m2 = model([], undefined, { defaultUse: () => false });
    m2.useObj({} as ScriptInstance, 9);
    expect(m2.requests[0]?.kind).toBe('useObj');
    // use_p_proc nadpisujacy ma pierwszenstwo przed domyslnym uzyciem
    const du2 = vi.fn(() => true);
    model([], undefined, { runUseP: () => true, defaultUse: du2 }).useObj({} as ScriptInstance, 9);
    expect(du2).not.toHaveBeenCalled();
  });
  it('drop_obj: deleguje na dropToGround z self_obj; scr_return zapisuje wartosc', () => {
    const drop = vi.fn(() => true);
    const ret = vi.fn();
    const m = model([], undefined, { dropToGround: drop, setReturn: ret });
    m.dropObj({} as ScriptInstance, 5);
    expect(drop).toHaveBeenCalledWith(77, 5);
    m.scrReturn({} as ScriptInstance, 3);
    expect(ret).toHaveBeenCalled();
  });
});
