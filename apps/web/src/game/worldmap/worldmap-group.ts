import {
  directionTo,
  hexDistance,
  hexInDirection,
  type Direction,
  type Hex,
} from '@f2/engine-core';
import type { EncounterDef, EncounterRelation, EncounterSlot, WorldmapConfig } from '@f2/formats';
import { evalCondition } from '@f2/rules';
import { toWmCondition } from './worldmap-data';
import type { EncounterEvent } from './worldmap-model';

export interface GroupItem {
  pid: number;
  count: number;
  wielded: boolean;
}
export interface GroupMember {
  pid: number;
  /** Numer skryptu z `Script:` (create_object_sid). */
  script: number | undefined;
  dead: boolean;
  items: GroupItem[];
  /** team_num grupy po rozdzieleniu druzyn (relacje), -1 gdy nie podano. */
  team: number;
  /** Czlonek wrogi graczowi (strona FIGHTING/AMBUSH Player). */
  hostile: boolean;
  /** Zasadzka: ustawiony blisko gracza, nie w formacji. */
  ambush: boolean;
  hex: Hex;
  /** Indeks grupy w `ev.groups` (lancuch relacji `Enc:`). */
  group: number;
}

export interface GroupEnv {
  rng: { int(min: number, max: number): number };
  /** Statystyka gracza (Perception, Level...), do `Distance:` i warunkow. */
  player(stat: string): number;
  global(idx: number): number;
  time(): number;
  /** Czy heks jest wolny (nie zajety, w obrebie mapy). */
  free(hex: Hex): boolean;
  /** Czy istnieje sciezka od gracza do heksa (exe 0x4c1a64: A* z heksa gracza); brak = nie sprawdzaj. */
  reachable?(hex: Hex): boolean;
  /** Liczebnosc druzyny gracza (z graczem; exe 0x495010): > 2 daje +2 krytterow na grupe. */
  partySize?: number;
  /** Losowe punkty startowe mapy spotkania (`random_start_point_N` z maps.txt) dla formacji innych niz Surrounding. */
  starts?: readonly Hex[];
  /** Gracz ma perk Cautious Nature (+3 do odleglosci Surrounding). */
  cautiousNature?: boolean;
  /** Fortune Finder (exe 0x4c145e): ilosc pid 41 (pieniadze) w ekwipunku krytera x2. */
  fortuneFinder?: boolean;
}

/**
 * Liczba czlonkow slotow wg silnik gry 0x4c11fc (D): slot z Ratio = max(1, trunc(Num * ratio / 100)), gdzie Num to
 * CALA liczba krytterow grupy (nie "reszta po slotach stalych"); slot bez Ratio = 1 sztuka.
 */
export function slotCounts(slots: readonly EncounterSlot[], total: number): number[] {
  return slots.map((s) =>
    s.ratio === undefined ? 1 : Math.max(1, Math.trunc((total * s.ratio) / 100)),
  );
}

/** Parametry slotu istotne dla rozmieszczenia (exe: +0x3c distance, +0x40 tilenum). */
export interface SlotPlacement {
  distance?: number | undefined;
  tilenum?: number | undefined;
}

const MAX_ATTEMPTS = 26;
const MAX_SPREAD = 25;

/**
 * Rozmieszczenie heksow grupy wg silnik gry (pewnosc D): ustawienie 0x4c155c, rozmieszczenie 0x4c16f0, walidacja 0x4c1a64.
 * Indeks formacji (grupa+0x28) wg tablicy 0x51de6c: 0 Surrounding, 1 straight_line, 2 double_line, 3 wedge, 4 cone, 5 huddle.
 * - Surrounding: odleglosc = `distance` slotu, a gdy 0: Perception + rand(-2,2) (+3 z perkiem Cautious Nature), min 0; baza = `tilenum`
 *   slotu albo heks w kierunku dir0 (losowy 0..5, obracany o 1 po kazdym krytterze) w tej odleglosci od gracza;
 *   wynik = baza przesunieta o rand(0, odleglosc/2) w losowym kierunku. Pole `distance` grupy NIE jest uzywane przy rozmieszczaniu.
 * - Pozostale formacje: punkt startowy = losowy `random_start_point` mapy (brak: heks gracza); dir = kierunek start -> gracz.
 *   Dwie galezie (strona t = 0/1, naprzemiennie; krok +1 i +5 mod 6): straight_line i double_line to ten sam kod w exe
 *   (kazdy kolejny: dwa kroki `spacing` w kierunkach dir+s i dir+2s, zygzak prostopadly do frontu); wedge: jeden krok w dir+s
 *   (dwa promienie +-60 stopni od startu); cone: jak wedge ale w dir+3+s (promienie od gracza); huddle: dir0 = dir0+1, krok
 *   `spacing` od ostatniego heksa (spirala sześciokata).
 * - Walidacja: heks zajety/zablokowany odpada (`env.free` + zajete przez grupe + `env.reachable`: sciezka A* od gracza jak w exe),
 *   dystans od bazy > 25 = porazka; do 26 prob na krytter, licznik wzorca rosnie takze po porazce. Porazka = -1 (krytter nie powstaje).
 * `spacing` 0 w pliku traktowane jak domyslne 1 (exe: domyslnie 1).
 */
