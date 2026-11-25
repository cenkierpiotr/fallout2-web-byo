/**
 * Campaign spine: caly watek kampanii Arroyo (nowa gra) -> ... -> Enclave -> koniec gry w jednym ciagu odcinkow.
 * Dla kazdego odcinka (miasta/obszaru z city.txt): ustawienie stanu tam, gdzie pelne przejscie questow byloby
 * nieproporcjonalne (GVAR, ekwipunek), wejscie jak z mapy swiata (`enterArea`), przejscie grafu exit gridow
 * (BFS po mapach obszaru, kazda mapa laduje sie, `map_enter_p_proc` bez bledow VM), wyjscie na mape swiata
 * i dojscie pieszo do wyjscia. Podroz po mapie swiata miedzy miastami: apps/web `worldmap-campaign-spine.test.ts`.
 * Raport: dokumentacja techniczna Uruchamiane z F2_GAME_DIR / F2_PATCH_DIR (bez nich skipIf).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseEndgameTable } from '@f2/formats';
import { selectEndgameSlides, type ExitGrid } from '../../index.js';
import { boot, GAME_DIR, PATCH_DIR, type Playthrough } from './harness.js';

// Zgodne z oryginalem wyjatki: zmienne zewnetrzne
// innych, niezaladowanych skryptow (ccgrdpa, rcfitrat); nie blokuja watku.
/** Mapy z city.txt bez pliku w danych gry (potwierdzone w VFS). */
const ABSENT_DATA = new Set(['NCREX', 'V15ENTB']);
const KNOWN =
  /store_external: zmienna zewnetrzna "guard\d_obj"|zmienna zewnetrzna "Fighter "|zmienna zewnetrzna "numDeathclaws"|rcfitrat:\w+@\d+ op=0x8015: store_external/;

interface Segment {
  id: string;
  label: string;
  /** Obszar z city.txt, do ktorego wchodzi sie z mapy swiata; brak = start nowej gry (ARTEMPLE). */
  area?: string;
  /** Mapa startowa nowej gry / jawny wybor mapy zamiast `enterArea`. */
  map?: string;
  /** Ustawienie stanu, ktory w grze wynika z wczesniejszych questow. */
  setup?: (p: Playthrough) => void;
  /** Odcinek poboczny (poza wymaganym szlakiem): raportowany, ale nie wymagany do konca gry. */
  side?: boolean;
  /** Obszar bez exit gridu na mape swiata (Enclave: koniec gry zamyka watek). */
  terminal?: boolean;
}

const SEGMENTS: Segment[] = [
  { id: 'S01', label: 'Arroyo (nowa gra)', map: 'ARTEMPLE' },
  {
    id: 'S02',
    label: 'Klamath',
    area: 'Klamath',
    // po swiatyni i rozmowie ze Starszym (M1): gracz zna droge do Klamath i Den
    setup: (p) => p.setGvar('GVAR_TALKED_TO_ELDER', 1),
  },
  { id: 'S03', label: 'Den', area: 'Den' },
  { id: 'S04', label: 'Modoc', area: 'Modoc' },
  {
    id: 'S05',
    label: 'Vault City',
    area: 'Vault City',
    // obywatelstwo (pelna sciezka: quests-vault-city.test.ts): drzwi krypty i Rada dostepne
    setup: (p) => p.setGvar('GVAR_VAULT_CITIZEN', 4),
  },
  { id: 'S06', label: 'Gecko', area: 'Gecko' },
  { id: 'S07', label: 'Broken Hills', area: 'Broken Hills' },
  { id: 'S08', label: 'New Reno', area: 'New Reno' },
  { id: 'S09', label: 'NCR', area: 'NCR' },
  { id: 'S10', label: 'Redding', area: 'Redding' },
  { id: 'S11', label: 'Vault 15', area: 'Vault 15' },
  {
    id: 'S12',
    label: 'Vault 13',
    area: 'Vault 13',
    // GECK odnaleziony (pelne przejscie wymaga calej krypty): skrypty reaguja na ten stan
    setup: (p) => p.setGvar('GVAR_VAULT13_FOUND_GECK', 1),
  },
  { id: 'S13', label: 'San Francisco', area: 'San Francisco' },
  {
    id: 'S14',
    label: 'Navarro',
    area: 'Navarro',
    // informacja o Enklawie od NCR (odslania Navarro/Enclave na mapie swiata w grze)
    setup: (p) => p.setGvar('GVAR_NCR_ENCLAVE_INFO', 1),
  },
  { id: 'S15', label: 'Enclave', area: 'Enclave', terminal: true },
  { id: 'B01', label: 'Sierra Army Base (boczny)', area: 'Sierra Army Base', side: true },
  { id: 'B02', label: 'Military Base (boczny)', area: 'Military Base', side: true },
];

