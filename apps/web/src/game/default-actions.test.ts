import { describe, expect, it } from 'vitest';
import { indexObject, isDoorOpen, type GameMap, type GameObject } from '@f2/engine-core';
import {
  doorKeyId,
  hasKeyFor,
  defaultPush,
  defaultUse,
  hasDefaultUse,
  stairsTarget,
} from './default-actions';
import { inReach, planApproach } from './approach';

const emptyMap = (): GameMap =>
  ({
    name: 'T',
    header: { playerHex: 20100, playerElevation: 0, playerOrientation: 0 },
    tiles: [{ floor: new Uint16Array(0), roof: new Uint16Array(0) }, null, null],
    objects: [],
    byHex: new Map(),
    globalVars: new Int32Array(0),
    localVars: new Int32Array(0),
    scripts: [],
    exitGrids: [],
  }) as unknown as GameMap;

let nid = 1;
const mk = (type: number, hex: number, over: Partial<GameObject> = {}): GameObject =>
  ({
    id: nid++,
    pid: type << 24,
    fid: 0,
    type,
    hex,
    elevation: 0,
    rotation: 0,
    frame: 0,
    flags: 0,
    protoFlags: 0,
    scriptId: -1,
    localVars: new Int32Array(0),
    inventory: [],
    proto: { kind: type === 1 ? 'critter' : 'scenery' } as never,
    extra: { kind: 'misc', flags: 0 },
    hidden: false,
    ...over,
  }) as unknown as GameObject;
const put = (m: GameMap, o: GameObject): GameObject => {
  m.objects.push(o);
  indexObject(m, o);
  return o;
};
const door = (hex: number, bits = 0): GameObject =>
  mk(2, hex, {
    extra: { kind: 'door', subtype: 0, flags: 0, raw: new Int32Array([bits]) } as never,
  });

describe('defaultUse', () => {
  it('drzwi: otwiera i zamyka', () => {
    const m = emptyMap();
    const d = put(m, door(100));
    const p = put(m, mk(1, 101));
    const deps = { map: () => m, player: () => p };
    expect(hasDefaultUse(d)).toBe(true);
    expect(defaultUse(d, deps)).toBeNull();
    expect(isDoorOpen(d)).toBe(true);
    expect(defaultUse(d, deps)).toBeNull();
    expect(isDoorOpen(d)).toBe(false);
  });
  it('drzwi zamkniete na klucz: komunikat, bez zmiany', () => {
    const m = emptyMap();
    const d = put(m, door(100, 0x2));
    expect(defaultUse(d, { map: () => m, player: () => mk(1, 101) })).toEqual({
      key: 'menu.locked',
    });
    expect(isDoorOpen(d)).toBe(false);
  });
  it('zamykanie blokuje krytera w przejsciu', () => {
    const m = emptyMap();
    const d = put(m, door(100));
    const deps = { map: () => m, player: () => mk(1, 101) };
    defaultUse(d, deps);
    put(m, mk(1, 100));
    expect(defaultUse(d, deps)).toEqual({ key: 'menu.doorBlocked' });
    expect(isDoorOpen(d)).toBe(true);
  });
  it('skrzynia: otwiera okno lootu; zamknieta = komunikat', () => {
    const m = emptyMap();
    const item = mk(2, 100, { inventory: [mk(0, -1)] });
    let opened = 0;
    const deps = {
      map: () => m,
      player: () => mk(1, 101),
      openContainer: () => (opened++, { ok: true }),
    };
    expect(defaultUse(item, deps)).toBeNull();
    expect(opened).toBe(1);
    const locked = mk(2, 100, {
      inventory: [mk(0, -1)],
      extra: { kind: 'scenery', subtype: 0, flags: 0x2, raw: new Int32Array(0) } as never,
    });
    expect(defaultUse(locked, deps)).toEqual({ key: 'menu.locked' });
    expect(opened).toBe(1);
  });
  it('zwykla sceneria bez danych: undefined (Nic sie nie dzieje)', () => {
    const m = emptyMap();
    expect(defaultUse(mk(2, 100), { map: () => m, player: () => mk(1, 101) })).toBeUndefined();
  });
  it('schody tylko gdy kafel docelowy != -1; kolejnosc pliku [kafel, mapa]', () => {
    const none = mk(2, 100, { extra: { kind: 'stairs', raw: new Int32Array([-1, -1]) } as never });
    expect(stairsTarget(none)).toBeUndefined();
    const built = (1 << 29) | (3 << 26) | 20100;
    const ok = mk(2, 100, { extra: { kind: 'stairs', raw: new Int32Array([built, 5]) } as never });
    expect(stairsTarget(ok)).toEqual({ mapIndex: 5, hex: 20100, elevation: 1, rotation: 3 });
  });
  it('drabina: kolejnosc pliku [mapa, kafel], mapa 0 = ruch w obrebie mapy', () => {
    const built = 0x2c002dc1 | 0;
    const same = mk(2, 100, {
      extra: { kind: 'ladder', raw: new Int32Array([0, built]) } as never,
    });
    expect(stairsTarget(same)).toEqual({ mapIndex: 0, hex: 0x2dc1, elevation: 1, rotation: 3 });
    const other = mk(2, 100, {
      extra: { kind: 'ladder', raw: new Int32Array([0x4f, built]) } as never,
    });
    expect(stairsTarget(other)?.mapIndex).toBe(0x4f);
    const none = mk(2, 100, { extra: { kind: 'ladder', raw: new Int32Array([0, -1]) } as never });
    expect(stairsTarget(none)).toBeUndefined();
  });
});

