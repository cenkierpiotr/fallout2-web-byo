import { describe, expect, it } from 'vitest';
import { ageMapState, elapsedHours, isDailyReset } from '../src/map-aging.js';
import type { MapStateJSON, SaveMapObject } from '../src/save/schema.js';

const obj = (objId: number, pid: number, extra: Partial<SaveMapObject> = {}): SaveMapObject => ({
  objId,
  pid,
  hex: 0,
  orientation: 0,
  flags: 0,
  hp: 0,
  scriptLocalId: null,
  inventory: [],
  ...extra,
});
const st = (...objects: SaveMapObject[]): MapStateJSON => ({
  name: 'T',
  lastVisitTick: 0,
  mapVars: [],
  scriptLocals: {},
  elevations: [{ objects }],
});
const ids = (s: MapStateJSON): number[] => s.elevations[0]!.objects.map((o) => o.objId);
const hp = (s: MapStateJSON, id: number): number =>
  s.elevations[0]!.objects.find((o) => o.objId === id)!.hp;
const C = 0x01000001;

describe('ageMapState', () => {
  it('nie mutuje wejscia', () => {
    const s = st(obj(1, C, { hp: 50, maxHp: 100 }));
    const copy = structuredClone(s);
    ageMapState(s, 6);
    expect(s).toEqual(copy);
  });
  it('leczy 14*floor(h/3) z limitem maxHp i wlasnym healPer3h', () => {
    const r = ageMapState(
      st(
        obj(1, C, { hp: 50, maxHp: 100 }),
        obj(2, C, { hp: 90, maxHp: 100, healPer3h: 5 }),
        obj(3, C, { hp: 50 }),
      ),
      6,
    );
    expect(hp(r, 1)).toBe(78);
    expect(hp(r, 2)).toBe(100);
    expect(hp(r, 3)).toBe(50);
  });
  it('pomija gracza i martwych', () => {
    const r = ageMapState(
      st(
        obj(10, C, { hp: 50, maxHp: 100 }),
        obj(11, C, { hp: 50, maxHp: 100 }),
        obj(12, C, { hp: 5, maxHp: 100, dmgFlags: 0x80 }),
        obj(13, C, { hp: 0, maxHp: 100 }),
      ),
      3,
      { playerId: 11 },
    );
    expect(hp(r, 10)).toBe(64);
    expect(hp(r, 11)).toBe(50);
    expect(hp(r, 12)).toBe(5);
    expect(hp(r, 13)).toBe(0);
  });
  it('usuwa martwe krytery tylko powyzej 144 h', () => {
    const s = st(obj(1, C, { hp: 50, maxHp: 100 }), obj(2, C, { dmgFlags: 0x80 }));
    expect(ids(ageMapState(s, 144))).toEqual([1, 2]);
    expect(ids(ageMapState(s, 145))).toEqual([1]);
  });
  it('usuwa krew i misc tylko powyzej 336 h', () => {
    const s = st(obj(1, 0x05000004), obj(2, 0x0500000b), obj(3, 0x0500000c));
    expect(ids(ageMapState(s, 336))).toEqual([1, 2, 3]);
    expect(ids(ageMapState(s, 337))).toEqual([3]);
  });
  it('ujemne lub NaN godziny: bez zmian', () => {
    const s = st(obj(1, C, { hp: 50, maxHp: 100 }));
    expect(ageMapState(s, -1)).toEqual(s);
    expect(ageMapState(s, NaN)).toEqual(s);
  });
});

describe('elapsedHours / isDailyReset', () => {
  it('liczy godziny i granice', () => {
    expect(elapsedHours(100, 200)).toBe(0);
    expect(elapsedHours(36100, 100)).toBe(1);
    expect(isDailyReset(23.9)).toBe(false);
    expect(isDailyReset(24)).toBe(true);
  });
});