interface MapResult {
  map: string;
  via: string;
  ok: boolean;
  /** Z: mapy nie ma w danych gry (wyciete tresci), nie jest to blad silnika */
  z?: boolean;
  problems: string[];
}
interface SegmentResult {
  seg: Segment;
  entry: string;
  maps: MapResult[];
  /** exit gridy na mape swiata (suma po mapach obszaru) */
  worldExits: number;
  /** dojscie pieszo do exit gridow: probowane / dotarte / zgodne z celem */
  walked: { tried: number; arrived: number; blocked: string[] };
  /** wyjscie na mape swiata przez exit grid (takeExit zwrocilo WORLDMAP) */
  leftToWorldmap: boolean;
}

/** Wynik do raportu (dokumentacja techniczna); wypisywany przy F2_SPINE_REPORT=1. */
const results: SegmentResult[] = [];
const extra: { id: string; label: string; ok: boolean; note: string }[] = [];

interface Entrance {
  map: string;
  hex?: number;
  elev?: number;
  on: boolean;
}

describe.skipIf(!GAME_DIR || !PATCH_DIR)(
  'campaign spine: Arroyo -> Enclave -> koniec (headless)',
  () => {
    let p: Playthrough;
    let cityText = '';
    beforeAll(async () => {
      p = await boot();
      cityText = Buffer.from(await p.vfs.open('data/city.txt')).toString('latin1');
    }, 120_000);
    afterAll(async () => {
      if (process.env.F2_SPINE_REPORT) {
        process.stdout.write(`SPINE_JSON ${JSON.stringify({ results, extra })}\n`);
      }
      await p?.close();
    });

    const nameOfIndex = (i: number): string | undefined =>
      p.maps.find((m) => m.index === i)?.mapName.toUpperCase();

    /** Wejscia obszaru z city.txt (pierwszy blok o tej nazwie), rozwiazane do nazw map. */
    function entrancesOf(areaName: string): Entrance[] {
      let cur = '';
      let seenArea = false;
      let done = false;
      const out: Entrance[] = [];
      for (const raw of cityText.split(/\r?\n/)) {
        const line = raw.replace(/;.*/, '').trim();
        const an = /^area_name=(.+)$/.exec(line);
        if (an) {
          cur = an[1]!.trim();
          if (cur.toLowerCase() === areaName.toLowerCase()) {
            if (seenArea) done = true;
            seenArea = true;
          }
          continue;
        }
        if (done || cur.toLowerCase() !== areaName.toLowerCase()) continue;
        const e = /^entrance_\d+=(On|Off),-?\d+,-?\d+,([^,]+),(-?\d+),(-?\d+)/i.exec(line);
        if (!e) continue;
        const def = p.maps.find((m) => m.lookupName.toLowerCase() === e[2]!.trim().toLowerCase());
        if (!def) continue;
        const elev = Number(e[3]);
        const hex = Number(e[4]);
        out.push({
          map: def.mapName.toUpperCase(),
          on: /on/i.test(e[1]!),
          ...(hex >= 0 ? { hex } : {}),
          ...(elev >= 0 ? { elev } : {}),
        });
      }
      return out;
    }

    /** Wejscie na mape z odczytem bledow VM (z filtrem znanych); wyjatki ladowania to blad mapy. */
    async function visit(
      map: string,
      hex: number | undefined,
      elev: number | undefined,
      via: string,
    ): Promise<MapResult> {
      const mark = p.logMark();
      const res: MapResult = { map, via, ok: true, problems: [] };
      if (ABSENT_DATA.has(map))
        return { ...res, z: true, problems: ['Z: brak pliku mapy w danych gry'] };
      try {
        try {
          await p.enter(map, hex, elev);
        } catch (e) {
          // domyslny kafel naglowka poza mapa: ponowna proba ze srodka mapy
          if (!/outOfMap/.test((e as Error).message)) throw e;
          await p.enter(map, 20100, elev ?? 0);
        }
        p.tick(10);
        p.rt.scheduler.runMapUpdateAll();
      } catch (e) {
        res.ok = false;
        res.problems.push(`WYJATEK ${(e as Error).message}`);
        return res;
      }
      res.problems = p.problems(mark).filter((l) => !KNOWN.test(l));
      res.ok = res.problems.length === 0;
      return res;
    }

    async function runSegment(seg: Segment): Promise<SegmentResult> {
      seg.setup?.(p);
      const seeds: { map: string; hex?: number; elev?: number; via: string }[] = [];
      let entry: string;
      if (seg.map) {
        entry = seg.map;
        seeds.push({ map: seg.map, via: 'start nowej gry' });
      } else {
        entry = await p.enterArea(seg.area!);
        seeds.push({ map: entry, via: `mapa swiata (${seg.area})` });
      }
      // pozostale wejscia z city.txt (wlaczane skryptami po drodze: Off); nie sa osiagalne exit gridem z wejscia
      if (seg.area || seg.map) {
        const area = seg.area ?? 'Arroyo';
        for (const e of entrancesOf(area))
          seeds.push({
            map: e.map,
            ...(e.hex !== undefined ? { hex: e.hex } : {}),
            ...(e.elev !== undefined ? { elev: e.elev } : {}),
            via: `city.txt wejscie ${e.on ? 'On' : 'Off'}`,
          });
      }
      const maps: MapResult[] = [];
      const seen = new Set<string>();
      const queue = [...seeds];
      let worldExits = 0;
      const walked = { tried: 0, arrived: 0, blocked: [] as string[] };
      let leftToWorldmap = false;
      while (queue.length > 0 && maps.length < 80) {
        const q = queue.shift()!;
        if (seen.has(q.map)) continue;
        seen.add(q.map);
        const r = await visit(q.map, q.hex, q.elev, q.via);
        maps.push(r);
        if (r.z) continue;
        if (!r.ok && r.problems[0]?.startsWith('WYJATEK')) continue;
        const exits: ExitGrid[] = [...p.world.map.exitGrids];
        const byDest = new Map<string, ExitGrid>();
        const world: ExitGrid[] = [];
        for (const eg of exits) {
          if (eg.destMap < 0) {
            worldExits++;
            world.push(eg);
            continue;
          }
          const dn = nameOfIndex(eg.destMap);
          if (dn === undefined) {
            maps.push({
              map: `#${eg.destMap}`,
              via: `${q.map}:${eg.hex}`,
              ok: false,
              problems: ['nieznany indeks mapy docelowej'],
            });
            continue;
          }
          if (!byDest.has(dn)) byDest.set(dn, eg);
        }
        for (const [dn, eg] of byDest) {
          if (!seen.has(dn))
            queue.push({
              map: dn,
              ...(eg.destHex >= 0 ? { hex: eg.destHex } : {}),
              ...(eg.destElevation >= 0 ? { elev: eg.destElevation } : {}),
              via: `exit grid ${q.map}:${eg.hex}`,
            });
        }
        // dojscie pieszo do jednego exit gridu na inna mape i jednego na mape swiata (na ta sama elewacje co gracz)
        const here = p.player.elevation;
        const pickMap = [...byDest.values()].find((e) => e.elevation === here);
        const pickWorld = world.find((e) => e.elevation === here);
        for (const eg of [pickMap, pickWorld]) {
          if (!eg) continue;
          walked.tried++;
          const startMap = p.mapName();
          const w = await p.walk(eg.hex);
          if (w.exit && w.exit.hex === eg.hex) {
            walked.arrived++;
            if (eg.destMap < 0) {
              expect(await p.takeExit(w.exit)).toBe('WORLDMAP');
              leftToWorldmap = true;
            }
            void startMap;
          } else {
            walked.blocked.push(`${q.map}:${eg.hex}`);
          }
          // powrot na mape (walk mogl przesunac gracza; takeExit na WORLDMAP nie zmienia mapy)
          if (p.mapName() !== q.map) await p.enter(q.map, q.hex, q.elev);
        }
        if (!leftToWorldmap && world[0]) {
          // exit grid na mape swiata jako cel: skrypt/silnik rozpoznaje go jako wyjscie (destMap < 0)
          expect(await p.takeExit(world[0])).toBe('WORLDMAP');
          leftToWorldmap = true;
        }
      }
      return { seg, entry, maps, worldExits, walked, leftToWorldmap };
    }

    for (const seg of SEGMENTS) {
      it(`${seg.id} ${seg.label}: mapy szlaku laduja sie, skrypty bez bledow VM, przejscia dzialaja`, async () => {
        const r = await runSegment(seg);
        results.push(r);
        const bad = r.maps
          .filter((m) => !m.ok)
          .map((m) => `${m.map} (${m.via}): ${m.problems.join('; ')}`);
        expect(bad).toEqual([]);
        expect(r.maps.length).toBeGreaterThan(0);
        if (seg.terminal) expect(r.worldExits).toBe(0);
        else {
          expect(r.worldExits).toBeGreaterThan(0);
          expect(r.leftToWorldmap).toBe(true);
        }
      }, 600_000);
    }

    it('K01 koniec gry: Horrigan, reaktor, odliczanie 10 min, slajdy z endgame.txt', async () => {
      const mark = p.logMark();
      await p.enter('ENCFITE');
      const frank = p.byPid(0x1000120)[0];
      expect(frank).toBeDefined();
      p.rt.applyCombatDamage(frank!.id, p.player.id, 100000);
      expect(p.gvar('GVAR_ENCLAVE_FRANK_DEAD')).toBe(1);
      await p.enter('ENCRCTR');
      const reactor = p.byPid(0x20000b6).find((o) => p.rt.hasObjectProc(o.id, 'damage_p_proc'));
      expect(reactor).toBeDefined();
      p.rt.applyWeaponHit(reactor!.id, p.player.id, p.player.id, 6);
      expect(p.gvar('GVAR_ENCLAVE_REACTOR')).toBe(1);
      await p.enter('ENCPRES');
      p.rt.clearEndSignals();
      p.world.clock.advance(6100);
      p.rt.scheduler.runMapUpdateAll();
      expect(p.rt.endGameRequested).toBe(true);
      const text = Buffer.from(await p.vfs.open('data/endgame.txt')).toString('latin1');
      const slides = parseEndgameTable(text).items;
      const sel = selectEndgameSlides(slides, p.vars);
      expect(sel.length).toBeGreaterThan(0);
      expect(p.problems(mark).filter((l) => !KNOWN.test(l))).toEqual([]);
      extra.push({
        id: 'K01',
        label: 'Koniec gry (ENCFITE -> ENCRCTR -> ENCPRES)',
        ok: true,
        note: `Horrigan, reaktor, odliczanie, ${sel.length} slajdow`,
      });
    }, 120_000);
  },
);
