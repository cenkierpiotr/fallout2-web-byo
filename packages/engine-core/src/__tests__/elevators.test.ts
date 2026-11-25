import { describe, expect, it } from 'vitest';
import {
  ELEVATOR_EXITS,
  ELEVATOR_TYPE_COUNT,
  elevatorDestination,
  elevatorStartButton,
} from '../elevators.js';

describe('windy (0x43ef5c, tabele 0x43ea1c / 0x43ea7c)', () => {
  it('24 typy, liczby przyciskow jak w tabeli exe', () => {
    expect(ELEVATOR_TYPE_COUNT).toBe(24);
    expect(ELEVATOR_EXITS.map((r) => r.length)).toEqual([
      4, 2, 3, 2, 3, 2, 3, 3, 3, 3, 3, 2, 4, 2, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2,
    ]);
  });
  it('cel przycisku to rekord [mapa, kondygnacja, kafel]', () => {
    expect(elevatorDestination(0, 0)).toEqual({ map: 14, elevation: 0, tile: 18940 });
    expect(elevatorDestination(2, 1)).toEqual({ map: 33, elevation: 1, tile: 20094 });
    expect(elevatorDestination(23, 1)).toEqual({ map: 63, elevation: 1, tile: 17923 });
  });
  it('nieznany typ lub przycisk = brak', () => {
    expect(elevatorDestination(24, 0)).toBeUndefined();
    expect(elevatorDestination(-1, 0)).toBeUndefined();
    expect(elevatorDestination(1, 2)).toBeUndefined();
  });
  it('poczatkowo zaznaczony przycisk wg biezacej mapy i kondygnacji', () => {
    expect(elevatorStartButton(2, 33, 1)).toBe(1);
    expect(elevatorStartButton(0, 15, 0)).toBe(2);
    expect(elevatorStartButton(0, 14, 1)).toBe(1);
    // typ 11, kondygnacja 2: e<3 => e-2
    expect(elevatorStartButton(11, 28, 2)).toBe(0);
    expect(elevatorStartButton(24, 1, 1)).toBe(0);
  });
});
