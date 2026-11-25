import { describe, expect, it } from 'vitest';
import {
  LIGHT_MAX,
  NO_AMMO_MODS,
  SHOT_FLAG_HIDDEN,
  SHOT_FLAG_MULTI_HEX,
  SHOT_FLAG_NO_BLOCK,
  SHOT_FLAG_SHOOT_THRU,
  ammoModsOf,
  countCover,
  determineToHit,
  playerLightPenalty,
  shootBlockingAt,
  tileLight,
  traceStraightPath,
  type ShotGeometry,
  type ShotObject,
} from '../src/index.js';

/** Poziomy rzad heksow co 32 px (kierunek 0 = +1); wystarczy do testow linii (geometria wstrzykiwana). */
const geo: ShotGeometry = {
  hexCenter: (h) => ({ x: h * 32 + 16, y: 8 }),
  pixelToHex: (x) => Math.floor(x / 32),
  neighbor: (h, d) => (d === 0 ? h + 1 : d === 3 ? h - 1 : -1),
  directionTo: (a, b) => (b > a ? 0 : 3),
};

interface Obj extends ShotObject {
  name: string;
}
const o = (name: string, type: number, hex: number, flags = 0, dead = false): Obj => ({
  name,
  type,
  hex,
  flags,
  dead,
});
const world =
  (objs: Obj[]) =>
  (hex: number): readonly Obj[] =>
    objs.filter((x) => x.hex === hex);

describe('0x48b930 shootBlockingAt (D)', () => {
  const att = o('a', 1, 0);
  it('pomija atakujacego, ukryte i NoBlock+ShootThru; NoBlock sam blokuje', () => {
    const hidden = o('h', 2, 3, SHOT_FLAG_HIDDEN);
    const thru = o('t', 2, 3, SHOT_FLAG_NO_BLOCK | SHOT_FLAG_SHOOT_THRU);
    const noBlockOnly = o('n', 2, 3, SHOT_FLAG_NO_BLOCK);
    expect(shootBlockingAt(geo, world([att, hidden, thru]), att, 0)).toBeNull();
    expect(shootBlockingAt(geo, world([hidden, thru]), att, 3)).toBeNull();
    expect(shootBlockingAt(geo, world([hidden, thru, noBlockOnly]), att, 3)).toBe(noBlockOnly);
  });
  it('typ musi byc krytter/scenery/sciana (4 = item nie blokuje)', () => {
    expect(shootBlockingAt(geo, world([o('i', 0, 2)]), null, 2)).toBeNull();
    expect(shootBlockingAt(geo, world([o('i', 4, 2)]), null, 2)).toBeNull();
    const w = o('w', 3, 2);
    expect(shootBlockingAt(geo, world([w]), null, 2)).toBe(w);
  });
  it('przebieg 2: wieloheksowy sasiad blokuje, jesli nie NoBlock', () => {
    const big = o('big', 1, 5, SHOT_FLAG_MULTI_HEX);
    expect(shootBlockingAt(geo, world([big]), null, 4)).toBe(big);
    const bigNb = o('big', 1, 5, SHOT_FLAG_MULTI_HEX | SHOT_FLAG_NO_BLOCK);
    expect(shootBlockingAt(geo, world([bigNb]), null, 4)).toBeNull();
  });
});

describe('0x4163c8 traceStraightPath (D)', () => {
  const att = o('a', 1, 0);
  const block = (objs: Obj[]) => (a: Obj | null, h: number) =>
    shootBlockingAt(geo, world(objs), a, h);
  it('zwraca pierwszego blokujacego na linii (heks koncowy tez, poza samym ostatnim pikselem)', () => {
    const wall = o('w', 3, 3);
    expect(traceStraightPath(geo, att, 0, 6, att, block([att, wall]))).toBe(wall);
    const atEnd = o('t', 1, 6);
    expect(traceStraightPath(geo, att, 0, 6, att, block([att, atEnd]))).toBe(atEnd);
  });
  it('obiekt ShootThru nie zatrzymuje, obiekt rowny prev jest pomijany', () => {
    const glass = o('g', 2, 2, SHOT_FLAG_SHOOT_THRU);
    expect(traceStraightPath(geo, att, 0, 6, att, block([glass]))).toBeNull();
    const wall = o('w', 3, 3);
    expect(traceStraightPath(geo, att, 0, 6, wall, block([wall]))).toBeNull();
  });
});