export function layoutHexes(
  def: EncounterDef,
  n: number,
  player: Hex,
  env: GroupEnv,
  ambush = false,
  slots: readonly SlotPlacement[] = [],
): Hex[] {
  void ambush; // exe: AMBUSH nie zmienia rozmieszczenia, tylko ustawia cel/walke (0x4c0fa4)
  const kind = def.position.kind;
  const sp = def.position.spacing > 0 ? Math.trunc(def.position.spacing) : 1;
  const surrounding = kind === 'Surrounding';
  const dir = [0, 0] as number[];
  const tile = [player, player] as number[];
  const step = [1, 5];
  let t: 0 | 1 = 0;
  let counter = 0;
  let base = player;
  if (surrounding) {
    dir[0] = env.rng.int(0, 5);
  } else {
    const starts = env.starts ?? [];
    const st = starts.length > 0 ? (starts[env.rng.int(0, starts.length - 1)] ?? player) : player;
    tile[0] = tile[1] = st;
    const d = directionTo(st, player);
    dir[0] = dir[1] = d;
    base = st;
  }
  const mv = (h: Hex, d: number, k: number): Hex =>
    hexInDirection(h, (((d % 6) + 6) % 6) as Direction, k);
  const taken = new Set<Hex>([player]);
  const out: Hex[] = [];
  for (let i = 0; i < n; i++) {
    const sl = slots[i];
    let placed: Hex = -1;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      let cand: Hex;
      if (surrounding) {
        let dist = sl?.distance ?? 0;
        if (dist === 0) {
          dist = env.player('Perception') + env.rng.int(-2, 2) + (env.cautiousNature ? 3 : 0);
          if (dist < 0) dist = 0;
        }
        const tn = sl?.tilenum;
        const b = tn !== undefined && tn !== -1 ? tn : mv(player, dir[0], dist);
        dir[0] = (dir[0] + 1) % 6;
        base = b;
        cand = mv(b, dir[0] + env.rng.int(0, 5), env.rng.int(0, Math.trunc(dist / 2)));
      } else if (counter === 0) {
        cand = tile[0]!;
      } else if (kind === 'straight_line' || kind === 'double_line') {
        const d1 = (dir[t]! + step[t]!) % 6;
        const d2 = (d1 + step[t]!) % 6;
        cand = mv(mv(tile[t]!, d1, sp), d2, sp);
        tile[t] = cand;
        t = t === 0 ? 1 : 0;
      } else if (kind === 'wedge' || kind === 'cone') {
        const d = (dir[t]! + (kind === 'cone' ? 3 : 0) + step[t]!) % 6;
        cand = mv(tile[t]!, d, sp);
        tile[t] = cand;
        t = t === 0 ? 1 : 0;
      } else {
        dir[0] = (dir[0]! + 1) % 6;
        cand = mv(tile[0]!, dir[0], sp);
        tile[0] = cand;
      }
      counter++;
      if (
        cand >= 0 &&
        !taken.has(cand) &&
        env.free(cand) &&
        (env.reachable?.(cand) ?? true) &&
        hexDistance(base, cand) <= MAX_SPREAD
      ) {
        placed = cand;
        break;
      }
    }
    if (placed >= 0) taken.add(placed);
    out.push(placed);
  }
  return out;
}

export interface TeamPlan {
  team: number;
  hostile: boolean;
  ambush: boolean;
}

