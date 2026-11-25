import { writeFileSync } from 'node:fs';
import {
  renderMapsCoverage,
  type KnownException,
  type MapSmokeResult,
} from './maps-smoke-report.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { lstName, parseLst, parseMapsTxt, type MapDef } from '@f2/formats';
import { openGameFolderNode } from '@f2/vfs/node';
import type { NodeVfs } from '@f2/vfs/node';
import {
  GameClock,
  GameVars,
  MapLoader,
  MessageSource,
  MovementSystem,
  ProtoCache,
  ScriptRuntime,
  createGameView,
  createViewDialogHooks,
  indexObject,
  openGameFile,
  type GameMap,
  type GameObject,
  type World,
} from '../index.js';
import { fake } from './helpers.js';

const dir = process.env.F2_GAME_DIR;
const patchDir = process.env.F2_PATCH_DIR;
/** Gdy ustawione: zapis wynikow (JSON) do tej sciezki, dla tools/maps-coverage. */
const OUT = process.env.F2_MAPS_SMOKE_OUT;

/** Kosmetyczne/walkowe opkody akceptowane (jak w klamath-npcs.test.ts). */
const ACCEPTED =
  /^(reg_anim|critter_add_trait|get_critter_stat|obj_can_see_obj|obj_lock|cur_map_index|critter_state|mouse_state_flag)/;
const DEFERRED = /^(do_check|attack|critter_injure|metarule\(46\)|script_op_80e4)/;

const FID_DIRS = ['items', 'critters', 'scenery', 'walls', 'tiles', 'misc'] as const;

/**
 * Znane wyjatki (kazdy ma uzasadnienie; reszta VmError/unsupported oblewa test).
 * Zrodlo: handlery 0x46bf90/0x46bec8 w silnik gry (specyfikacja formatu) zglaszaja programFatalError "External variable %s does not
 * exist" przy store/fetch na nieeksportowanej zmiennej, wiec oryginal ma ten sam blad (przerwanie danej procedury).
 */
const KNOWN: KnownException[] = [
  {
    id: 'ext-ncr4-numdeathclaws',
    map: 'ncr4',
    pattern:
      /siexit:timed_event_p_proc.*fetch_external: zmienna zewnetrzna "numDeathclaws" nie istnieje/,
    reason:
      'Skrypt siexit czyta "numDeathclaws", a ncr4 eksportuje "numDeathClaws" (inna wielkosc liter); nazwy zewnetrzne sa w oryginale rozrozniane (strcmp), wiec oryginal tez zglasza blad. Blad vanilla, bez wplywu na gre.',
  },
  {
    id: 'ext-redment-fighter',
    map: 'redment',
    pattern: /rcfitrat:Find_Ptr.*store_external: zmienna zewnetrzna "Fighter " nie istnieje/,
    reason:
      'rcfitrat zapisuje "Fighter " (z koncowa spacja, budowane z konkatenacji), a redment eksportuje tylko Molerat_Ptr*/Deathclaw_Ptr*; nic nie eksportuje "Fighter *". Oryginal tez przerywa Find_Ptr (walki szczurow).',
  },
  {
    id: 'ext-navarro-guard',
    map: 'navarro',
    pattern:
      /ccgrdpa:map_enter_p_proc.*store_external: zmienna zewnetrzna "guard\d_obj" nie istnieje/,
    reason:
      'ccgrdpa robi store_external guard1_obj..guard3_obj, a zaden program na mapie ich nie eksportuje (nazwy tylko w ccgrdpa); oryginal tez przerywa map_enter tego straznika.',
  },
  {
    id: 'op-sfall-815c',
    map: 'rndparih',
    pattern: /ecpariah:critter_p_proc.*nieobslugiwany opkod 0x815c/,
    reason:
      'ecpariah.int istnieje tylko w patchu nieoficjalnym i uzywa opkodow 0x815a-0x815c spoza tabeli vanilla (0x804c-0x8155; sfall/patch); semantyka Z, nieimplementowane. Dotyczy debugowego krytera Pariah na mapie losowej.',
  },
  {
    id: 'op-play-gmovie',
    map: 'arvillag',
    pattern: /^play_gmovie/,
    reason:
      'play_gmovie: odtwarzanie filmu MVE przy starcie mapy; poza zakresem silnika mapy (wideo osobno).',
  },
];