describe('0x426cc4 countCover (D)', () => {
  const att = o('a', 1, 0);
  const tgt = o('t', 1, 8);
  const run = (objs: Obj[], target: Obj | null = tgt) =>
    countCover({ geo, at: world([att, ...objs]), attacker: att, fromHex: 0, toHex: 8, target });
  it('pusta linia: 0', () => expect(run([tgt])).toEqual({ blocked: false, count: 0 }));
  it('dwoch krytterow na linii: 2', () => {
    expect(run([o('x', 1, 3), o('y', 1, 5), tgt]).count).toBe(2);
  });
  it('cel nie liczy sie jako oslona', () => {
    expect(run([tgt]).count).toBe(0);
  });
  it('martwy CEL zeruje licznik (test 0x426d45 dotyczy celu, nie przeszkody)', () => {
    const dead = o('t', 1, 8, 0, true);
    const r = countCover({
      geo,
      at: world([att, o('x', 1, 3), dead]),
      attacker: att,
      fromHex: 0,
      toHex: 8,
      target: dead,
    });
    expect(r.count).toBe(0);
  });
  it('wieloheksowy cel: +1 za kazdego krytera', () => {
    const big = o('t', 1, 8, SHOT_FLAG_MULTI_HEX);
    const r = countCover({
      geo,
      at: world([att, o('x', 1, 3), big]),
      attacker: att,
      fromHex: 0,
      toHex: 8,
      target: big,
    });
    expect(r.count).toBe(2);
  });
  it('sciana przed celem: blocked', () => {
    expect(run([o('w', 3, 4), tgt]).blocked).toBe(true);
  });
  it('wynik wchodzi w to-hit jako -10 za oslone (krok 4, tylko dystansowa)', () => {
    const input = {
      skill: 60,
      part: 3,
      ranged: true,
      distance: { dist: 2, perception: 5, isPlayer: false },
      isPlayer: false,
      oneHander: false,
      twoHanded: false,
      minSt: 0,
      st: 5,
      weaponHandling: false,
      accurate: false,
      targetAc: 0,
      ammoAcMod: 0,
      targetMultihex: false,
      targetProne: false,
      attackerEyesCrippled: false,
      difficultyMod: 0,
    };
    const none = determineToHit({ ...input, coverCount: 0 });
    expect(determineToHit({ ...input, coverCount: 2 })).toBe(none - 20);
    expect(determineToHit({ ...input, ranged: false, coverCount: 2 })).toBe(
      determineToHit({ ...input, ranged: false, coverCount: 0 }),
    );
  });
});

describe('amunicja (D: 0x479190)', () => {
  const protos: Record<number, number[]> = { 0x4000029: [3, 20, -20, 25, 1, 2] };
  const peek = (pid: number) => protos[pid];
  it('brak amunicji (-1) = 0, nieznane proto = bez modyfikatorow', () => {
    expect(ammoModsOf(-1, peek)).toEqual(NO_AMMO_MODS);
    expect(ammoModsOf(0x4000099, peek)).toEqual(NO_AMMO_MODS);
  });
  it('proto amunicji: AC [2], DR [3], mnoznik [4], dzielnik [5]', () => {
    expect(ammoModsOf(0x4000029, peek)).toEqual({ acMod: -20, drMod: 25, dmgMult: 1, dmgDiv: 2 });
  });
});

describe('swiatlo (D: 0x48ad04 + krok 11)', () => {
  it('ogranicza do [otoczenie, 0x10000]; gracz odejmuje wlasne swiatlo', () => {
    expect(tileLight(0x1000, 0x4000)).toBe(0x4000);
    expect(tileLight(0x20000, 0x4000)).toBe(LIGHT_MAX);
    expect(tileLight(0x9000, 0x4000, 0x2000)).toBe(0x7000);
  });
  it('kara: progi 0x6666/0x9999/0xcccc; brak celu = ciemno (-40); bron 0x42 = pelne swiatlo', () => {
    expect(playerLightPenalty(0x6666, false)).toBe(-40);
    expect(playerLightPenalty(0x9999, false)).toBe(-25);
    expect(playerLightPenalty(0xcccc, false)).toBe(-10);
    expect(playerLightPenalty(0xcccd, false)).toBe(0);
    expect(playerLightPenalty(undefined, false)).toBe(-40);
    expect(playerLightPenalty(0x1000, true)).toBe(0);
  });
});