/**
 * Rozdziela druzyny grup wg lancucha relacji `Enc:` (podzial druzyn: Z, wnioskowany z worldmap.txt; exe 0x4c0fa4 ustawia tylko cel/walke: AMBUSH = grupa atakuje gracza, FIGHTING = dwie sasiednie grupy atakuja sie nawzajem, AND = bez akcji).
 * AND = ta sama strona; FIGHTING/AMBUSH z 'player' = strona wrogia graczowi (AMBUSH dodatkowo ze zasadzka);
 * FIGHTING miedzy grupami = rozne druzyny wrogie sobie (druzyna 0 = gracz zarezerwowana). Bez relacji: team_num grupy.
 */
export function planTeams(
  defs: readonly (EncounterDef | undefined)[],
  relations: readonly EncounterRelation[] | undefined,
): TeamPlan[] {
  const n = defs.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x]!)));
  const rels = relations ?? [];
  for (const r of rels)
    if (r.op === 'AND' && r.left !== 'player' && r.right !== 'player')
      parent[find(r.right)] = find(r.left);
  const hostile = new Set<number>();
  const ambush = new Set<number>();
  const enemies: [number, number][] = [];
  for (const r of rels) {
    if (r.op === 'AND') continue;
    if (r.left === 'player' && r.right === 'player') continue;
    if (r.left === 'player' || r.right === 'player') {
      const g = r.left === 'player' ? (r.right as number) : (r.left as number);
      hostile.add(find(g));
      if (r.op === 'AMBUSH') ambush.add(find(g));
    } else enemies.push([find(r.left), find(r.right)]);
  }
  const used = new Set<number>([0]);
  const sideTeam = new Map<number, number>();
  const next = (from: number): number => {
    let t = Math.max(1, from);
    while (used.has(t)) t++;
    return t;
  };
  const roots = [...new Set(parent.map((_, i) => find(i)))];
  const constrained = new Set<number>([...hostile, ...enemies.flat()]);
  for (const r of roots) {
    const want = defs[r]?.teamNum ?? -1;
    if (!constrained.has(r)) {
      sideTeam.set(r, want);
      if (want >= 0) used.add(want);
      continue;
    }
    // strona wroga: druzyna unikalna, nigdy 0
    const t = want > 0 && !used.has(want) ? want : next(want > 0 ? want : 1);
    used.add(t);
    sideTeam.set(r, t);
  }
  return defs.map((_, i) => ({
    team: sideTeam.get(find(i)) ?? -1,
    hostile: hostile.has(find(i)),
    ambush: ambush.has(find(i)),
  }));
}

/** Plan grupy NPC dla spotkania: czlonkowie z pidami, ekwipunkiem i heksami (bez tworzenia obiektow). */
export function planEncounterGroup(
  cfg: Pick<WorldmapConfig, 'encounters'>,
  ev: Pick<EncounterEvent, 'groups'> & { relations?: readonly EncounterRelation[] },
  player: Hex,
  env: GroupEnv,
): GroupMember[] {
  const members: GroupMember[] = [];
  // Enctr(Num_Critters) w warunkach slotow = liczba krytterow rzucona dla biezacej grupy (Z)
  let groupTotal = 0;
  const plans = planTeams(
    ev.groups.map((g) => cfg.encounters.get(g.name)),
    ev.relations,
  );
  const wmEnv = {
    player: (s: string) => env.player(s),
    global: (i: number) => env.global(i),
    time: () => env.time(),
    numCritters: () => groupTotal,
    rand: (pct: number) => env.rng.int(1, 100) <= pct,
  };
  for (const [gi, g] of ev.groups.entries()) {
    const def = cfg.encounters.get(g.name);
    if (!def) continue;
    // exe 0x4c0fa4: korekta trudnosci (-2/+2) jest martwym kodem (zmienna stala 1), zostaje tylko +2 dla druzyny > 2
    const roll = env.rng.int(g.min, Math.max(g.min, g.max));
    const total = roll + ((env.partySize ?? 1) > 2 ? 2 : 0);
    groupTotal = total;
    const slots = def.types.filter(
      (s) => !s.condition || evalCondition(toWmCondition(s.condition), wmEnv),
    );
    const tp = plans[gi] ?? { team: def.teamNum, hostile: false, ambush: false };
    const counts = slotCounts(slots, total);
    const planned: (Omit<GroupMember, 'hex' | 'group'> & { place: SlotPlacement })[] = [];
    slots.forEach((s, si) => {
      for (let k = 0; k < (counts[si] ?? 0); k++)
        planned.push({
          pid: s.pid,
          place: { distance: s.distance, tilenum: s.tilenum },
          script: s.script,
          dead: s.dead,
          team: tp.team,
          hostile: tp.hostile,
          ambush: tp.ambush,
          items: s.items.flatMap((it) => {
            const base = env.rng.int(it.min, Math.max(it.min, it.max));
            const count = env.fortuneFinder && it.pid === 41 ? base * 2 : base;
            return [{ pid: it.pid, count, wielded: it.wielded }];
          }),
        });
    });
    const hexes = layoutHexes(
      def,
      planned.length,
      player,
      env,
      tp.ambush,
      planned.map((m) => m.place),
    );
    planned.forEach((pm, i) => {
      const hex = hexes[i];
      if (hex === undefined || hex < 0) return;
      const { place, ...m } = pm;
      void place;
      members.push({ ...m, hex, group: gi });
    });
  }
  return members;
}

