import { describe, expect, it } from 'vitest';
import { critterDamage, critterHp, critterState } from '../critter-model.js';
import { indexObject } from '../game-map.js';
import { ageMapState } from '../map-aging.js';
import { applySavedLocals, captureLiveMapState, restoreLiveObjects } from '../map-state.js';
import { emptyMap, fake } from './helpers.js';

const critter = (hex: number) =>
  fake(1, hex, 0, { kind: 'critter', flags: 0, raw: new Int32Array(0) });
const env = (playerId = -1) => ({
  playerId,
  maxHp: () => 40,
  scripts: [{ sid: 77, localVars: Int32Array.from([3, 0, 9]) }],
  timers: [{ sid: 77, atTick: 5000, fixedParam: 2 }],
});

describe('captureLiveMapState / restoreLiveObjects', () => {
  it('zapisuje obiekty bez gracza, HP krytera, zmienne mapy, lokalne skryptow i timery', () => {
    const map = emptyMap();
    map.localVars = Int32Array.from([1, 2]);
    map.globalVars = Int32Array.from([0, 0, 7]);
    const npc = critter(100);
    const player = critter(200);
    map.objects.push(npc, player);
    critterDamage(npc, 15, 40);
    const s = captureLiveMapState(map, 1234, env(player.id));
    expect(s.lastVisitTick).toBe(1234);
    expect(s.elevations[0]!.objects.map((o) => o.objId)).toEqual([npc.id]);
    expect(s.elevations[0]!.objects[0]).toMatchObject({ hp: 25, maxHp: 40 });
    expect(s.mapVars).toEqual([1, 2]);
    expect(s.mvars).toEqual([0, 0, 7]);
    expect(s.scriptLocals['77']).toEqual([3, 0, 9]);
    expect(s.timers).toEqual([{ sid: 77, atTick: 5000, fixedParam: 2 }]);
  });

  it('odtwarza pozycje, usuwa zniszczone, przywraca HP i zmienne (round trip na swiezej mapie)', () => {
    const a = emptyMap();
    const npc = critter(100);
    const gone = critter(150);
    a.objects.push(npc, gone);
    npc.hex = 333;
    critterDamage(npc, 15, 40);
    const saved = captureLiveMapState(
      { ...a, objects: [npc], localVars: Int32Array.from([4]), globalVars: Int32Array.from([5]) },
      10,
      env(),
    );
    // swieza mapa z tymi samymi obiektami w pozycjach poczatkowych
    const b = emptyMap();
    const npc2 = { ...npc, hex: 100 };
    const gone2 = { ...gone };
    b.objects.push(npc2, gone2);
    indexObject(b, npc2);
    indexObject(b, gone2);
    restoreLiveObjects(b, saved, -1);
    expect(b.objects).toEqual([npc2]);
    expect(npc2.hex).toBe(333);
    expect(critterHp(npc2, 40)).toBe(25);
    expect(critterState(npc2)).toBe(0);
    expect(b.localVars[0]).toBe(4);
    expect(b.globalVars[0]).toBe(5);
    expect(b.byHex.size).toBeGreaterThan(0);
  });

  it('po starzeniu mapy HP wraca (leczenie) i martwy krytter znika po 144 h', () => {
    const map = emptyMap();
    const hurt = critter(10);
    const dead = critter(20);
    map.objects.push(hurt, dead);
    critterDamage(hurt, 30, 40);
    critterDamage(dead, 99, 40);
    const s = captureLiveMapState(map, 0, env());
    const aged = ageMapState(s, 6);
    const hurtSaved = aged.elevations[0]!.objects.find((o) => o.objId === hurt.id)!;
    expect(hurtSaved.hp).toBe(10 + 28);
    expect(ageMapState(s, 145).elevations[0]!.objects.map((o) => o.objId)).toEqual([hurt.id]);
  });

  it('applySavedLocals nadpisuje lokalne tylko gdy sa zapisane i pasuja', () => {
    const s = captureLiveMapState(emptyMap(), 0, env());
    const e = { sid: 77, localVars: new Int32Array(3) };
    expect(applySavedLocals(e, s)).toBe(true);
    expect(Array.from(e.localVars)).toEqual([3, 0, 9]);
    expect(applySavedLocals({ sid: 5, localVars: new Int32Array(3) }, s)).toBe(false);
    expect(applySavedLocals({ sid: 77, localVars: new Int32Array(1) }, s)).toBe(false);
  });
});
