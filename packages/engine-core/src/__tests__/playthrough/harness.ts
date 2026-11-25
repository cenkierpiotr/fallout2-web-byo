import { parseMapsTxt, type MapDef } from '@f2/formats';
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
  exitGridAt,
  hexDistance,
  indexObject,
  moveObject,
  openGameFile,
  type ExitGrid,
  type GameObject,
  type GameView,
  type World,
} from '../../index.js';
import { barterAccept, barterPrice, splitCaps } from '@f2/rules';
import { BarterSession, type BarterItem } from '../../index.js';
import { fake } from '../helpers.js';

const PLAYER_PID = 0x01000000;
/** Imie gracza w dialogach (host podaje je z postaci; tu stale). */
const PLAYER_NAME = 'Wybraniec';
export const GAME_DIR = process.env.F2_GAME_DIR;
export const PATCH_DIR = process.env.F2_PATCH_DIR;

/** Opkody kosmetyczne/walkowe jak w klamath-npcs.test.ts (nie blokuja fabuly). */
export const COSMETIC =
  /^(reg_anim|critter_add_trait|get_critter_stat|obj_can_see_obj|obj_lock|cur_map_index|critter_state|mouse_state_flag|play_gmovie)/;

/** Deterministyczny rng (stala 0.5 wpada w petle losowania). */
function lcg(seed = 4242): () => number {
  let x = seed;
  return () => {
    x = (Math.imul(x, 1103515245) + 12345) & 0x7fffffff;
    return x / 0x80000000;
  };
}

export interface TalkStep {
  /** Regex dopasowywany do tekstu opcji gracza; pierwsza widoczna pasujaca wygrywa. */
  pick?: RegExp;
  /** Albo indeks wprost. */
  index?: number;
}

