import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
  TICKS_PER_DAY,
  createGameView,
  createViewDialogHooks,
  hexInDirection,
  indexObject,
  type GameMap,
  type GameObject,
  type World,
} from '../index.js';
import { fake } from './helpers.js';

const dir = process.env.F2_GAME_DIR;
const patchDir = process.env.F2_PATCH_DIR;

describe.skipIf(!dir)('ScriptRuntime: CombatHooks (ARTEMPLE)', () => {
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

  async function setup(rng: () => number = () => 0.5) {
    const map: GameMap = await loader.load('ARTEMPLE');
    const critter = { kind: 'critter' as const, flags: 0, raw: new Int32Array(0) };
    const player: GameObject = fake(1, map.header.playerHex, 0, critter);
    player.id = 0x10000;
    map.objects.push(player);
    indexObject(map, player);
    const npc: GameObject = fake(1, hexInDirection(player.hex, 0, 8), 0, critter);
    map.objects.push(npc);
    indexObject(map, npc);
    const view = createGameView();
    const clock = new GameClock();
    const world: World = { map, player, clock, movement: new MovementSystem(map), loader, view };
    const rt = new ScriptRuntime(
      world,
      msgs,
      new GameVars(new Int32Array(700)),
      createViewDialogHooks(view),
      { vfs, rng },
    );
    world.scripts = rt;
    await rt.loadScriptsForMap(map);
    return { rt, player, npc, clock };
  }

  it('give_exp_points zwieksza XP gracza', async () => {
    const { rt } = await setup();
    rt.giveExpPoints(100);
    rt.giveExpPoints(50);
    expect(rt.pcExperience).toBe(150);
  });

  it('has_skill: small guns przy AG=5 (stub statystyk) = 5 + 4*5', async () => {
    const { rt, player } = await setup();
    expect(rt.skillValue(player.id, 0)).toBe(25);
    expect(rt.skillValue(player.id, 99)).toBe(-5);
  });

  it('isCritter rozpoznaje krytera', async () => {
    const { rt, player } = await setup();
    expect(rt.isCritter(player.id)).toBe(true);
    expect(rt.isCritter(-1)).toBe(false);
  });

  it('rollVsSkill: rng 0.5 daje d100=51, szansa 25+mod', async () => {
    const { rt, player } = await setup();
    expect(rt.rollVsSkill(player.id, 0, 40)).toEqual({ degree: 2, delta: 14 });
    expect(rt.rollVsSkill(player.id, 0, 0)).toEqual({ degree: 1, delta: -26 });
  });

  it('rollVsSkill: skill poza zakresem to stopien 1 bez rzutu', async () => {
    const { rt, player } = await setup();
    expect(rt.rollVsSkill(player.id, 18, 0)).toEqual({ degree: 1, delta: 0 });
  });

  it('rollVsSkill po dobie gry dopuszcza krytyki', async () => {
    const { rt, player, clock } = await setup(() => 0);
    clock.advance(TICKS_PER_DAY);
    // d100 = 1: delta = 25 - 1 = 24, krytyk gdy 1 <= 2 + luck(5)
    expect(rt.rollVsSkill(player.id, 0, 0)).toEqual({ degree: 3, delta: 24 });
  });

  it('canSee: w stozku przodu w zasiegu percepcji*5, poza zasiegiem nie', async () => {
    const { rt, player, npc } = await setup();
    player.rotation = 0;
    expect(rt.canSee(player.id, npc.id)).toBe(true);
    player.rotation = 3; // plecami: zasieg tylko percepcja (5) < 8 heksow
    expect(rt.canSee(player.id, npc.id)).toBe(false);
    expect(rt.canSee(player.id, -5)).toBe(false);
  });

  it('canSee: w walce (inCombat) zasieg galezi bez stozka x2', async () => {
    const { rt, player, npc } = await setup();
    player.rotation = 3;
    expect(rt.canSee(player.id, npc.id)).toBe(false);
    rt.inCombat = () => true;
    expect(rt.canSee(player.id, npc.id)).toBe(true);
  });

  it('animBusy: false w spoczynku', async () => {
    const { rt, npc } = await setup();
    expect(rt.animBusy(npc.id)).toBe(false);
    expect(rt.animBusy(-1)).toBe(false);
  });
});