KNOWN.push({
  id: 'render-v15ent-tiles',
  map: 'v15ent',
  pattern: /^kafel poza tiles\.lst/,
  reason:
    'Poziom 1 mapy v15ent (flags=8) ma id kafli spoza tiles.lst (anomalia danych); renderer pomija kafel bez wpisu (tileFrame zwraca undefined), bez wplywu na gre.',
});

/** Mapy z eksporterem zmiennych zewnetrznych w innej mapie: oryginal trzyma je globalnie, wiec wczytujemy eksportera wczesniej. */
const PRELOAD: Record<string, string[]> = { denres1: ['denbus1'] };

/** Mapy z maps.txt bez pliku .map w MASTER.DAT/PATCH000/patchu (nieladowalne rowniez w oryginale). */
const NO_MAP_FILE = new Set(['v15entb', 'ncrex', 'bhrndmnt', '07desert', 'dsrt13']);

/** Deterministyczny, ale zroznicowany rng (stala 0.5 wpada w nieskonczona petle losowania w dnslvrun). */
function lcg(seed = 12345): () => number {
  let x = seed;
  return () => {
    x = (Math.imul(x, 1103515245) + 12345) & 0x7fffffff;
    return x / 0x80000000;
  };
}

describe.skipIf(!dir || !patchDir)('smoke: wszystkie mapy z maps.txt', () => {
  let vfs: NodeVfs;
  let loader: MapLoader;
  let msgs: MessageSource;
  let defs: MapDef[] = [];
  const lists = new Map<string, string[]>();
  const results: MapSmokeResult[] = [];

  beforeAll(async () => {
    vfs = await openGameFolderNode(dir!, patchDir);
    loader = new MapLoader(vfs, new ProtoCache(vfs));
    msgs = new MessageSource(vfs, { language: 'english' });
    defs = parseMapsTxt(new TextDecoder('latin1').decode(await openGameFile(vfs, 'data/maps.txt')));
    for (const d of FID_DIRS) {
      try {
        lists.set(d, parseLst(await openGameFile(vfs, `art/${d}/${d}.lst`)).map(lstName));
      } catch {
        lists.set(d, []);
      }
    }
  });
  afterAll(async () => {
    if (OUT) writeFileSync(OUT, JSON.stringify(results, null, 1));
    await vfs.close();
  });

  async function renderIssues(map: GameMap): Promise<string[]> {
    const issues = new Set<string>();
    const tl = lists.get('tiles')!;
    for (const lv of map.tiles) {
      if (!lv) continue;
      for (const arr of [lv.floor, lv.roof]) {
        const bad = new Set<number>();
        for (const t of arr) if (t >= tl.length) bad.add(t);
        if (bad.size) issues.add(`kafel poza tiles.lst: ${[...bad].slice(0, 5).join(',')}`);
      }
    }
    const seen = new Set<number>();
    for (const o of map.objects) {
      if (seen.has(o.fid)) continue;
      seen.add(o.fid);
      const type = (o.fid >> 24) & 0xf;
      const idx = o.fid & 0xfff;
      const d = FID_DIRS[type];
      if (!d) continue;
      const list = lists.get(d)!;
      const name = list[idx];
      if (!name) {
        issues.add(`fid ${o.fid.toString(16)}: brak wpisu ${d}.lst[${idx}]`);
        continue;
      }
      if (type === 1) continue; // pliki krytera zaleza od anim/broni
      try {
        await openGameFile(vfs, `art/${d}/${name}`.toLowerCase());
      } catch {
        issues.add(`fid ${o.fid.toString(16)}: brak pliku art/${d}/${name}`);
      }
    }
    return [...issues];
  }

  it('wczytuje, uruchamia start+map_enter i sprawdza renderowalnosc kazdej mapy', async () => {
    for (const def of defs) {
      const r: MapSmokeResult = {
        index: def.index,
        lookupName: def.lookupName,
        mapName: def.mapName,
        loaded: false,
        objects: 0,
        scripts: 0,
        vmErrors: [],
        unsupported: [],
        missingScripts: [],
        renderIssues: [],
        known: [],
      };
      results.push(r);
      let map: GameMap;
      try {
        map = await loader.load(def.mapName);
      } catch (e) {
        r.loadError = (e as Error).message;
        if (NO_MAP_FILE.has(def.mapName.toLowerCase())) r.known.push('brak-pliku-map');
        continue;
      }
      r.loaded = true;
      r.objects = map.objects.length;
      r.scripts = map.scripts.length;
      r.renderIssues = await renderIssues(map);
      const player: GameObject = fake(1, map.header.playerHex, 0, {
        kind: 'critter',
        flags: 0,
        raw: new Int32Array(0),
      });
      player.id = 0x10000;
      map.objects.push(player);
      indexObject(map, player);
      const view = createGameView();
      const world: World = {
        map,
        player,
        clock: new GameClock(),
        movement: new MovementSystem(map),
        loader,
        view,
      };
      const vars = new GameVars(Int32Array.from({ length: 700 }, () => 0));
      const rt = new ScriptRuntime(world, msgs, vars, createViewDialogHooks(view), {
        vfs,
        rng: lcg(),
      });
      world.scripts = rt;
      try {
        for (const ex of PRELOAD[def.mapName.toLowerCase()] ?? []) {
          // eksporter zmiennych zewnetrznych (globalnych w oryginale) wczytany wczesniej na tym samym runtime
          const em = await loader.load(ex);
          world.map = em;
          world.movement = new MovementSystem(em);
          await rt.loadScriptsForMap(em);
          world.map = map;
          world.movement = new MovementSystem(map);
        }
        await rt.loadScriptsForMap(map);
        for (let i = 0; i < 3; i++) rt.tick(10);
      } catch (e) {
        r.vmErrors.push(`wyjatek runtime: ${(e as Error).message}`);
      }
      for (const l of rt.log) {
        if (l.kind === 'vmError') r.vmErrors.push(l.message);
        else if (l.kind === 'missingScript') r.missingScripts.push(l.message);
        else if (l.kind === 'unsupported' && !ACCEPTED.test(l.message) && !DEFERRED.test(l.message))
          r.unsupported.push(l.message);
      }
    }
    // znane wyjatki: przenosimy z list bledow do r.known
    for (const r of results) {
      const take = (arr: string[]): string[] =>
        arr.filter((m) => {
          const k = KNOWN.find((x) => x.map === r.mapName.toLowerCase() && x.pattern.test(m));
          if (!k) return true;
          if (!r.known.includes(k.id)) r.known.push(k.id);
          return false;
        });
      r.vmErrors = take(r.vmErrors);
      r.unsupported = take(r.unsupported);
      r.renderIssues = take(r.renderIssues);
    }
    if (OUT)
      writeFileSync(
        OUT.replace(/\.json$/, '') + '.md',
        renderMapsCoverage(results, KNOWN, NO_MAP_FILE),
      );
    expect(results.length).toBe(defs.length);
    expect(
      results
        .filter((r) => !r.loaded && !NO_MAP_FILE.has(r.mapName.toLowerCase()))
        .map((r) => `${r.mapName}: ${r.loadError}`),
    ).toEqual([]);
    expect(
      results.filter((r) => r.loaded && r.vmErrors.length).map((r) => [r.mapName, r.vmErrors]),
    ).toEqual([]);
    expect(
      results
        .filter((r) => r.loaded && r.unsupported.length)
        .map((r) => [r.mapName, r.unsupported]),
    ).toEqual([]);
    expect(
      results
        .filter((r) => r.loaded && r.renderIssues.length)
        .map((r) => [r.mapName, r.renderIssues]),
    ).toEqual([]);
    expect(
      results.filter((r) => r.missingScripts.length).map((r) => [r.mapName, r.missingScripts]),
    ).toEqual([]);
  }, 1_800_000);
});
