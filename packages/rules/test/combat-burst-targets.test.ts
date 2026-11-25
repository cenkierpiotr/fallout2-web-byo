import { describe, expect, it } from 'vitest';
import {
  RollResult,
  burstMissRedirect,
  burstRayEnds,
  burstRoundSplit,
  isMapBorderHex,
  resolveBurstSpread,
  tileBeyond,
  type BurstSpreadInput,
  type MissRedirectObject,
  type Rng,
  type ShotGeometry,
} from '../src/index.js';

/** Siatka 200 szerokosci: heks h = (h % 200, floor(h / 200)); 32 x 12 px; sasiedzi wg tablicy przesuniec. */
const OFF = [1, 200, 199, -1, -200, -199];
const geo: ShotGeometry = {
  hexCenter: (h) => ({ x: (h % 200) * 32 + 16, y: Math.floor(h / 200) * 12 + 8 }),
  pixelToHex: (x, y) => Math.floor(y / 12) * 200 + Math.floor(x / 32),
  neighbor: (h, d) => h + (OFF[d] as number),
  directionTo: (a, b) => (b > a ? 0 : 3),
};

const seq = (...v: number[]): Rng => {
  let i = 0;
  return {
    int: (lo) => {
      if (i >= v.length) throw new Error('za malo rzutow');
      return Math.max(lo, v[i++] as number);
    },
  };
};

describe('tileBeyond (0x4b1b84, D)', () => {
  it('idzie wzdluz linii o zadana liczbe zmian heksa, takze za celem', () => {
    expect(tileBeyond(geo, 1010, 1012, 5)).toBe(1015);
    expect(tileBeyond(geo, 1010, 1012, 1)).toBe(1011);
  });
  it('dystans <= 0 albo ten sam heks zwraca start', () => {
    expect(tileBeyond(geo, 1010, 1012, 0)).toBe(1010);
    expect(tileBeyond(geo, 1010, 1010, 4)).toBe(1010);
  });
  it('zatrzymuje sie na heksie brzegowym mapy (0x4b1d20)', () => {
    expect(tileBeyond(geo, 1195, 1197, 10)).toBe(1199);
  });
  it('linia ukosna: os dominujaca y', () => {
    // 3 wiersze w dol, ten sam x: kolejne heksy co 200
    expect(tileBeyond(geo, 1010, 1610, 2)).toBe(1410);
  });
});

describe('isMapBorderHex (0x4b1d20, D)', () => {
  it('pierwszy i ostatni wiersz oraz skrajne kolumny; poza siatka = 0', () => {
    expect(isMapBorderHex(5)).toBe(true);
    expect(isMapBorderHex(39999)).toBe(true);
    expect(isMapBorderHex(39800)).toBe(true);
    expect(isMapBorderHex(1000)).toBe(true);
    expect(isMapBorderHex(1199)).toBe(true);
    expect(isMapBorderHex(1010)).toBe(false);
    expect(isMapBorderHex(-1)).toBe(false);
    expect(isMapBorderHex(40000)).toBe(false);
  });
});

describe('burstRoundSplit (0x423488, D)', () => {
  it('seria: srodek max(r/3,1), lewa r/3, prawa reszta, wstepne rzuty srodka c/2 (min 1)', () => {
    expect(burstRoundSplit('burst', 9)).toEqual({ center: 3, left: 3, right: 3, preRolls: 1 });
    expect(burstRoundSplit('burst', 3)).toEqual({ center: 0, left: 1, right: 1, preRolls: 1 });
    expect(burstRoundSplit('burst', 10)).toEqual({ center: 3, left: 3, right: 4, preRolls: 1 });
    expect(burstRoundSplit('burst', 24)).toEqual({ center: 8, left: 8, right: 8, preRolls: 4 });
    expect(burstRoundSplit('burst', 2)).toEqual({ center: 0, left: 0, right: 1, preRolls: 1 });
  });
  it('plomien: po jednej rundzie na kazdy promien', () => {
    expect(burstRoundSplit('flame', 5)).toEqual({ center: 1, left: 1, right: 1, preRolls: 1 });
  });
});

interface Ray {
  endHex: number;
  rounds: number;
}

