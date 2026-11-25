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
  type GameObject,
  type World,
} from '../index.js';
import { fake } from './helpers.js';

const dir = process.env.F2_GAME_DIR;
const patchDir = process.env.F2_PATCH_DIR;

/** Opkody kosmetyczne akceptowane w logu (jak ACCEPTED w ncr-npcs.test.ts). */
const ACCEPTED =
  /^(reg_anim|critter_add_trait|get_critter_stat|obj_can_see_obj|obj_lock|cur_map_index|critter_state|mouse_state_flag)/;

/**
 * Golden: dialogi skryptowe 5 NPC z 5 miast na prawdziwych danych (start, opcje, wybor, efekty).
 * Regresje: obj_name (imie gracza i nazwy z pro_*.msg) oraz kwestie Generic.msg ("Goodbye.", "Ug.").
 */
describe.skipIf(!dir)('golden: dialogi NPC z 5 miast (ScriptRuntime + dialog)', () => {
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

  async function setup(mapName: string, script: string) {
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
    const vars = await GameVars.load(vfs);
    const rt = new ScriptRuntime(world, msgs, vars, createViewDialogHooks(view), {
      vfs,
      rng: () => 0.5,
      playerName: () => 'Chosen',
    });
    world.scripts = rt;
    await rt.loadScriptsForMap(map);
    const cmd = new GameCommands(world);
    const npc = map.objects.find(
      (o) => o.type === 1 && rt.scheduler.get(o.scriptId)?.script.name?.toLowerCase() === script,
    )!;
    expect(npc).toBeDefined();
    moveObject(
      map,
      player,
      hexNeighbors(npc.hex).find((h) => h >= 0 && h < 40000)!,
    );
    const talk = () => cmd.talkTo(npc.id);
    const texts = () =>
      view.dialog.value?.options.map((o) => (o.visible ? o.text : `(ukryta) ${o.text}`)) ?? [];
    const choose = (i: number) => cmd.dialog.choose(i);
    const bad = () =>
      rt.log.filter(
        (l) => l.kind === 'vmError' || (l.kind === 'unsupported' && !ACCEPTED.test(l.message)),
      );
    return { map, player, npc, rt, vars, view, cmd, talk, texts, choose, bad };
  }

  it('Klamath, Whiskey Bob: imie gracza z obj_name wchodzi w opcje, wybor ustawia gvar', async () => {
    const t = await setup('KLADWTWN', 'kcbob');
    const before = t.vars.get(41);
    expect(t.talk().ok).toBe(true);
    expect(t.view.dialog.value?.npcText).toBe(
      'Howdy stranger, my name’s Whiskey Bob. What’s yours?',
    );
    expect(t.texts()).toEqual([
      'My name’s Chosen. Nice to meet you Whiskey Bob.',
      'I’m Chosen. What’s happening here in town?',
      'I don’t think you need to know my name.',
    ]);
    expect(t.choose(0).ok).toBe(true);
    expect(t.view.dialog.value?.npcText).toContain('Always nice to find another drinking buddy');
    expect(t.texts()[3]).toMatch(/^\(ukryta\) With a nickname like yours/);
    expect(t.choose(1).ok).toBe(true);
    // odmowa: NPC zegna sie wiadomoscia (tryb message, jedna opcja "Done"), dopiero ona zamyka rozmowe
    expect(t.view.dialog.value?.mode).toBe('message');
    expect(t.view.dialog.value?.npcText).toBe(
      'Well, mister, maybe I’ll be seeing you around here later. Bye.',
    );
    expect(t.choose(0).ok).toBe(true);
    expect(t.view.dialog.value).toBeNull();
    expect(before).toBe(0);
    expect(t.vars.get(41)).toBe(1); // wejscie do miasta (map_enter), nie efekt rozmowy
    expect(t.bad()).toEqual([]);
  }, 120_000);

  it('Modoc, Jonny: opcje "Goodbye." i "Ug." z Generic.msg nie sa puste, imie w odpowiedzi', async () => {
    const t = await setup('MODMAIN', 'mcjonny');
    expect(t.talk().ok).toBe(true);
    expect(t.texts()).toEqual([
      'What’s your name, little boy?',
      'Tell me your name, you little monster.',
      'Would you like some candy, little kid?',
      'Goodbye.',
      '(ukryta) Ooga.',
    ]);
    expect(t.choose(0).ok).toBe(true);
    expect(t.view.dialog.value?.npcText).toBe('My name is Jonny. What’s yours?');
    expect(t.texts()).toEqual(['My name is Chosen.', 'My name’s not important.', 'Goodbye.']);
    expect(t.choose(0).ok).toBe(true);
    expect(t.view.dialog.value?.npcText).toBe('Very nice to meet you Chosen.');
    expect(t.choose(0).ok).toBe(true);
    expect(t.view.dialog.value).toBeNull();
    expect(t.vars.get(113)).toBe(2);
    expect(t.bad()).toEqual([]);
  }, 120_000);

  it('Vault City, Steve: lancuch odpowiedzi do zamkniecia, bez bledow VM', async () => {
    const t = await setup('VCTYCTYD', 'vcsteve');
    const flat = () => (t.view.dialog.value?.npcText ?? '').replaceAll('\r', '');
    expect(t.talk().ok).toBe(true);
    expect(t.texts()).toEqual([
      'Is this fenced-in area all there is to the city?',
      'What do you mean by "the best?"',
      "I'm looking for the Vault. Can you tell me where it is?",
      'Goodbye.',
    ]);
    expect(t.choose(0).ok).toBe(true);
    expect(flat()).toContain('you weren’t supposed to ask that');
    expect(t.choose(0).ok).toBe(true);
    expect(flat()).toContain('refer you to Melinda, the Chief Greeting Officer');
    expect(t.choose(0).ok).toBe(true);
    expect(t.view.dialog.value).toBeNull();
    expect(t.bad()).toEqual([]);
  }, 120_000);

  it('Arroyo, Jordan: trening konczy rozmowe, nagroda XP i wpis w notyfikacjach', async () => {
    const t = await setup('ARVILLAG', 'acjordan');
    expect(t.talk().ok).toBe(true);
    expect(t.texts()).toEqual(['Sure.', 'No, thanks.']);
    expect(t.choose(0).ok).toBe(true);
    expect(t.view.dialog.value?.npcText).toContain("You're a swift student");
    expect(t.choose(0).ok).toBe(true);
    expect(t.view.dialog.value).toBeNull();
    expect(t.view.notifications.value).toContain('You gain 600 experience points.');
    // critter_mod_skill (trening Jordana, 0x45b840) obsluzony przez CritterStatsModel: bez luk w logu VM
    expect(t.bad()).toEqual([]);
  }, 120_000);

  it('Den, Sheila: cena z formuly skryptu wchodzi w tekst NPC, wybor "OK!" ustawia gvary', async () => {
    const t = await setup('DENBUS2', 'dcsheila');
    expect(t.talk().ok).toBe(true);
    expect(t.view.dialog.value?.npcText).toMatch(
      /^It will cost \$\d+ for a session\. Pay first\.$/,
    );
    expect(t.texts()).toEqual(['OK!', 'No. Bye.']);
    expect(t.choose(0).ok).toBe(true);
    expect(t.vars.get(194)).toBe(5);
    expect(t.vars.get(358)).toBe(1);
    expect(t.bad()).toEqual([]);
  }, 120_000);

  it('obj_name: nazwa NPC z pro_crit.msg, imie gracza z opcji playerName', async () => {
    const t = await setup('KLADWTWN', 'kcbob');
    expect(t.rt.objName(t.npc.id)).not.toBe('');
    expect(t.rt.objName(t.player.id)).toBe('Chosen');
  }, 120_000);
});