export interface Playthrough {
  vfs: NodeVfs;
  world: World;
  rt: ScriptRuntime;
  cmd: GameCommands;
  view: GameView;
  vars: GameVars;
  maps: MapDef[];
  player: GameObject;
  /** Nazwa GVAR -> indeks (z vault13.gam). */
  gvarIndex: Map<string, number>;
  gvar(name: string): number;
  setGvar(name: string, v: number): void;
  mapName(): string;
  /** Wchodzi na mape (snapshot opuszczanej do rejestru), zwraca blad VM/ladowania jako wyjatek. */
  enter(name: string, hex?: number, elevation?: number): Promise<void>;
  /** Wchodzi do miasta z mapy swiata (data/city.txt, pierwsze wejscie On albo `entrance`). */
  enterArea(areaName: string, entrance?: number): Promise<string>;
  /** Konsumuje load_map zgloszone przez skrypt (jak petla mapy w apps/web); zwraca nazwe nowej mapy. */
  followLoadMap(): Promise<string | undefined>;
  /** Ustawia stat gracza (set_critter_stat); INT (4) wplywa tez na opcje dialogowe giq_option. */
  setStat(stat: number, value: number): void;
  /** Dodaje graczowi przedmiot o pid (prawdziwy proto, stos `qty`); zwraca id obiektu. */
  give(pid: number, qty?: number): Promise<number>;
  /** Liczba sztuk przedmiotu o pid w ekwipunku gracza (ze stosami). */
  count(pid: number): number;
  /** Punkty doswiadczenia gracza (give_exp_points). */
  xp(): number;
  /**
   * Zabija kryter jak walka w grze: `applyCombatDamage` (damage/destroy_p_proc, scr_remove), potem XP z
   * `expForKill` protoka (w grze robi to host, apps/web combat-controller). Zwraca przyznane XP.
   */
  kill(target: GameObject): { died: boolean; xp: number };
  /** Obiekty-krytery po nazwie (objName). */
  npcsByName(name: RegExp): GameObject[];
  /** Przechodzi przez exit grid; zwraca nazwe nowej mapy (lub 'WORLDMAP' gdy destMap<0). */
  takeExit(eg: ExitGrid): Promise<string>;
  /** Idzie do heksa (symulacja krokow); zwraca trafiony exit grid. */
  walk(hex: number, run?: boolean): Promise<{ arrived: boolean; exit?: ExitGrid; reason?: string }>;
  /** Idzie do heksa i, gdy to exit grid, przechodzi na nowa mape. */
  walkAndExit(hex: number): Promise<string | undefined>;
  /** Teleport gracza obok obiektu (jak placePlayerNear w e2e). */
  placeNear(o: GameObject): boolean;
  /** Obiekty po sid skryptu / pid. */
  byScript(sid: number): GameObject | undefined;
  byPid(pid: number): GameObject[];
  /** Uzycie obiektu (use_p_proc), potem opcjonalnie sekwencja wyborow w dialogu, jesli skrypt go otworzyl. */
  use(
    obj: GameObject,
    steps?: (TalkStep | RegExp | number)[],
  ): { ran: boolean; overridden: boolean; floats: string[]; history: string[]; left: boolean };
  /** Uzycie przedmiotu o `pid` z ekwipunku gracza na obiekcie (use_obj_on_p_proc celu), potem opcjonalnie dialog. */
  useOn(
    pid: number,
    target: GameObject,
    steps?: (TalkStep | RegExp | number)[],
  ): {
    ran: boolean;
    overridden: boolean;
    error: boolean;
    floats: string[];
    history: string[];
    left: boolean;
  };
  /** Rozmowa: start + sekwencja wyborow. Zwraca historie. */
  talk(
    npc: GameObject,
    steps: (TalkStep | RegExp | number)[],
  ): { started: boolean; history: string[]; left: boolean; reason?: string };
  /** Wywolania `gdialog_barter` (hook handlu): NPC (id obiektu) i barter_mod w %. */
  barterCalls: { npc: number; mod: number }[];
  /**
   * Sesja handlu zlozona z prawdziwych ekwipunkow gracza i `npc` (wartosc = `proto.cost`, kapsle po 1) z
   * regulami z @f2/rules, jak `createBarter` w apps/web. `commit` przenosi towar po udanym `accept`.
   */
  barter(
    npc: GameObject,
    opts?: { mod?: number; merchantBarter?: number; partyBestBarter?: number },
  ): BarterHarness;
  /** Odczytuje ostatnie bledy VM / nieobslugiwane opkody (poza kosmetycznymi). */
  problems(since?: number): string[];
  logMark(): number;
  tick(n?: number): void;
  close(): Promise<void>;
}

export interface BarterHarness {
  session: BarterSession;
  /** Przedmiot z ekwipunku wg id tekstowego sesji (p<i> / m<i>). */
  source(id: string): GameObject;
  /** Id sesji pierwszego przedmiotu o pid u gracza (`p`) lub kupca (`m`). */
  idOf(side: 'p' | 'm', pid: number): string;
  /** `accept()`, a po 'ok' przenosi towar i kapsle w prawdziwych ekwipunkach. */
  accept(): ReturnType<BarterSession['accept']>;
}

export async function parseGamNames(vfs: NodeVfs): Promise<Map<string, number>> {
  const buf = await openGameFile(vfs, 'data/vault13.gam');
  const text = new TextDecoder('latin1').decode(buf);
  const out = new Map<string, number>();
  let inGame = false;
  let i = 0;
  for (const raw of text.split(/\r\n|\r|\n/)) {
    const slash = raw.indexOf('//');
    const line = (slash === -1 ? raw : raw.slice(0, slash)).trim();
    if (line === '') continue;
    if (/^GAME_GLOBAL_VARS\s*:/i.test(line)) {
      inGame = true;
      continue;
    }
    if (/^[A-Za-z_]+_GLOBAL_VARS\s*:/i.test(line)) {
      inGame = false;
      continue;
    }
    if (!inGame) continue;
    const m = /^([A-Za-z_]\w*)\s*:=\s*(-?\d+)\s*;/.exec(line);
    if (m) out.set(m[1]!, i++);
  }
  return out;
}

