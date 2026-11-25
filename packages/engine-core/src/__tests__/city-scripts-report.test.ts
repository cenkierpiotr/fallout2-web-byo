/**
 * Raport skryptow miast: uruchamia skrypty .int map miast w ScriptRuntime (start, map_enter,
 * rozmowy 1. poziomu) i zbiera brakujace opkody/metarule/bledy VM per miasto.
 * Wymaga F2_GAME_DIR (+ F2_PATCH_DIR). Zapis raportu: F2_CITY_REPORT=<sciezka .md>.
 */
import { writeFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openGameFolderNode } from '@f2/vfs/node';
import type { NodeVfs } from '@f2/vfs/node';
import {
  GameClock,
  GameCommands,
  GameVars,
  MapLoader,
  MessageSource,
  MovementSystem,
  ProtoCache,
  ScriptRuntime,
  createGameView,
  createViewDialogHooks,
  hexNeighbors,
  indexObject,
  moveObject,
  type GameMap,
  type GameObject,
  type World,
} from '../index.js';
import { fake } from './helpers.js';

const dir = process.env.F2_GAME_DIR;
const patchDir = process.env.F2_PATCH_DIR;
const reportPath = process.env.F2_CITY_REPORT;

export const CITIES: Record<string, string[]> = {
  Arroyo: ['arvillag', 'artemple', 'arcaves', 'argarden', 'arbridge', 'ardead'],
  Klamath: ['klamall', 'kladwtwn', 'klatrap', 'klacanyn', 'klatoxcv', 'klaratcv', 'klagraz'],
  Den: ['denbus1', 'denbus2', 'denres1'],
  Modoc: ['modmain', 'modbrah', 'modgard', 'modinn', 'modshit', 'modwell'],
  'Vault City': ['vctydwtn', 'vctycocl', 'vctyctyd', 'vctyvlt'],
  Gecko: ['gecksetl', 'geckpwpl', 'geckjunk', 'gecktunl'],
  'Broken Hills': ['broken1', 'broken2'],
  NCR: ['ncr1', 'ncr2', 'ncr3', 'ncr4', 'ncrent', 'ncrex'],
  Redding: ['reddown', 'redment', 'reddtun', 'redmtun', 'redwame', 'redwan1'],
  'New Reno': [
    'newr1',
    'newr2',
    'newr3',
    'newr4',
    'newrcs',
    'newrgo',
    'newrst',
    'newrba',
    'newrvb',
  ],
  Sierra: ['depolv1', 'depolva', 'depolvb'],
  'Vault 13': ['vault13', 'v13ent'],
  'San Francisco': [
    'sftanker',
    'sfdock',
    'sfchina',
    'sfchina2',
    'sfshutl1',
    'sfshutl2',
    'sfelronb',
  ],
};

const NOTES = `## Wymaga uwagi

- Brak niewyjasnionych bledow VM. Wszystkie vmError to znane defekty oryginalnych danych (eksport zmiennych zewnetrznych robi skrypt innej mapy: smitty_obj/gang_2_member_* w denres1, numDeathclaws w ncr4, "Fighter " w redment); testy per miasto je akceptuja.
- ncrex: brak pliku maps/ncrex.map w danych gry (nieladowalna tez w oryginale).
- Nieobslugowane opkody (stuby kosmetyczne/stat, poza ScriptRuntime): reg_anim_animate_forever i play_gmovie (arvillag); critter_add_trait/critter_rm_trait/critter_mod_skill/get_critter_stat/has_trait obsluguje CritterStatsModel (critter-stats.ts).
- Zakres: start, map_enter, rozmowy 1. poziomu. Sciezki walki, handlery zdarzen czasowych i pelne drzewa dialogow nie sa pokryte.
`;

interface Entry {
  kind: string;
  message: string;
  maps: Set<string>;
}

