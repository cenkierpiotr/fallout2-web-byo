import type { CarState } from '@f2/engine-core';
import { carStepCalls, type Gvars } from '@f2/rules';
import {
  FUEL_MAX,
  WorldmapModel,
  type TravelEnv,
  type TravelEvent,
  type WorldmapSnapshot,
} from './worldmap-model';
import { areaOfMap, type WorldmapData } from './worldmap-data';

/** Zrodlo stanu gry potrzebne do symulacji podrozy (wstrzykiwane: sesja gry albo atrapa w testach). */
export interface WorldmapHost {
  /** Tiki gry od poczatku (zegar swiata). */
  ticks(): number;
  /** Przesuwa zegar gry o `n` tikow. */
  advance(n: number): void;
  rng: { int(min: number, max: number): number };
  difficulty(): 0 | 1 | 2;
  /** Statystyka gracza wg nazwy z worldmap.txt (Level, Perception...). */
  player(stat: string): number;
  luck(): number;
  outdoorsman(): number;
  /** Ranga perka (klucz bez wzgledu na wielkosc liter), 0 gdy brak. */
  perk(name: string): number;
  gvars: Gvars;
  /** Stan samochodu ze skryptow (carFuel/carMoving/carArea); brak = bez samochodu. */
  car?: { fuel: number; moving: boolean; area: number; state?: CarState };
  fixes?: Readonly<Record<string, boolean>>;
}

/** Dane panelu samochodu (okno mapy swiata). */
export interface CarPanelView {
  moving: boolean;
  fuel: number;
  fuelMax: number;
  fuelPct: number;
  /** Obszar, w ktorym auto stoi; -1 = w drodze. */
  parkedArea: number;
  /** Bagaznik dostepny tylko gdy auto stoi w biezacym obszarze gracza. */
  trunkAccessible: boolean;
  canStart: boolean;
  canPark: boolean;
  trunk: { pid: number; count: number }[];
  trunkCount: number;
  /** Zajete miejsce (suma rozmiarow) i pojemnosc w tych samych jednostkach. */
  trunkUsed: number;
  trunkCapacity: number;
}

export interface WorldmapControllerEvent {
  event: TravelEvent;
}

const hhmmOf = (ticks: number): number => {
  const day = 864_000; // 24 h * 36000 tikow
  const t = ((ticks % day) + day) % day;
  const h = Math.floor(t / 36_000);
  const m = Math.floor((t % 36_000) / 600);
  return h * 100 + m;
};

/** Sterowanie ekranem mapy swiata: klik = cel, tick = iteracja podrozy, zegar gry i zdarzenia dla UI. */
export class WorldmapController {
  readonly model: WorldmapModel;
  /** Obszar, w ktorym gracz aktualnie jest (ostatnie wejscie z mapy lokalnej); -1 = nieznany. */
  currentArea = -1;

  constructor(
    readonly data: WorldmapData,
    private readonly host: WorldmapHost,
    start?: { x: number; y: number },
  ) {
    this.model = new WorldmapModel(data, start);
  }

  /** Wspolne dla mapy lokalnej i swiata: znane obszary ustawione przez skrypt (mark_area_known). */
  syncKnownAreas(areas: ReadonlyMap<number, number>): void {
    for (const [i, state] of areas) if (state > 0) this.model.markKnown(i);
  }

  /** Wejscie z mapy lokalnej: pozycja na srodku obszaru, do ktorego nalezy mapa (gdy rozpoznany). */
  enterFromMap(mapName: string | undefined): number {
    const area = mapName ? areaOfMap(this.data, mapName) : undefined;
    if (area) this.model.placeAtArea(area.index);
    else this.model.reveal();
    this.currentArea = area?.index ?? -1;
    return this.currentArea;
  }

  /** Klik/dotkniecie w punkt swiata: miasto pod punktem = cel obszarowy, inaczej wolny punkt. */
  clickWorld(x: number, y: number): void {
    const area = this.model.areaAt(x, y);
    if (area >= 0 && this.model.areaVisible(area)) this.model.setTargetArea(area);
    else this.model.setTarget(x, y);
  }

  stop(): void {
    this.model.stop();
  }

  /** Jedna iteracja podrozy; zwraca zdarzenia dla UI. Zegar gry przesuwany o zwrocone tiki. */
  step(): TravelEvent[] {
    const car = this.host.car;
    if (car) {
      this.model.car = car.moving;
      this.model.fuel = car.fuel;
    }
    const wasCar = this.model.car;
    const { events, ticks } = this.model.iterate(this.env());
    if (car) {
      car.fuel = this.model.fuel;
      car.moving = this.model.car;
      const stop = events.find(
        (e) => e.kind === 'no-fuel' || e.kind === 'city' || e.kind === 'arrived',
      );
      if (wasCar && stop) {
        // samochod zostaje w miescie, w ktorym skonczyla sie podroz (bez miasta: obszar 21 jak w oryginale)
        const area = stop.kind === 'city' ? stop.area : stop.kind === 'no-fuel' ? stop.area : -1;
        car.area = area >= 0 ? area : 21;
        if (area >= 0) this.currentArea = area;
        car.moving = false;
        this.model.car = false;
      }
    }
    if (ticks > 0) this.host.advance(ticks);
    return events;
  }

  /** Odswieza stan samochodu z hosta (skrypty moga go zmienic poza mapa swiata, np. start auta metarule 31). */
  refreshCar(): void {
    const car = this.host.car;
    if (!car) return;
    this.model.car = car.moving;
    this.model.fuel = car.fuel;
  }

