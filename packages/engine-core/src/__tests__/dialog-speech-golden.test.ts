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

/**
 * Mowa dialogowa na prawdziwych danych: rozmowa z Whiskey Bobem (Klamath) wola hook `speak`, a pole audio
 * wpisu MSG wskazuje istniejacy plik `sound/speech/<glowa>/<audio>.acm` (dialog-cue.md).
 */
describe.skipIf(!dir)('golden: mowa dialogowa (Klamath: Sulik z mowa, Whiskey Bob bez)', () => {
  let vfs: NodeVfs;
  beforeAll(async () => {
    vfs = await openGameFolderNode(dir!, patchDir);
  });
  afterAll(async () => {
    await vfs.close();
  });

  async function talk(script: string) {
    const loader = new MapLoader(vfs, new ProtoCache(vfs));
    const msgs = new MessageSource(vfs, { language: 'english' });
    const map = await loader.load('KLADWTWN');
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
    const lines: { list: number; msgId: number | undefined; headFid: number; text: string }[] = [];
    const stops: number[] = [];
    const hooks = createViewDialogHooks(view, {
      speak: (l) => lines.push(l),
      speakStop: () => stops.push(1),
    });
    const rt = new ScriptRuntime(world, msgs, await GameVars.load(vfs), hooks, {
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
    moveObject(
      map,
      player,
      hexNeighbors(npc.hex).find((h) => h >= 0 && h < 40000)!,
    );
    expect(cmd.talkTo(npc.id).ok).toBe(true);

    return { rt, view, cmd, lines, stops };
  }

  it('Sulik: kwestia ma pole audio i istniejacy plik ACM w sound/speech/<glowa>/', async () => {
    const t = await talk('kcsulik');
    expect(t.lines.length).toBeGreaterThanOrEqual(1);
    const l = t.lines[0]!;
    expect(l.msgId).toBeDefined();
    const audio = t.rt.messageAudio(l.list, l.msgId!);
    expect(audio, 'wpis MSG ma pole audio').toBeTruthy();
    const files = vfs.list('sound/speech/').map((f) => f.toLowerCase());
    const owners = files.filter((f) => f.endsWith(`/${audio!.toLowerCase()}.acm`));
    expect(owners.length, `sound/speech/*/${audio}.acm`).toBeGreaterThanOrEqual(1);
    // numer glowy z FID dialogu = indeks wiersza w heads.lst = katalog mowy (W, potwierdzone na Sulik)
    const heads = new TextDecoder().decode(await vfs.open('art/heads/heads.lst'));
    const names = heads.split(/\r\n|\r|\n/).map((r) => r.split(',')[0]!.trim().toLowerCase());
    expect(owners[0]).toBe(`sound/speech/${names[l.headFid & 0xfff]}/${audio!.toLowerCase()}.acm`);
    expect(owners[0]).toMatch(/^sound\/speech\/[^/]+\/[^/]+\.acm$/);
  }, 120_000);

  it('Whiskey Bob (bez mowy w grze): speak wolane, ale bez audio = cisza, nie blad; end zatrzymuje mowe', async () => {
    const t = await talk('kcbob');
    expect(t.lines).toHaveLength(1);
    expect(t.lines[0]!.text).toContain('my name’s Whiskey Bob');
    expect(t.rt.messageAudio(t.lines[0]!.list, t.lines[0]!.msgId!)).toBeUndefined();
    expect(t.cmd.dialog.choose(0).ok).toBe(true);
    expect(t.lines.length).toBeGreaterThanOrEqual(2); // nastepna kwestia znow wola speak
    let guard = 20;
    while (t.view.dialog.value && guard-- > 0) t.cmd.dialog.choose(0);
    expect(t.view.dialog.value).toBeNull();
    expect(t.stops.length).toBeGreaterThanOrEqual(1);
  }, 120_000);
});