describe.skipIf(!dir)('Raport skryptow miast', () => {
  let vfs: NodeVfs;
  let loader: MapLoader;
  let msgs: MessageSource;
  const report = new Map<string, Map<string, Entry>>();

  beforeAll(async () => {
    vfs = await openGameFolderNode(dir!, patchDir);
    loader = new MapLoader(vfs, new ProtoCache(vfs));
    msgs = new MessageSource(vfs, { language: 'english' });
  });
  afterAll(async () => {
    await vfs.close();
    if (!reportPath) return;
    const L = [
      '# Skrypty miast w ScriptRuntime',
      '',
      'Generator: `packages/engine-core/src/__tests__/city-scripts-report.test.ts` (F2_CITY_REPORT=<plik>, wymaga F2_GAME_DIR). Zamrozone mapy: start + 3 ticki + rozmowa z kazdym NPC (opcje 1. poziomu). Wpisy: opkody/metarule `unsupported`, `vmError`, `badScript`, `missingScript`.',
      '',
    ];
    for (const city of Object.keys(CITIES)) {
      const m = report.get(city) ?? new Map<string, Entry>();
      L.push(`## ${city}`, '');
      L.push(`Mapy: ${CITIES[city]!.join(', ')}`, '');
      if (m.size === 0) L.push('Brak problemow.', '');
      else {
        L.push('| Rodzaj | Opis | Mapy |', '|---|---|---|');
        for (const e of [...m.values()].sort((a, b) => a.message.localeCompare(b.message)))
          L.push(
            `| ${e.kind} | \`${e.message.replace(/\|/g, '/')}\` | ${[...e.maps].join(', ')} |`,
          );
        L.push('');
      }
    }
    L.push(NOTES);
    writeFileSync(reportPath, L.join('\n'));
  });

  async function runMap(city: string, name: string) {
    let map: GameMap;
    try {
      map = await loader.load(name);
    } catch (e) {
      add(city, name, 'loadError', String((e as Error).message));
      return;
    }
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
      rng: () => 0.5,
    });
    world.scripts = rt;
    try {
      await rt.loadScriptsForMap(map);
      for (let i = 0; i < 3; i++) rt.tick(10);
      const cmd = new GameCommands(world);
      const npcs = map.objects.filter(
        (o) =>
          o.type === 1 &&
          o.id !== player.id &&
          o.scriptId !== -1 &&
          rt.scheduler.get(o.scriptId)?.script.procs.some((p) => p.name === 'talk_p_proc'),
      );
      for (const npc of npcs) {
        try {
          const free = hexNeighbors(npc.hex).find((h) => h >= 0 && h < 40000);
          if (free === undefined) continue;
          moveObject(map, player, free);
          if (view.dialog.value) cmd.dialog.close();
          if (!cmd.talkTo(npc.id).ok) continue;
          const n = view.dialog.value?.options.length ?? 0;
          for (let i = 0; i < n; i++) {
            if (!view.dialog.value) {
              moveObject(map, player, free);
              if (!cmd.talkTo(npc.id).ok) break;
            }
            if (view.dialog.value!.options[i]?.visible) cmd.dialog.choose(i);
            for (let d = 0; d < 6 && view.dialog.value; d++) {
              const next = view.dialog.value.options.findIndex((x) => x.visible);
              if (next < 0) break;
              cmd.dialog.choose(next);
            }
            if (view.dialog.value) cmd.dialog.close();
          }
          if (view.dialog.value) cmd.dialog.close();
        } catch (e) {
          add(city, name, 'harnessError', String((e as Error).message));
        }
      }
    } catch (e) {
      add(city, name, 'harnessError', String((e as Error).message));
    }
    for (const l of rt.log) if (l.kind !== 'info') add(city, name, l.kind, l.message);
  }

  function add(city: string, map: string, kind: string, message: string) {
    let m = report.get(city);
    if (!m) report.set(city, (m = new Map()));
    const key = kind + '|' + message;
    let e = m.get(key);
    if (!e) m.set(key, (e = { kind, message, maps: new Set() }));
    e.maps.add(map);
  }

  for (const [city, maps] of Object.entries(CITIES)) {
    it(`${city}`, async () => {
      for (const name of maps) await runMap(city, name);
      expect(true).toBe(true);
    }, 600_000);
  }
});
