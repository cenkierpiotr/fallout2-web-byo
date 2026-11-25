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
  PartyState,
  ProtoCache,
  ScriptRuntime,
  createGameView,
  createViewDialogHooks,
  hexNeighbors,
  indexObject,
  moveObject,
  type GameObject,
  type World,
} from '../index.js';
import { fake } from './helpers.js';

const dir = process.env.F2_GAME_DIR;
const patchDir = process.env.F2_PATCH_DIR;

/** Golden R17-U2: wezly rekrutacji skryptow F2 (Vic, Sulik, Cassidy) wolaja party_add przez VM -> PartyState. */
const CASES = [
  { map: 'DENBUS2', script: 'dcvic', join: 'Node1100', pid: 'vic' },
  { map: 'KLADWTWN', script: 'kcsulik', join: 'Node800', pid: 'sulik' },
  { map: 'VCTYCTYD', script: 'vccasidy', join: 'Node017a', pid: 'cassidy' },
] as const;

describe.skipIf(!dir || !patchDir)(
  'R17-U2: rekrutacja Vic/Sulik/Cassidy (party_add/party_remove w VM)',
  () => {
    let vfs: NodeVfs;
    let loader: MapLoader;
    let msgs: MessageSource;
    beforeAll(async () => {
      vfs = await openGameFolderNode(dir!, patchDir);
      loader = new MapLoader(vfs, new ProtoCache(vfs));
      msgs = new MessageSource(vfs, { language: 'english' });
    });
    afterAll(async () => {
      await vfs.close();
    });

    async function setup(
      mapName: string,
      script: string,
      opts: { enforce?: boolean; vars?: GameVars } = {},
    ) {
      const map = await loader.load(mapName);
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
      const party = new PartyState([], { objId: player.id, pid: player.pid });
      const rt = new ScriptRuntime(
        world,
        msgs,
        opts.vars ?? new GameVars(Int32Array.from({ length: 700 }, () => 0)),
        createViewDialogHooks(view),
        {
          vfs,
          rng: () => 0.5,
          party,
          enforcePartyLimit: opts.enforce ?? false,
        },
      );
      world.scripts = rt;
      await rt.loadScriptsForMap(map);
      const npc = map.objects.find(
        (o) =>
          o.type === 1 && rt.scheduler.get(o.scriptId)?.script.name?.toLowerCase().includes(script),
      )!;
      const cmd = new GameCommands(world);
      const run = (proc: string): void => {
        rt.scheduler.runProc(npc.scriptId, proc);
        if (view.dialog.value) cmd.dialog.close();
      };
      return { map, player, npc, party, rt, run, cmd, view };
    }

    for (const c of CASES) {
      describe(c.pid, () => {
        it(`${c.join}: party_add dodaje do PartyState, flagi 0x404, obiekt w druzynie`, async () => {
          const { npc, party, rt, run } = await setup(c.map, c.script);
          expect(npc).toBeDefined();
          expect(party.memberCount).toBe(0);
          run(c.join);
          expect(party.memberCount).toBe(1);
          expect(party.entries[1]?.pid).toBe(npc.pid);
          expect(npc.flags & 0x404).toBe(0x404);
          expect(rt.inventory.partyMemberObj(npc.pid)).toBe(npc.id);
        }, 120_000);

        it('powtorne party_add nie dubluje', async () => {
          const { party, run } = await setup(c.map, c.script);
          run(c.join);
          run(c.join);
          expect(party.memberCount).toBe(1);
        }, 120_000);

        it('partyRemove zdejmuje flagi i zwalnia slot', async () => {
          const { npc, party, rt, run } = await setup(c.map, c.script);
          run(c.join);
          rt.inventory.partyRemove(npc.id);
          expect(party.memberCount).toBe(0);
          expect(npc.flags & 0x404).toBe(0);
          run(c.join);
          expect(party.memberCount).toBe(1);
        }, 120_000);

        it('limit Charyzmy (CH 5 -> 2): trzeci czlonek odrzucony', async () => {
          const { npc, party, rt, run } = await setup(c.map, c.script, { enforce: true });
          party.add({ objId: 9001, pid: 0x1000001, flags: 0 });
          party.add({ objId: 9002, pid: 0x1000002, flags: 0 });
          expect(party.memberCount).toBe(2);
          run(c.join);
          expect(party.memberCount).toBe(2);
          expect(npc.flags & 0x404).toBe(0);
          expect(rt.inventory.party.has(npc.id)).toBe(false);
        }, 120_000);
      });
    }

    it('talk_p_proc dialogu rekrutacyjnego dziala z party w runtime (bez VmError)', async () => {
      const { map, player, npc, rt, cmd, view } = await setup('KLADWTWN', 'kcsulik');
      const free = hexNeighbors(npc.hex).find((h) => h >= 0 && h < 40000)!;
      moveObject(map, player, free);
      expect(cmd.talkTo(npc.id).ok).toBe(true);
      expect(view.dialog.value?.options.length).toBeGreaterThan(0);
      cmd.dialog.close();
      expect(rt.log.filter((l) => l.kind === 'vmError')).toEqual([]);
    }, 120_000);

    // Zadanie 40: dialog.choose na PRAWDZIWYCH skryptach Vic/Sulik. Na zerowych gvarach (swiat bez postepu fabuly)
    // wezel rekrutacji jest zamkniety warunkami stanu gry (Vic: gvar 119/445.., Sulik: 179/184..), wiec test
    // sprawdza: dialog sie otwiera, wybory dzialaja, VM bez bledow, a jesli sciezka do rekrutacji istnieje, daje
    // poprawny wpis w party. Samo party_add jest pokryte goldenami powyzej.
    for (const c of [CASES[0]!, CASES[1]!]) {
      it(`${c.pid}: dialog.choose na prawdziwych danych (DFS po opcjach, glebokosc <= 6)`, async () => {
        const { map, player, npc, party, rt, cmd, view } = await setup(c.map, c.script);
        const free = hexNeighbors(npc.hex).find((h) => h >= 0 && h < 40000)!;
        const talk = (): boolean => {
          if (view.dialog.value) cmd.dialog.close();
          moveObject(map, player, free);
          return cmd.talkTo(npc.id).ok && !!view.dialog.value;
        };
        let visited = 0;
        let winning: number[] | null = null;
        const replay = (path: readonly number[]): boolean => {
          if (!talk()) return false;
          for (const i of path) {
            if (!view.dialog.value?.options[i]?.visible) return false;
            cmd.dialog.choose(i);
            if (party.memberCount > 0) return true;
          }
          return true;
        };
        const dfs = (path: number[]): void => {
          if (winning || visited++ > 80 || path.length > 6) return;
          if (!replay(path)) return;
          if (party.memberCount > 0) {
            winning = path;
            return;
          }
          const vis = (view.dialog.value?.options ?? []).map((o, i) => (o.visible ? i : -1));
          for (const i of vis) if (i >= 0) dfs([...path, i]);
        };
        dfs([]);
        if (view.dialog.value) cmd.dialog.close();
        expect(rt.log.filter((l) => l.kind === 'vmError')).toEqual([]);
        expect(visited).toBeGreaterThan(1);
        if (winning) {
          expect(party.memberCount).toBe(1);
          expect(party.entries[1]?.pid).toBe(npc.pid);
          expect(npc.flags & 0x404).toBe(0x404);
        }
      }, 600_000);
    }
  },
);