function mk(
  over: Partial<BurstSpreadInput>,
  rays: Ray[],
  rayHits: number[] = [],
): BurstSpreadInput {
  let k = 0;
  return {
    mode: 'burst',
    toHit: 60,
    critChance: 0,
    ammo: 20,
    burstRounds: 9,
    critsEnabled: false,
    attackerHex: 1000,
    targetHex: 1010,
    range: 20,
    geo,
    distance: (a, b) => Math.abs(a - b),
    missRedirect: () => null,
    ray: (endHex, rounds) => {
      rays.push({ endHex, rounds });
      return rayHits[k++] ?? 0;
    },
    extrasCount: () => 0,
    ...over,
  };
}

describe('resolveBurstSpread (0x423488, D poza 0x423128 jako callback)', () => {
  it('3 promienie: srodek (A - trafienia wstepne), lewy, prawy; trafienia sumowane', () => {
    const rays: Ray[] = [];
    // rzut 1: 10 (sukces), wstepny rzut: 10 (trafienie)
    const r = resolveBurstSpread(mk({}, rays, [2, 1, 0]), seq(10, 10));
    expect(r.rounds).toBe(9);
    expect(r.hits).toBe(1 + 2 + 1 + 0);
    expect(r.result).toBe(RollResult.Success);
    expect(rays.map((x) => x.rounds)).toEqual([2, 3, 3]);
    // srodek: heks na zasiegu 20 wzdluz linii atakujacy->cel
    expect(rays[0]?.endHex).toBe(tileBeyond(geo, 1000, 1010, 20));
    // pivot = cel (dystans 10 > 3), kierunek cel->atakujacy = 3: lewa (3+1)%6=4, prawa (3+5)%6=2
    expect(rays[1]?.endHex).toBe(tileBeyond(geo, 1000, 1010 + OFF[4]!, 20));
    expect(rays[2]?.endHex).toBe(tileBeyond(geo, 1000, 1010 + OFF[2]!, 20));
  });
  it('krytyczne pudlo pierwszego rzutu nie przerywa (0x4234e0: tablica skokow), wynik 0 zostaje', () => {
    const rays: Ray[] = [];
    // rzut 100 (margines -90), rzut krytyka 1 <= 9: krytyczne pudlo; wstepny rzut 5 trafia, jego rzut krytyka 50
    const r = resolveBurstSpread(mk({ critsEnabled: true, toHit: 10 }, rays), seq(100, 1, 5, 50));
    expect(r.result).toBe(RollResult.CriticalFailure);
    expect(r.hits).toBe(1);
    expect(rays.length).toBe(3);
  });
  it('krytyczny sukces daje +20 do szansy wstepnych rzutow', () => {
    const rays: Ray[] = [];
    // szansa 50, krytyk 10: rzut 1 -> margines 49, rzut krytyka 1 <= 10+4 -> krytyk (3);
    // wstepny rzut 65 <= 70 (z bonusem) = trafienie; jego rzut krytyka 50 (nie ma znaczenia)
    const r = resolveBurstSpread(
      mk({ critsEnabled: true, toHit: 50, critChance: 10 }, rays),
      seq(1, 1, 65, 50),
    );
    expect(r.result).toBe(RollResult.CriticalSuccess);
    expect(r.hits).toBe(1);
    // bez bonusu ten sam rzut 65 > 50 pudlowalby
    const rays2: Ray[] = [];
    const r2 = resolveBurstSpread(
      mk({ critsEnabled: true, toHit: 50, critChance: 0 }, rays2),
      seq(1, 100, 65, 50),
    );
    expect(r2.result).toBe(RollResult.Failure); // 0 trafien i 0 extras -> 1 (0x4236ee)
    expect(r2.hits).toBe(0);
  });
  it('pudlo pierwszego rzutu, ale trafienie wstepne lub w promieniu: wynik 2', () => {
    const rays: Ray[] = [];
    const r = resolveBurstSpread(mk({ toHit: 80 }, rays), seq(90, 5));
    expect(r.result).toBe(RollResult.Success);
    expect(r.hits).toBe(1);
  });
  it('sukces bez zadnych trafien i bez extras: wynik 1 (pudlo)', () => {
    const rays: Ray[] = [];
    const r = resolveBurstSpread(mk({ toHit: 60 }, rays), seq(10, 100));
    expect(r.result).toBe(RollResult.Failure);
    expect(r.hits).toBe(0);
  });
  it('extras zamieniaja pudlo w trafienie', () => {
    const rays: Ray[] = [];
    const r = resolveBurstSpread(mk({ toHit: 60, extrasCount: () => 1 }, rays), seq(90, 100));
    expect(r.result).toBe(RollResult.Success);
    expect(r.hits).toBe(0);
    const r2 = resolveBurstSpread(mk({ toHit: 60, extrasCount: () => 1 }, []), seq(10, 100));
    expect(r2.result).toBe(RollResult.Success);
  });
  it('bez trafien wstepnych pocisk przekierowany (0x423128) liczy sie jako 1 trafienie i zmienia cel promieni', () => {
    const rays: Ray[] = [];
    const r = resolveBurstSpread(mk({ missRedirect: () => 1004 }, rays), seq(10, 100));
    expect(r.hits).toBe(1);
    expect(r.result).toBe(RollResult.Success);
    expect(rays[0]?.endHex).toBe(tileBeyond(geo, 1000, 1004, 20));
  });
  it('cel blizej niz 4 heksy: os boczna liczona od heksa o 3 za atakujacym wzdluz linii', () => {
    const rays: Ray[] = [];
    resolveBurstSpread(mk({ targetHex: 1002, distance: () => 2 }, rays), seq(10, 10));
    const pivot = tileBeyond(geo, 1000, 1002, 3);
    expect(rays[1]?.endHex).toBe(tileBeyond(geo, 1000, pivot + OFF[4]!, 20));
  });
  it('liczba pociskow = min(amunicja, seria); plomien: trzy promienie po 1', () => {
    const rays: Ray[] = [];
    const r = resolveBurstSpread(mk({ ammo: 4, burstRounds: 9 }, rays), seq(10, 10));
    expect(r.rounds).toBe(4);
    const fl: Ray[] = [];
    resolveBurstSpread(mk({ mode: 'flame' }, fl), seq(10, 10));
    expect(fl.map((x) => x.rounds)).toEqual([0, 1, 1]);
  });
});

