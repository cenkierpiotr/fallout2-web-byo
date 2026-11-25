import { describe, expect, it } from 'vitest';
import {
  CarState,
  CAR_FUEL_MAX,
  FUEL_CELL_UNITS,
  FUEL_CELL_PID,
  TRUNK_CAPACITY,
} from '../src/index.js';

describe('CarState (Highwayman)', () => {
  it('bez samochodu nic nie dziala', () => {
    const c = new CarState();
    expect(c.addFuel(100)).toBe(0);
    expect(c.parkAt(1)).toBe(false);
    expect(c.depart()).toBe(false);
    expect(c.stow(1, 1, 0)).toBe(false);
  });

  it('paliwo: dolewka z limitem baku, spalanie, pusty bak blokuje ruszenie', () => {
    const c = new CarState();
    c.give(0, 1000);
    expect(c.addFuel(5000)).toBe(5000);
    expect(c.addFuelCells(10)).toBe(CAR_FUEL_MAX - 6000);
    expect(c.fuel).toBe(CAR_FUEL_MAX);
    expect(c.addFuel(1)).toBe(0);
    expect(c.addFuelCells(1)).toBe(0);
    c.fuel = 150;
    expect(c.burn(100)).toBe(true);
    expect(c.burn(100)).toBe(false);
    expect(c.fuel).toBe(0);
    expect(c.depart()).toBe(false);
    c.addFuel(FUEL_CELL_UNITS);
    expect(c.depart()).toBe(true);
    expect(c.parkedArea).toBe(-1);
  });

  it('parkowanie i bagaznik: dostep tylko gdy stoi w tym obszarze, limit pojemnosci', () => {
    const c = new CarState({ trunkCapacity: 10 });
    c.give(0);
    expect(c.stow(5, 6, 0)).toBe(true);
    expect(c.stow(5, 5, 0)).toBe(false);
    expect(c.stow(7, 4, 0)).toBe(true);
    expect(c.stow(7, 1, 0)).toBe(false);
    c.depart();
    expect(c.stow(7, 1, 0)).toBe(false);
    expect(c.retrieve(5, 1, 0)).toBe(0);
    expect(c.parkAt(2)).toBe(true);
    expect(c.retrieve(5, 1, 0)).toBe(0);
    expect(c.retrieve(5, 99, 2)).toBe(6);
    expect(c.trunk).toEqual([{ pid: 7, count: 4 }]);
  });

  it('round-trip JSON zachowuje stan', () => {
    const c = new CarState();
    c.give(3, 12345);
    c.stow(9, 2, 3);
    const d = CarState.fromJSON(JSON.parse(JSON.stringify(c.toJSON())));
    expect(d.toJSON()).toEqual(c.toJSON());
    expect(d.fuel).toBe(12345);
  });

  it('giveGas wg exe 0x4c4e3c: bez sprawdzania wlasnosci, przyciecie do baku, zwraca nadmiar', () => {
    const c = new CarState();
    c.fuel = 70000;
    expect(c.giveGas(5000)).toBe(0);
    expect(c.fuel).toBe(75000);
    expect(c.giveGas(20000)).toBe(15000);
    expect(c.fuel).toBe(CAR_FUEL_MAX);
    expect(c.giveGas(10)).toBe(10);
  });

  it('pojemnosc bagaznika wg PRO pid 455 = 250 jednostek rozmiaru; sizeOf liczy rozmiar sztuk', () => {
    expect(TRUNK_CAPACITY).toBe(250);
    expect(FUEL_CELL_PID).toBe(288);
    const c = new CarState({ sizeOf: (pid) => (pid === 288 ? 2 : 1) });
    expect(c.trunkCapacity).toBe(250);
    c.give(0);
    expect(c.stow(288, 125, 0)).toBe(true);
    expect(c.trunkUsed).toBe(250);
    expect(c.trunkCount).toBe(125);
    expect(c.stow(1, 1, 0)).toBe(false);
  });

  it('setSizeOf podmienia rozmiar po utworzeniu stanu', () => {
    const c = new CarState();
    c.give(0);
    c.setSizeOf((pid) => (pid === 5 ? 100 : 1));
    expect(c.stow(5, 2, 0)).toBe(true);
    expect(c.trunkUsed).toBe(200);
    expect(c.stow(5, 1, 0)).toBe(false);
    expect(c.stow(6, 50, 0)).toBe(true);
    expect(c.stow(6, 1, 0)).toBe(false);
  });
});
