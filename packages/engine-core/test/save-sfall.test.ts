/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import { finishToHit, BodyPart } from '@f2/rules';
import { SfallBinding, migrate } from '../src/index.js';
import { deserializeWorld, serializeWorld } from '../src/save/serialize.js';
import { arbitraryWorld } from './save-fixtures.js';

const meta = () => ({
  slot: 'quick',
  name: 'q',
  characterName: 'C',
  level: 1,
  location: 'L',
  gameDate: 'd',
  realTime: 1,
  thumbnail: null,
  engineVersion: '0',
});
const roundTrip = (w: ReturnType<typeof arbitraryWorld>) =>
  JSON.parse(JSON.stringify(serializeWorld(w, meta())));

describe('SfallBinding: flaga', () => {
  it('domyslnie wylaczony: brak impl, brak opkodow, hooki nie wolane, stan null', () => {
    const b = new SfallBinding();
    expect(b.enabled).toBe(false);
    expect(b.impl).toBeUndefined();
    const map = new Map();
    expect(b.register(map)).toBe(0);
    expect(map.size).toBe(0);
    expect(b.hook('tohit', 50)).toBeUndefined();
    expect(b.toHitHook()).toBeUndefined();
    expect(b.snapshot()).toBeNull();
  });

  it('wlaczony: opkody zarejestrowane, hook tohit zmienia wynik finishToHit', () => {
    const b = new SfallBinding({ enabled: true, log: () => {} });
    const map = new Map();
    expect(b.register(map)).toBeGreaterThan(0);
    const base = { skillAfterDistance: 60, part: BodyPart.Torso };
    expect(finishToHit({ ...base, onToHit: b.toHitHook() })).toBe(finishToHit(base));
    b.impl!.hooks.register('tohit', (call) => {
      call.returns[0] = (call.args[0] ?? 0) + 100;
    });
    expect(finishToHit({ ...base, onToHit: b.toHitHook(1, 2, 3) })).toBe(95);
    b.impl!.hooks.unregisterAll();
    b.impl!.hooks.register('tohit', (call) => {
      call.returns[0] = 7;
    });
    expect(finishToHit({ ...base, onToHit: b.toHitHook() })).toBe(7);
  });
});

describe('zapis: pole sfall', () => {
  it('round-trip stanu sfall przez JSON i migrate', () => {
    const b = new SfallBinding({ enabled: true, log: () => {} });
    b.impl!.globals.set('ABCDEFGH', 42);
    const id = b.impl!.arrays.create(2);
    b.impl!.arrays.set(id, 1, 9);
    const w = arbitraryWorld(3);
    w.sfall = b.snapshot();
    const save = migrate(roundTrip(w)) as any;
    expect(save.schemaVersion).toBe(7);
    const back = deserializeWorld(save);
    expect(back.sfall).toEqual(w.sfall);
    const b2 = new SfallBinding({ enabled: true });
    b2.restore(back.sfall);
    expect(b2.impl!.globals.getInt('ABCDEFGH')).toBe(42);
    expect(b2.impl!.arrays.get(id, 1)).toBe(9);
  });

  it('zapis bez sfall (starszy/wylaczony): brak pola, migrate przechodzi, restore no-op', () => {
    const w = arbitraryWorld(4);
    const save = roundTrip(w);
    expect(save.sfall).toBeUndefined();
    const back = deserializeWorld(migrate(save) as any);
    expect(back.sfall).toBeUndefined();
    new SfallBinding().restore(back.sfall);
    new SfallBinding({ enabled: true }).restore(back.sfall);
  });

  it('wylaczony sfall ignoruje stan z zapisu', () => {
    const on = new SfallBinding({ enabled: true });
    on.impl!.globals.set('ABCDEFGH', 1);
    const off = new SfallBinding();
    off.restore(on.snapshot());
    expect(off.snapshot()).toBeNull();
  });

  it('zly ksztalt sfall = save-corrupt', () => {
    const w = arbitraryWorld(5);
    const save = roundTrip(w);
    expect(migrate({ ...save, sfall: { version: 2 } })).toEqual({ error: 'save-corrupt' });
    expect(
      migrate({
        ...save,
        sfall: { version: 1, globals: { a: 'x' }, arrays: [], globalScripts: [] },
      }),
    ).toEqual({
      error: 'save-corrupt',
    });
  });
});