describe('burstRayEnds (0x423488, D)', () => {
  const base = {
    attackerHex: 1010,
    range: 8,
    geo,
    distance: (a: number, b: number) => Math.abs(a - b),
  };
  it('promien srodkowy konczy sie za celem; boczne przez sasiadow pivota (cel dalej niz 3 heksy)', () => {
    const e = burstRayEnds(base, 1020);
    expect(e.center).toBe(tileBeyond(geo, 1010, 1020, 8));
    expect(e.left).not.toBeNull();
    expect(e.right).not.toBeNull();
    expect(e.left).not.toBe(e.right);
  });
  it('cel blizej niz 4 heksy: pivot = heks 3 od atakujacego', () => {
    const near = burstRayEnds(base, 1012);
    const same = burstRayEnds(base, 1013);
    expect(near.left).toBe(same.left);
    expect(near.right).toBe(same.right);
  });
});

describe('burstMissRedirect (0x423128, D)', () => {
  const mkObj = (over: Partial<MissRedirectObject> & { hex: number }): MissRedirectObject => ({
    hidden: false,
    isCritter: true,
    isTarget: false,
    busy: false,
    toHit: 90,
    ...over,
  });
  const chain = (objs: MissRedirectObject[]) => {
    let i = 0;
    return () => objs[i++] ?? null;
  };
  it('kryter na linii: szansa toHit/3, rzut <= szansa trafia go', () => {
    const o = mkObj({ hex: 1003 });
    expect(burstMissRedirect(1000, 1010, chain([o]), seq(30))).toBe(o);
    expect(burstMissRedirect(1000, 1010, chain([o]), seq(31))).toBeNull();
  });
  it('busy wymusza szanse 5; oryginalny cel pomijany bez rzutu', () => {
    const b = mkObj({ hex: 1003, busy: true });
    expect(burstMissRedirect(1000, 1010, chain([b]), seq(5))).toBe(b);
    expect(burstMissRedirect(1000, 1010, chain([b]), seq(6))).toBeNull();
    const t = mkObj({ hex: 1003, isTarget: true });
    expect(burstMissRedirect(1000, 1010, chain([t]), seq())).toBeNull();
  });
  it('obiekt niebedacy krytterem blokuje bez rzutu, ukryty jest pomijany', () => {
    const wall = mkObj({ hex: 1005, isCritter: false });
    const hid = mkObj({ hex: 1002, hidden: true });
    expect(burstMissRedirect(1000, 1010, chain([hid, wall]), seq())).toBe(wall);
  });
});
