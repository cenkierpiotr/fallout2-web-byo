import { describe, expect, it } from 'vitest';
import {
  TICKS_PER_TRAVEL_ITERATION,
  burnFuel,
  carStepCalls,
  initialStepCounter,
  stepCost,
  tileIndexAt,
  subtileAt,
  travelStep,
} from '../src/index.js';

describe('worldmap: koszt kroku i Pathfinder (0x4c1f90)', () => {
  it('rank Pathfindera odejmuje od kosztu terenu, minimum 1', () => {
    expect(stepCost(2, 0)).toBe(2);
    expect(stepCost(2, 1)).toBe(1);
    expect(stepCost(2, 2)).toBe(1);
    expect(stepCost(1, 2)).toBe(1);
    expect(stepCost(4, 2)).toBe(2);
  });
  it('licznik 1..4 zawija; krok gdy licznik >= koszt', () => {
    let s = initialStepCounter();
    const moved: boolean[] = [];
    for (let i = 0; i < 8; i++) {
      const r = travelStep(s, 2);
      s = r.counter;
      moved.push(r.moved);
    }
    // koszt 2: liczniki 1,2,3,4,1,2,3,4 -> ruch na 2,3,4
    expect(moved).toEqual([false, true, true, true, false, true, true, true]);
  });
  it('koszt 1: kazde wywolanie to krok; koszt 4: co czwarte', () => {
    let s = initialStepCounter();
    const a: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      const r = travelStep(s, 1);
      s = r.counter;
      a.push(r.moved);
    }
    expect(a).toEqual([true, true, true, true]);
    s = initialStepCounter();
    let n = 0;
    for (let i = 0; i < 8; i++) {
      const r = travelStep(s, 4);
      s = r.counter;
      if (r.moved) n++;
    }
    expect(n).toBe(2);
  });
});

describe('worldmap: kroki na iteracje, samochod (0x4bfe0c)', () => {
  it('pieszo 1 krok, iteracja = 18000 tickow', () => {
    expect(TICKS_PER_TRAVEL_ITERATION).toBe(18000);
    expect(carStepCalls(false, {})).toBe(1);
  });
  it('samochod: 4 + GVAR 439 (+1) + 455 (+1) + 456 (+3)', () => {
    expect(carStepCalls(true, {})).toBe(4);
    expect(carStepCalls(true, { 439: 1 })).toBe(5);
    expect(carStepCalls(true, { 439: 1, 455: 1 })).toBe(6);
    expect(carStepCalls(true, { 439: 1, 455: 1, 456: 1 })).toBe(9);
  });
});

describe('worldmap: paliwo (0x4c4da4)', () => {
  it('baza 100; 456 -> 10; 455 -> 90; 453 -> 50; nie schodzi ponizej 0', () => {
    expect(burnFuel(1000, 100, {})).toBe(900);
    expect(burnFuel(1000, 100, { 456: 1 })).toBe(990);
    expect(burnFuel(1000, 100, { 455: 1 })).toBe(910);
    expect(burnFuel(1000, 100, { 453: 1 })).toBe(950);
    expect(burnFuel(1000, 100, { 456: 1, 455: 1, 453: 1 })).toBe(
      1000 - Math.trunc(Math.trunc((((100 * 10) / 100) * 90) / 100) / 2),
    );
    expect(burnFuel(50, 100, {})).toBe(0);
  });
});

describe('worldmap: geometria', () => {
  it('kafel 350x300, siatka 50x50', () => {
    expect(tileIndexAt(0, 0, 4)).toBe(0);
    expect(tileIndexAt(349, 299, 4)).toBe(0);
    expect(tileIndexAt(350, 0, 4)).toBe(1);
    expect(tileIndexAt(0, 300, 4)).toBe(4);
    expect(subtileAt(0, 0)).toEqual({ col: 0, row: 0 });
    expect(subtileAt(349, 299)).toEqual({ col: 6, row: 5 });
    expect(subtileAt(350 + 50, 300 + 100)).toEqual({ col: 1, row: 2 });
  });
});