export async function boot(): Promise<Playthrough> {
  const vfs = await openGameFolderNode(GAME_DIR!, PATCH_DIR);
  const protos = new ProtoCache(vfs);
  const loader = new MapLoader(vfs, protos);
  const msgs = new MessageSource(vfs, { language: 'english' });
  const maps = parseMapsTxt(
    new TextDecoder('latin1').decode(await openGameFile(vfs, 'data/maps.txt')),
  );
  const vars = await GameVars.load(vfs);
  const gvarIndex = await parseGamNames(vfs);
  const first = await loader.load('ARTEMPLE');
  // gracz jak w map-screen.ts: proto 0x01000000 (w grze zastepcze), kryter z rekordem statow i ekwipunkiem
  const playerProto = await protos.get(PLAYER_PID).catch(() => protos.placeholderFor(PLAYER_PID));
  const player: GameObject = fake(1, first.header.playerHex, 0, {
    kind: 'critter',
    flags: 0,
    raw: new Int32Array(10),
  });
  player.id = 0x10000;
  player.pid = PLAYER_PID;
  player.proto = playerProto;
  player.protoFlags = playerProto.flags;
  first.objects.push(player);
  indexObject(first, player);
  const view = createGameView();
  const world: World = {
    map: first,
    player,
    clock: new GameClock(),
    movement: new MovementSystem(first),
    loader,
    view,
  };
  const barterCalls: { npc: number; mod: number }[] = [];
  const rt = new ScriptRuntime(
    world,
    msgs,
    vars,
    createViewDialogHooks(view, {
      barter: (npc, mod) => barterCalls.push({ npc, mod }),
      // jak host (sheetDialogIq): prog opcji giq_option wg INT gracza ze statow
      playerIq: () => rt.getCritterStat(player.id, 4),
    }),
    {
      vfs,
      rng: lcg(),
      playerName: () => PLAYER_NAME,
    },
  );
  world.scripts = rt;
  const cmd = new GameCommands(world);
  view.currentMap.value = { name: first.name, elevation: player.elevation };
  await rt.loadScriptsForMap(first);

  const nameOfIndex = (i: number): string | undefined =>
    maps.find((m) => m.index === i)?.mapName.toUpperCase();

  const drive = (
    history: string[],
    steps: (TalkStep | RegExp | number)[],
  ): { history: string[]; left: boolean } => {
    let n = 0;
    for (const raw of steps) {
      const d = view.dialog.value;
      if (!d) break;
      history.push(`NPC: ${d.npcText}`);
      const step: TalkStep =
        typeof raw === 'number' ? { index: raw } : raw instanceof RegExp ? { pick: raw } : raw;
      let idx = -1;
      if (step.index !== undefined) idx = step.index;
      else if (step.pick) idx = d.options.findIndex((o) => o.visible && step.pick!.test(o.text));
      if (idx < 0) {
        history.push(
          `!! brak opcji ${String(step.pick)}; dostepne: ${d.options.map((o) => `[${o.index}${o.visible ? '' : 'x'}]${o.text}`).join(' | ')}`,
        );
        break;
      }
      history.push(`PC: ${d.options[idx]?.text}`);
      cmd.dialog.choose(idx);
      n++;
    }
    void n;
    const left = view.dialog.value === null;
    if (!left) {
      const d = view.dialog.value!;
      history.push(`NPC: ${d.npcText}`);
      history.push(
        `(opcje: ${d.options.map((o) => `[${o.index}${o.visible ? '' : 'x'}]${o.text}`).join(' | ')})`,
      );
      cmd.dialog.close();
    }
    return { history, left };
  };
  const p: Playthrough = {
    vfs,
    world,
    rt,
    cmd,
    view,
    vars,
    maps,
    player,
    gvarIndex,
    gvar(name) {
      const i = gvarIndex.get(name);
      if (i === undefined) throw new Error(`brak GVAR ${name}`);
      return vars.get(i);
    },
    setGvar(name, v) {
      const i = gvarIndex.get(name);
      if (i === undefined) throw new Error(`brak GVAR ${name}`);
      vars.set(i, v);
    },
    mapName: () => world.map.name.toUpperCase(),
    async enter(name, hex, elevation) {
      const st = rt.captureCurrentMapState();
      if (st) rt.registry.snapshot(st);
      const r = await cmd.travelTo(name, hex, elevation);
      if (!r.ok) throw new Error(`travelTo ${name}: ${JSON.stringify(r)}`);
      rt.tick(5);
    },
    async enterArea(areaName, entrance) {
      const text = new TextDecoder('latin1').decode(await openGameFile(vfs, 'data/city.txt'));
      let cur = '';
      const ents: { name: string; map: string; on: boolean }[] = [];
      for (const raw of text.split(/\r?\n/)) {
        const line = raw.replace(/;.*/, '').trim();
        const an = /^area_name=(.+)$/.exec(line);
        if (an) cur = an[1]!.trim();
        const e = /^entrance_(\d+)=(On|Off),(-?\d+),(-?\d+),([^,]+),(-?\d+),(-?\d+),(-?\d+)/i.exec(
          line,
        );
        if (e && cur.toLowerCase() === areaName.toLowerCase()) {
          const idx = Number(e[1]);
          ents[idx] = { name: e[5]!.trim(), map: e[5]!.trim(), on: /on/i.test(e[2]!) };
        }
      }
      const pick = entrance !== undefined ? ents[entrance] : (ents.find((x) => x?.on) ?? ents[0]);
      if (!pick) throw new Error(`brak wejscia do ${areaName}`);
      const def = maps.find((m) => m.lookupName.toLowerCase() === pick.name.toLowerCase());
      if (!def) throw new Error(`brak mapy ${pick.name}`);
      await p.enter(def.mapName.toUpperCase());
      return def.mapName.toUpperCase();
    },
    setStat(stat, value) {
      if (rt.setCritterStat(player.id, stat, value) !== 0)
        throw new Error(`setStat ${stat}=${value}`);
    },
    async give(pid, qty = 1) {
      await protos.get(pid).catch(() => undefined);
      const id = rt.createObject(pid, player.hex, player.elevation, 0);
      if (id < 0) throw new Error(`give ${pid}: createObject`);
      rt.inventory.addMultObjsToInven(player.id, id, qty);
      return id;
    },
    count: (pid) => rt.inventory.invenCountPid(player.id, pid),
    xp: () => rt.pcExperience,
    kill(target) {
      const { died } = rt.applyCombatDamage(target.id, player.id, 100000);
      const exp = (target.proto as { expForKill?: number } | undefined)?.expForKill ?? 0;
      if (died && exp > 0) rt.giveExpPoints(exp);
      return { died, xp: died ? exp : 0 };
    },
    async followLoadMap() {
      const ml = rt.takeMapLoad((i) => nameOfIndex(i));
      if (!ml) return undefined;
      await p.enter(ml.name, ml.hex, ml.elevation);
      return ml.name;
    },
    npcsByName(re) {
      return world.map.objects.filter(
        (o) => o.type === 1 && o !== player && re.test(rt.objName(o.id)),
      );
    },
    async takeExit(eg) {
      if (eg.destMap < 0) return 'WORLDMAP';
      const name = nameOfIndex(eg.destMap);
      if (!name) throw new Error(`exit grid: nieznana mapa ${eg.destMap}`);
      await p.enter(name, eg.destHex, eg.destElevation);
      return name;
    },
    async walk(hex, run = true) {
      const r = cmd.moveTo(hex, run);
      if (!r.ok) {
        return { arrived: player.hex === hex, reason: (r as { reason?: string }).reason ?? 'fail' };
      }
      for (let i = 0; i < 4000; i++) {
        const u = cmd.update(10);
        if (u.exit) return { arrived: true, exit: u.exit };
        if (world.movement.stateOf(player) === undefined) break;
      }
      return { arrived: player.hex === hex };
    },
    async walkAndExit(hex) {
      const r = await p.walk(hex);
      if (r.exit) return p.takeExit(r.exit);
      const eg = exitGridAt(world.map, player.elevation, player.hex);
      return eg ? p.takeExit(eg) : undefined;
    },
    placeNear(o) {
      for (const n of hexNeighborsOf(o.hex)) {
        if (n < 0 || n >= 40000) continue;
        if (world.map.byHex.get(n)?.some((x) => x.type === 1 && x !== player)) continue;
        moveObject(world.map, player, n, o.elevation as 0 | 1 | 2);
        view.player.value = { hex: n, elevation: player.elevation, moving: false };
        return true;
      }
      return false;
    },
    byScript(sid) {
      return world.map.objects.find((o) => o.scriptId === sid);
    },
    byPid(pid) {
      return world.map.objects.filter((o) => o.pid === pid);
    },
    talk(npc, steps) {
      const history: string[] = [];
      if (view.dialog.value) cmd.dialog.close();
      p.placeNear(npc);
      const t = cmd.talkTo(npc.id);
      if (!t.ok) {
        return { started: false, history, left: true, reason: (t as { reason?: string }).reason };
      }
      return { started: true, ...drive(history, steps) };
    },
    use(obj, steps = []) {
      const history: string[] = [];
      if (view.dialog.value) cmd.dialog.close();
      p.placeNear(obj);
      view.floatingTexts.value = [];
      const r = rt.runObjectProc('use_p_proc', obj.id, player.id);
      const floats = view.floatingTexts.value.map((f) => f.text);
      if (!view.dialog.value)
        return { ran: r.ran, overridden: r.overridden, history, floats, left: true };
      return { ran: r.ran, overridden: r.overridden, floats, ...drive(history, steps) };
    },
    useOn(pid, target, steps = []) {
      const history: string[] = [];
      if (view.dialog.value) cmd.dialog.close();
      const item = player.inventory.find((o) => o.pid === pid);
      if (!item) throw new Error(`gracz nie ma przedmiotu ${pid.toString(16)}`);
      p.placeNear(target);
      view.floatingTexts.value = [];
      const r = rt.useItemOn(player.id, item.id, target.id);
      const floats = view.floatingTexts.value.map((f) => f.text);
      const base = { ran: r.ran, overridden: r.overridden, error: r.error, floats, history };
      if (!view.dialog.value) return { ...base, left: true };
      return { ...base, ...drive(history, steps) };
    },
    logMark: () => rt.log.length,
    barterCalls,
    barter(npc, opts = {}) {
      const sources = new Map<string, GameObject>();
      const EQUIP = 0x07000000;
      const build = (owner: GameObject, prefix: 'p' | 'm'): BarterItem[] =>
        owner.inventory.map((o, i) => {
          const id = `${prefix}${i}`;
          sources.set(id, o);
          const cost = o.proto.kind === 'item' ? o.proto.cost : 0;
          const weight = o.proto.kind === 'item' ? o.proto.weight : 0;
          return {
            id,
            pid: o.pid,
            count: o.quantity ?? 1,
            value: o.pid === 0x29 ? 1 : cost,
            weight,
            ...((o.flags & EQUIP) !== 0 ? { blocked: true } : {}),
          };
        });
      const session = new BarterSession(
        build(player, 'p'),
        build(npc, 'm'),
        {
          merchantBarter: opts.merchantBarter ?? 0,
          partyBestBarter: opts.partyBestBarter ?? 0,
          barterMod: opts.mod ?? 0,
          masterTrader: false,
          playerFreeCarry: 10_000,
        },
        { barterPrice, splitCaps, barterAccept },
      );
      const move = (it: BarterItem, from: GameObject, to: GameObject): void => {
        const src = sources.get(it.id)!;
        if (it.pid === 0x29) {
          rt.inventory.itemCapsAdjust(from.id, -it.count);
          rt.inventory.itemCapsAdjust(to.id, it.count);
          return;
        }
        const taken = rt.inventory.rmMultObjsFromInven(from.id, src.id, it.count);
        const id = rt.createObject(src.pid, to.hex, to.elevation, 0);
        rt.inventory.addMultObjsToInven(to.id, id, taken);
      };
      return {
        session,
        source: (id) => sources.get(id)!,
        idOf(side, pid) {
          const hit = [...sources].find(([k, o]) => k.startsWith(side) && o.pid === pid);
          if (!hit) throw new Error(`brak pid ${pid} u ${side}`);
          return hit[0];
        },
        accept() {
          const pt = session.playerTable.map((x) => ({ ...x }));
          const mt = session.merchantTable.map((x) => ({ ...x }));
          const r = session.accept();
          if (r === 'ok') {
            for (const it of pt) move(it, player, npc);
            for (const it of mt) move(it, npc, player);
          }
          return r;
        },
      };
    },
    problems(since = 0) {
      return [
        ...new Set(
          rt.log
            .slice(since)
            .filter(
              (l) =>
                l.kind === 'vmError' ||
                l.kind === 'badScript' ||
                (l.kind === 'unsupported' && !COSMETIC.test(l.message)),
            )
            .map((l) => `${l.kind}: ${l.message}`),
        ),
      ];
    },
    tick(n = 10) {
      cmd.update(n);
      rt.tick(n);
    },
    close: () => vfs.close(),
  };
  return p;
}