  /** Dane panelu samochodu: aktywnosc, paliwo, wskaznik 0..70 px (0x4c5244: fuel*70/80000) i predkosc (wywolan kroku na iteracje). */
  /** Godzina doby jako hhmm (tarcza czasu na ekranie mapy). */
  clockHhmm(): number {
    return hhmmOf(this.host.ticks());
  }

  /** Czy samochod stoi w obszarze gracza i nie jedzie (warunek dostepu do bagaznika). */
  private carAtPlayer(): CarState | undefined {
    const st = this.host.car?.state;
    if (!st || !st.owned || this.host.car?.moving) return undefined;
    return st.parkedArea >= 0 && st.parkedArea === this.currentArea ? st : undefined;
  }

  /** Wklada do bagaznika (tylko gdy samochod stoi w tym samym miescie co gracz). */
  trunkStow(pid: number, count: number): boolean {
    const st = this.carAtPlayer();
    return st ? st.stow(pid, count, st.parkedArea) : false;
  }

  /** Wyjmuje z bagaznika; zwraca liczbe wyjetych (0 gdy auto gdzie indziej albo w ruchu). */
  trunkRetrieve(pid: number, count: number): number {
    const st = this.carAtPlayer();
    return st ? st.retrieve(pid, count, st.parkedArea) : 0;
  }

  /** Podpina rozmiar sztuki (proto.size z PRO) do liczenia pojemnosci bagaznika; dziala tez gdy auto stoi gdzie indziej. */
  setTrunkSizeOf(fn: (pid: number) => number): void {
    this.host.car?.state?.setSizeOf(fn);
  }

  /** Czy gracz moze teraz otworzyc bagaznik. */
  trunkAccessible(): boolean {
    return this.carAtPlayer() !== undefined;
  }

  /** Samochod gracza (undefined bez skryptow/samochodu): wlasnosc, obszar parkowania, zawartosc bagaznika. */
  carStateInfo():
    | {
        owned: boolean;
        parkedArea: number;
        trunkCount: number;
        trunk: { pid: number; count: number }[];
      }
    | undefined {
    const st = this.host.car?.state;
    if (!st) return undefined;
    return {
      owned: st.owned,
      parkedArea: st.parkedArea,
      trunkCount: st.trunkCount,
      trunk: st.toJSON().trunk,
    };
  }

  /** Tankowanie `cells` ogniwami (tylko gdy auto stoi w obszarze gracza); zwraca ile jednostek dolano, 0 = bak pelny/brak dostepu. */
  refuelCar(cells: number): number {
    const st = this.carAtPlayer();
    if (!st) return 0;
    const added = st.addFuelCells(cells);
    if (added > 0) this.refreshCar();
    return added;
  }

  /** Parkuje jadacy samochod w obszarze gracza (poza podroza); false gdy auto nie jedzie, trwa podroz albo obszar nieznany. */
  parkCar(): boolean {
    const car = this.host.car;
    if (!car?.state?.owned || !car.moving || this.model.target || this.currentArea < 0)
      return false;
    car.moving = false;
    this.model.car = false;
    car.area = this.currentArea;
    return true;
  }

  /** Rusza samochodem sprzed bramy miasta: tylko gdy stoi w obszarze gracza i ma paliwo. */
  startCar(): boolean {
    const car = this.host.car;
    const st = this.carAtPlayer();
    if (!car || !st || st.fuel <= 0 || !st.depart()) return false;
    car.moving = true;
    this.refreshCar();
    return true;
  }

  /** Widok panelu samochodu dla UI; undefined bez samochodu. Bagaznik tylko gdy auto stoi w biezacym obszarze. */
  carPanel(): CarPanelView | undefined {
    const car = this.host.car;
    const st = car?.state;
    if (!car || !st || !st.owned) return undefined;
    this.refreshCar();
    const atPlayer = this.carAtPlayer() !== undefined;
    return {
      moving: car.moving,
      fuel: st.fuel,
      fuelMax: FUEL_MAX,
      fuelPct: Math.round((st.fuel / FUEL_MAX) * 100),
      parkedArea: st.parkedArea,
      trunkAccessible: atPlayer,
      canStart: atPlayer && st.fuel > 0,
      canPark: car.moving && !this.model.target && this.currentArea >= 0,
      trunk: st.toJSON().trunk,
      trunkCount: st.trunkCount,
      trunkUsed: st.trunkUsed,
      trunkCapacity: st.trunkCapacity,
    };
  }

  carInfo(): { active: boolean; fuel: number; fuelMax: number; gauge: number; speed: number } {
    this.refreshCar();
    const fuel = this.model.fuel;
    return {
      active: this.model.car,
      fuel,
      fuelMax: FUEL_MAX,
      gauge: Math.min(70, Math.max(0, Math.trunc((fuel * 70) / FUEL_MAX))),
      speed: carStepCalls(this.model.car && fuel > 0, this.host.gvars),
    };
  }

  private env(): TravelEnv {
    const h = this.host;
    const rank = (n: string): number => h.perk(n);
    return {
      rng: h.rng,
      hhmm: hhmmOf(h.ticks()),
      gameTicks: h.ticks(),
      difficulty: h.difficulty(),
      luck: h.luck(),
      outdoorsman: h.outdoorsman(),
      pathfinder: rank('pathfinder'),
      ...(h.fixes ? { fixes: h.fixes } : {}),
      perks: { explorer: rank('explorer'), ranger: rank('ranger'), scout: rank('scout') },
      gvars: h.gvars,
      player: (s) => h.player(s),
    };
  }

  snapshot(): WorldmapSnapshot {
    return this.model.snapshot();
  }

  restore(s: WorldmapSnapshot): void {
    this.model.restore(s);
  }
}

export { hhmmOf };
