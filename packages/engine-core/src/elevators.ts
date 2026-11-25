/**
 * Okno wyboru poziomu windy (silnik gry 0x43ef5c, okno 0x43f324; D wg specyfikacja formatu/specyfikacja formatu, 2026-11-13).
 *
 * Tabele: liczba przyciskow na typ windy 0x43ea1c (24 x i32), rekordy wyjsc 0x43ea7c: 24 typy x 4 sloty x
 * 12 B [mapa, kondygnacja, kafel] (sloty ponad liczba przyciskow to [0, 0, -1] i nie sa uzywane).
 * Wybrany przycisk n (0-based, id 500+n) zapisuje rekord (typ, n) do wyjscia; Esc zostawia wyjscie bez zmian.
 */
export type ElevatorExit = readonly [map: number, elevation: number, tile: number];

/** Wyjscia wg typu windy 0..23; dlugosc wiersza = liczba przyciskow (0x43ea1c). */
export const ELEVATOR_EXITS: readonly (readonly ElevatorExit[])[] = [
  [
    [14, 0, 18940],
    [14, 1, 18936],
    [15, 0, 21340],
    [15, 1, 21340],
  ],
  [
    [13, 0, 20502],
    [14, 0, 14912],
  ],
  [
    [33, 0, 12498],
    [33, 1, 20094],
    [34, 0, 17312],
  ],
  [
    [34, 0, 16140],
    [34, 1, 16140],
  ],
  [
    [49, 0, 14920],
    [49, 1, 15120],
    [50, 0, 12944],
  ],
  [
    [50, 0, 24520],
    [50, 1, 25316],
  ],
  [
    [42, 0, 22526],
    [42, 1, 22526],
    [42, 2, 22526],
  ],
  [
    [42, 2, 14086],
    [43, 0, 14086],
    [43, 2, 14086],
  ],
  [
    [40, 0, 14104],
    [40, 1, 22504],
    [40, 2, 17312],
  ],
  [
    [9, 0, 13704],
    [9, 1, 23302],
    [9, 2, 17308],
  ],
  [
    [28, 0, 19300],
    [28, 1, 19300],
    [28, 2, 20110],
  ],
  [
    [28, 2, 20118],
    [29, 0, 21710],
  ],
  [
    [28, 0, 20122],
    [28, 1, 20124],
    [28, 2, 20940],
    [29, 0, 22540],
  ],
  [
    [12, 1, 16052],
    [12, 2, 14480],
  ],
  [
    [6, 0, 14104],
    [6, 1, 22504],
    [6, 2, 17312],
  ],
  [
    [30, 0, 14104],
    [30, 1, 22504],
    [30, 2, 17312],
  ],
  [
    [36, 0, 13704],
    [36, 1, 23302],
    [36, 2, 17308],
  ],
  [
    [39, 0, 17285],
    [36, 0, 19472],
  ],
  [
    [109, 2, 10701],
    [109, 1, 10705],
  ],
  [
    [109, 2, 14697],
    [109, 1, 15099],
  ],
  [
    [109, 2, 23877],
    [109, 1, 25481],
  ],
  [
    [109, 2, 26130],
    [109, 1, 24721],
  ],
  [
    [137, 0, 23953],
    [148, 1, 16526],
  ],
  [
    [62, 0, 13901],
    [63, 1, 17923],
  ],
];

export const ELEVATOR_TYPE_COUNT = ELEVATOR_EXITS.length;

/** Wynik wyboru: nowa mapa/kondygnacja/kafel (mapa = indeks z maps.txt, kondygnacja 0..2). */
export interface ElevatorDestination {
  map: number;
  elevation: number;
  tile: number;
}

/**
 * Poczatkowo zaznaczony przycisk (0x43ef5c): szuka pierwszego slotu (0..3) o mapie rownej biezacej,
 * dodaje ten indeks do biezacej kondygnacji, gdy rekord (kondygnacja + indeks) ma kafel != -1,
 * potem poprawki typow 11 (e<3 ? e-2 : e-3), 5 (e>1 => e-2), 4 (e==4 => 2) i ogolna (e>3 => e-3).
 * Wartosc nie jest ograniczana do liczby przyciskow (jak w oryginale; tylko podswietlenie suwaka).
 */
export function elevatorStartButton(
  type: number,
  currentMap: number,
  currentElevation: number,
): number {
  const rows = ELEVATOR_EXITS[type];
  if (!rows) return 0;
  const slot = (k: number): ElevatorExit => rows[k] ?? [0, 0, -1];
  let k = 0;
  if (slot(0)[0] !== currentMap) {
    do {
      k += 1;
      if (k > 3) break;
    } while (slot(k)[0] !== currentMap);
  }
  let e = currentElevation;
  if (k < 4 && slot(e + k)[2] !== -1) e += k;
  if (type === 11) e = e < 3 ? e - 2 : e - 3;
  else if (type === 5) {
    if (e > 1) e -= 2;
  } else if (type === 4 && e === 4) e -= 2;
  if (e > 3) e -= 3;
  return e;
}

/** Cel dla wybranego przycisku; undefined dla nieznanego typu/przycisku (0x43ef5c zwraca -1 dla typu spoza 0..23). */
export function elevatorDestination(type: number, button: number): ElevatorDestination | undefined {
  const rec = ELEVATOR_EXITS[type]?.[button];
  if (!rec) return undefined;
  return { map: rec[0], elevation: rec[1], tile: rec[2] };
}