import { hexNeighbors } from '../../index.js';
function hexNeighborsOf(h: number): number[] {
  return hexNeighbors(h);
}
void hexDistance;

/** Diff GVAR-ow: zwraca zmiany od `before` jako "NAZWA a->b". */
export function gvarDiff(p: Playthrough, before: Int32Array): string[] {
  const out: string[] = [];
  const names = new Map([...p.gvarIndex].map(([n, i]) => [i, n] as const));
  for (let i = 0; i < Math.max(before.length, p.vars.size); i++) {
    const a = before[i] ?? 0;
    const b = p.vars.get(i);
    if (a !== b) out.push(`${names.get(i) ?? 'gvar' + i}(${i}) ${a}->${b}`);
  }
  return out;
}

/** Rozmowa "eksploracyjna": priorytety regexow, inaczej pierwsza widoczna opcja; do `maxSteps`. */
export function converse(
  p: Playthrough,
  npc: GameObject,
  prefer: RegExp[] = [],
  maxSteps = 25,
): { started: boolean; history: string[]; reason?: string } {
  const history: string[] = [];
  if (p.view.dialog.value) p.cmd.dialog.close();
  p.placeNear(npc);
  const t = p.cmd.talkTo(npc.id);
  if (!t.ok) return { started: false, history, reason: (t as { reason?: string }).reason };
  for (let i = 0; i < maxSteps; i++) {
    const d = p.view.dialog.value;
    if (!d) break;
    history.push(`NPC: ${d.npcText}`);
    const vis = d.options.filter((o) => o.visible);
    if (vis.length === 0) {
      p.cmd.dialog.close();
      break;
    }
    let pick = vis[0]!;
    for (const re of prefer) {
      const m = vis.find((o) => re.test(o.text));
      if (m) {
        pick = m;
        break;
      }
    }
    history.push(`PC[${pick.index}]: ${pick.text}  (z ${vis.length})`);
    p.cmd.dialog.choose(pick.index);
  }
  if (p.view.dialog.value) p.cmd.dialog.close();
  return { started: true, history };
}
