import { describe, expect, it } from 'vitest';
import { WorldmapController, hhmmOf, type WorldmapHost } from './worldmap-controller';
import { CarState } from '@f2/engine-core';
import { wmData } from './worldmap-fixture';

const host = (over: Partial<WorldmapHost> = {}): WorldmapHost & { ticksNow: number } => {
  const h: WorldmapHost & { ticksNow: number } = {
    ticksNow: 302400,
    ticks: (): number => h.ticksNow,
    advance: (n: number) => {
      h.ticksNow += n;
    },
    rng: { int: () => 100 },
    difficulty: () => 1 as const,
    player: () => 5,
    luck: () => 5,
    outdoorsman: () => 0,
    perk: () => 0,
    gvars: {},
    ...over,
  };
  return h;
};

describe('WorldmapController', () => {
  it('hhmmOf: 08:24 na starcie gry', () => {
    expect(hhmmOf(302400)).toBe(824);
    expect(hhmmOf(0)).toBe(0);
  });
  it('klik w puste miejsce ustawia cel, krok przesuwa gracza i zegar gry', () => {
    const h = host();
    const c = new WorldmapController(wmData, h);
    c.clickWorld(140, 100);
    expect(c.model.target).toEqual({ x: 140, y: 100 });
    const t0 = h.ticksNow;
    expect(c.step()).toEqual([]);
    expect(c.model.x).toBe(101);
    expect(h.ticksNow).toBe(t0 + 18000);
  });
  it('klik w widoczne miasto celuje w obszar i konczy zdarzeniem city', () => {
    const c = new WorldmapController(wmData, host(), { x: 190, y: 100 });
    c.model.reveal(1);
    c.clickWorld(200, 100);
    expect(c.model.target?.area).toBe(1);
    const evs = [];
    for (let i = 0; i < 30 && c.model.target; i++) evs.push(...c.step());
    expect(evs).toContainEqual({ kind: 'city', area: 1 });
  });
  it('syncKnownAreas (mark_area_known): tylko stan > 0 odslania miasto', () => {
    const c = new WorldmapController(wmData, host());
    c.syncKnownAreas(new Map([[2, 0]]));
    expect(c.model.known.has(2)).toBe(false);
    c.syncKnownAreas(new Map([[2, 1]]));
    expect(c.model.known.has(2)).toBe(true);
  });
  it('enterFromMap ustawia pozycje na obszarze mapy lokalnej', () => {
    const c = new WorldmapController(wmData, host());
    expect(c.enterFromMap('KLMAIN')).toBe(1);
    expect([c.model.x, c.model.y]).toEqual([200, 100]);
    expect(c.enterFromMap('NIEZNANA')).toBe(-1);
    expect([c.model.x, c.model.y]).toEqual([200, 100]);
  });
  it('zapis i odczyt stanu', () => {
    const c = new WorldmapController(wmData, host());
    c.clickWorld(130, 100);
    c.step();
    const s = JSON.parse(JSON.stringify(c.snapshot()));
    const d = new WorldmapController(wmData, host());
    d.restore(s);
    expect(d.model.x).toBe(c.model.x);
  });
});

describe('WorldmapController: samochod i bagaznik (Zadanie 36)', () => {
  const carHost = (): { h: WorldmapHost; st: CarState; car: NonNullable<WorldmapHost['car']> } => {
    const st = new CarState();
    st.give(2, 5000);
    const car: NonNullable<WorldmapHost['car']> = {
      state: st,
      get fuel() {
        return st.fuel;
      },
      set fuel(v: number) {
        st.fuel = v;
      },
      moving: false,
      get area() {
        return st.parkedArea;
      },
      set area(v: number) {
        st.parkedArea = v;
      },
    };
    return { h: host({ car }), st, car };
  };

  it('bagaznik dostepny tylko gdy auto stoi w obszarze gracza i nie jedzie', () => {
    const { h, st, car } = carHost();
    const c = new WorldmapController(wmData, h);
    expect(c.trunkAccessible()).toBe(false); // obszar gracza nieznany
    c.currentArea = 1;
    expect(c.trunkStow(7, 1)).toBe(false); // auto stoi w 2
    c.currentArea = 2;
    expect(c.trunkStow(7, 3)).toBe(true);
    expect(st.trunkCount).toBe(3);
    car.moving = true;
    expect(c.trunkAccessible()).toBe(false);
    expect(c.trunkRetrieve(7, 3)).toBe(0);
    car.moving = false;
    expect(c.trunkRetrieve(7, 2)).toBe(2);
    expect(c.carStateInfo()).toMatchObject({ owned: true, parkedArea: 2, trunkCount: 1 });
  });

  it('jazda zuzywa paliwo samochodu (CarState), a stan zostaje spojny z hostem', () => {
    const { h, st, car } = carHost();
    car.moving = true;
    const c = new WorldmapController(wmData, h, { x: 100, y: 100 });
    c.clickWorld(140, 100);
    c.step();
    expect(st.fuel).toBeLessThan(5000);
    expect(c.carInfo().fuel).toBe(st.fuel);
  });

  it('carPanel: bagaznik tylko przy aucie w biezacym obszarze; start i parkowanie', () => {
    const { h, st, car } = carHost();
    const c = new WorldmapController(wmData, h);
    c.currentArea = 1;
    expect(c.carPanel()).toMatchObject({ trunkAccessible: false, canStart: false, parkedArea: 2 });
    expect(c.startCar()).toBe(false);
    c.currentArea = 2;
    expect(c.carPanel()).toMatchObject({
      trunkAccessible: true,
      canStart: true,
      trunkCapacity: 250,
    });
    expect(c.startCar()).toBe(true);
    expect(car.moving).toBe(true);
    expect(st.parkedArea).toBe(-1);
    expect(c.carPanel()).toMatchObject({ moving: true, trunkAccessible: false, canPark: true });
    expect(c.parkCar()).toBe(true);
    expect(car.moving).toBe(false);
    expect(st.parkedArea).toBe(2);
    expect(c.carPanel()?.trunkAccessible).toBe(true);
  });

  it('carPanel: brak samochodu i pusty bak', () => {
    const noCar = new WorldmapController(wmData, host());
    expect(noCar.carPanel()).toBeUndefined();
    const { h, st } = carHost();
    st.fuel = 0;
    const c = new WorldmapController(wmData, h);
    c.currentArea = 2;
    expect(c.carPanel()).toMatchObject({ canStart: false, fuelPct: 0 });
  });
});