/** Fragment ScriptRuntime potrzebny do postawienia grupy (create_object, inwentarz, team). */
export interface GroupSpawner {
  createObject(pid: number, hex: number, elevation: number, sid: number): number;
  addMultObjsToInven(who: number, item: number, count: number): void;
  wieldObjCritter(who: number, item: number): void;
  critterAddTrait(id: number, kind: number, trait: number, amount: number): number;
  /** Slot `Dead`: krytter startuje jako zwloki (opcjonalne). */
  killCritter?(id: number): void;
  /** exe 0x4c11fc: po ustawieniu krytter obraca sie w strone gracza (opcjonalne). */
  faceTowards?(id: number, target: number): void;
}

/** Zadanie walki ustawione przez exe (0x4a45d4): atakujacy rozpoczyna walke z celem (id krytterow/gracza). */
export interface CombatRequest {
  attacker: number;
  defender: number;
}

/**
 * Zadanie walki wg lancucha relacji (exe 0x4c0fa6, D; strona 'player' = Z): pierwszy krytter grupy A jest atakujacym.
 * AMBUSH grupa->gracz: atakujacy = pierwszy krytter grupy, cel = gracz; FIGHTING miedzy grupami: pierwszy krytter lewej
 * grupy atakuje pierwszego krytera prawej; AMBUSH miedzy grupami tak samo; AND i FIGHTING z graczem = brak akcji.
 * Walka po pierwszym zadaniu jest juz aktywna, wiec zwracane jest tylko pierwsze mozliwe zadanie (pomijane grupy bez krytterow).
 */
export function planCombatRequest(
  relations: readonly EncounterRelation[] | undefined,
  firstByGroup: ReadonlyMap<number, number>,
  playerId: number,
): CombatRequest | undefined {
  for (const r of relations ?? []) {
    if (r.op === 'AND') continue;
    const l = r.left === 'player' ? playerId : firstByGroup.get(r.left);
    const rt = r.right === 'player' ? playerId : firstByGroup.get(r.right);
    if (l === undefined || rt === undefined || l === rt) continue;
    if (r.left === 'player' && r.right === 'player') continue;
    if (r.left === 'player' || r.right === 'player') {
      if (r.op !== 'AMBUSH') continue;
      return { attacker: r.left === 'player' ? rt : l, defender: playerId };
    }
    return { attacker: l, defender: rt };
  }
  return undefined;
}

/** Tworzy czlonkow grupy na biezacej mapie; zwraca id utworzonych krytterow. */
export function spawnGroup(
  rt: GroupSpawner,
  members: readonly GroupMember[],
  elevation: number,
  /** Id i heks gracza (obrot krytterow w jego strone) oraz wyjscie: pierwszy krytter kazdej grupy. */
  opts: { player?: number; firstByGroup?: Map<number, number> } = {},
): number[] {
  const ids: number[] = [];
  for (const m of members) {
    const id = rt.createObject(m.pid, m.hex, elevation, m.script ?? 0);
    if (id < 0) continue;
    ids.push(id);
    if (!opts.firstByGroup?.has(m.group)) opts.firstByGroup?.set(m.group, id);
    if (opts.player !== undefined) rt.faceTowards?.(id, opts.player);
    if (m.team >= 0) rt.critterAddTrait(id, 1, 6, m.team);
    if (m.dead) rt.killCritter?.(id);
    for (const it of m.items) {
      const item = rt.createObject(it.pid, m.hex, elevation, 0);
      if (item < 0) continue;
      rt.addMultObjsToInven(id, item, it.count);
      if (it.wielded) rt.wieldObjCritter(id, item);
    }
  }
  return ids;
}