describe('defaultPush', () => {
  it('towarzysz zamienia sie miejscami z graczem', () => {
    const m = emptyMap();
    const p = put(m, mk(1, 100));
    const c = put(m, mk(1, 101));
    expect(defaultPush(c, { map: () => m, player: () => p, isParty: () => true })).toBeNull();
    expect([p.hex, c.hex]).toEqual([101, 100]);
  });
  it('obcy NPC: komunikat', () => {
    const m = emptyMap();
    const p = put(m, mk(1, 100));
    const c = put(m, mk(1, 101));
    expect(defaultPush(c, { map: () => m, player: () => p })).toEqual({ key: 'menu.pushNoEffect' });
    expect(c.hex).toBe(101);
  });
});

describe('approach', () => {
  it('w zasiegu: here; inny poziom: none', () => {
    const p = mk(1, 100);
    expect(inReach(p, mk(2, 101))).toBe(true);
    expect(planApproach(emptyMap(), p, mk(2, 101))).toEqual({ kind: 'here' });
    expect(planApproach(emptyMap(), p, mk(2, 101, { elevation: 1 }))).toEqual({
      kind: 'none',
      reason: 'tooFar',
    });
  });
  it('daleko: plan marszu do heksa blisko celu', () => {
    const m = emptyMap();
    const p = put(m, mk(1, 20100));
    const d = put(m, door(20100 + 7 + 400 * 3));
    const plan = planApproach(m, p, d);
    expect(plan.kind).toBe('walk');
  });
});

describe('klucze na drzwiach', () => {
  const keyDoor = (hex: number, key: number): GameObject =>
    mk(2, hex, {
      extra: { kind: 'door', subtype: 0, flags: 0, raw: new Int32Array([2]) } as never,
      proto: { kind: 'scenery', subtype: 0, data: [0, key] } as never,
    });
  const keyItem = (id: number): GameObject =>
    mk(0, -1, { proto: { kind: 'item', subtype: 6, data: [id >>> 0] } as never });

  it('pasujacy klucz odblokowuje i otwiera', () => {
    const m = emptyMap();
    const d = put(m, keyDoor(100, 7));
    const p = put(m, mk(1, 101));
    p.inventory.push(keyItem(7));
    expect(doorKeyId(d)).toBe(7);
    expect(hasKeyFor(p, d)).toBe(true);
    expect(defaultUse(d, { map: () => m, player: () => p })).toBeNull();
    expect(isDoorOpen(d)).toBe(true);
    expect(d.extra.kind === 'door' && (d.extra.raw[0]! & 2) === 0).toBe(true);
  });
  it('zly klucz albo brak klucza: zamkniete', () => {
    const m = emptyMap();
    const d = put(m, keyDoor(100, 7));
    const p = put(m, mk(1, 101));
    p.inventory.push(keyItem(8));
    expect(defaultUse(d, { map: () => m, player: () => p })).toEqual({ key: 'menu.locked' });
    expect(isDoorOpen(d)).toBe(false);
  });
  it('drzwi bez kodu (-1) nie pasuja do klucza -1', () => {
    const m = emptyMap();
    const d = put(m, keyDoor(100, -1));
    const p = put(m, mk(1, 101));
    p.inventory.push(keyItem(-1));
    expect(hasKeyFor(p, d)).toBe(false);
  });
});
