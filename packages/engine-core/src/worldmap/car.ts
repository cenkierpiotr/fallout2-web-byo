/**
 * Samochod Highwayman (Zadanie 36, M7): wlasnosc, paliwo, bagaznik, parkowanie.
 * Paliwo w jednostkach silnika (maks. 80000, 100 na iteracje podrozy, jak WorldmapModel).
 * Bagaznik = przedmiot-pojemnik "Car Trunk" (pid 455, podtyp 1 = pojemnik, maks. rozmiar 250 wg PRO: D, odczyt z plikow gry).
 * Pojemnosc to suma rozmiarow przedmiotow (proto.size), nie liczba sztuk; domyslny rozmiar sztuki = 1 (`sizeOf` wstrzykiwany).
 * Wartosc jednego ogniwa paliwowego (20000) to nadal Z (liczba przekazywana przez skrypt, PRO jej nie zawiera).
 */
export const CAR_FUEL_MAX = 80000;
/** Z: jedno ogniwo energetyczne dolewa tyle jednostek (do potwierdzenia w binarce). */
export const FUEL_CELL_UNITS = 20000;
/** D (PRO pid 288, "Car Fuel Cell", podtyp misc): przedmiot, ktorym tankuje sie samochod. */
export const FUEL_CELL_PID = 288;
/** D (PRO pid 455, "Car Trunk"): maksymalny rozmiar zawartosci bagaznika. */
export const TRUNK_CAPACITY = 250;

export interface TrunkItem {
  pid: number;
  count: number;
}

export interface CarStateJSON {
  version: 1;
  owned: boolean;
  fuel: number;
  parkedArea: number;
  trunk: TrunkItem[];
}

export interface CarOptions {
  /** Maks. suma rozmiarow w bagazniku (domyslnie 250 wg PRO pid 455). */
  trunkCapacity?: number;
  /** Rozmiar jednej sztuki przedmiotu (proto.size); brak = 1. */
  sizeOf?: (pid: number) => number;
}

export class CarState {
  owned = false;
  fuel = 0;
  /** Id obszaru, w ktorym stoi zaparkowany samochod; -1 = brak (w drodze). */
  parkedArea = -1;
  trunk: TrunkItem[] = [];
  private readonly capacity: number;
  private sizeOf: (pid: number) => number;

  constructor(o: CarOptions = {}) {
    this.capacity = o.trunkCapacity ?? TRUNK_CAPACITY;
    this.sizeOf = o.sizeOf ?? (() => 1);
  }

  /** Podmienia funkcje rozmiaru sztuki (host podpina proto.size z PRO po utworzeniu stanu). */
  setSizeOf(fn: (pid: number) => number): void {
    this.sizeOf = fn;
  }

  /** Gracz dostaje samochod (np. od Smitty'ego/Vic); startowo pelny bak jak w ScriptRuntime. */
  give(area: number, fuel = CAR_FUEL_MAX): void {
    this.owned = true;
    this.fuel = Math.max(0, Math.min(CAR_FUEL_MAX, fuel));
    this.parkedArea = area;
  }

  /** Dolewa paliwo; zwraca ile faktycznie dolano (bak ma limit). 0 bez samochodu. */
  addFuel(units: number): number {
    if (!this.owned || units <= 0) return 0;
    const added = Math.min(units, CAR_FUEL_MAX - this.fuel);
    this.fuel += added;
    return added;
  }

  /**
   * car_give_gas wg exe (D, 0x4c4e3c): dodaje bez sprawdzania wlasnosci, przycina do 80000, zwraca NADMIAR
   * (ile nie zmiescilo sie w baku), 0 gdy wszystko wlano.
   */
  giveGas(units: number): number {
    const sum = this.fuel + units;
    if (sum <= CAR_FUEL_MAX) {
      this.fuel = sum;
      return 0;
    }
    const overflow = units - (CAR_FUEL_MAX - this.fuel);
    this.fuel = CAR_FUEL_MAX;
    return overflow;
  }

  addFuelCells(n: number): number {
    return this.addFuel(Math.max(0, n) * FUEL_CELL_UNITS);
  }

  /** Zuzycie paliwa przez iteracje; zwraca false gdy bak pusty. */
  burn(units: number): boolean {
    if (!this.owned) return false;
    this.fuel = Math.max(0, this.fuel - units);
    return this.fuel > 0;
  }

  /** Parkuje w obszarze (po dojechaniu do miasta). */
  parkAt(area: number): boolean {
    if (!this.owned || area < 0) return false;
    this.parkedArea = area;
    return true;
  }

  /** Rusza w droge: samochod nie stoi juz w zadnym miescie. */
  depart(): boolean {
    if (!this.owned || this.fuel <= 0) return false;
    this.parkedArea = -1;
    return true;
  }

  /** Pojemnosc bagaznika (jednostki rozmiaru). */
  get trunkCapacity(): number {
    return this.capacity;
  }

  get trunkCount(): number {
    return this.trunk.reduce((s, i) => s + i.count, 0);
  }

  /** Zajete miejsce w bagazniku (suma rozmiarow). */
  get trunkUsed(): number {
    return this.trunk.reduce((n, i) => n + i.count * Math.max(0, this.sizeOf(i.pid)), 0);
  }

  /** Wklada do bagaznika; false gdy brak miejsca lub samochod nie stoi w obszarze `atArea`. */
  stow(pid: number, count: number, atArea: number): boolean {
    if (!this.owned || count <= 0 || this.parkedArea !== atArea) return false;
    if (this.trunkUsed + count * Math.max(0, this.sizeOf(pid)) > this.capacity) return false;
    const it = this.trunk.find((i) => i.pid === pid);
    if (it) it.count += count;
    else this.trunk.push({ pid, count });
    return true;
  }

  /** Wyjmuje z bagaznika (tylko gdy zaparkowany w `atArea`); zwraca liczbe wyjetych. */
  retrieve(pid: number, count: number, atArea: number): number {
    if (!this.owned || this.parkedArea !== atArea) return 0;
    const it = this.trunk.find((i) => i.pid === pid);
    if (!it) return 0;
    const n = Math.min(count, it.count);
    it.count -= n;
    if (it.count === 0) this.trunk = this.trunk.filter((i) => i !== it);
    return n;
  }

  toJSON(): CarStateJSON {
    return {
      version: 1,
      owned: this.owned,
      fuel: this.fuel,
      parkedArea: this.parkedArea,
      trunk: this.trunk.map((i) => ({ ...i })),
    };
  }

  restoreFrom(j: CarStateJSON): void {
    this.owned = j.owned;
    this.fuel = j.fuel;
    this.parkedArea = j.parkedArea;
    this.trunk = j.trunk.map((i) => ({ ...i }));
  }

  static fromJSON(j: CarStateJSON, o: CarOptions = {}): CarState {
    const c = new CarState(o);
    c.restoreFrom(j);
    return c;
  }
}
