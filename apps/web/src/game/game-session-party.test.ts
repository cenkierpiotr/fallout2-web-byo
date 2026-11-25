import { describe, expect, it } from 'vitest';
import { perkAddForce, type Perk } from '@f2/rules';
import { createSheetCritter } from './sheet-critter';
import {
  GameClock,
  GameVars,
  InventoryModel,
  MemorySaveBackend,
  MovementSystem,
  PartyScriptAdapter,
  SaveStore,
  createGameView,
  indexObject,
  type GameMap,
  type GameObject,
  type World,
} from '@f2/engine-core';
import { GameSession } from './game-session';
import type { MidnightHost } from './midnight-host';
import { SessionExtras } from './session-extras';

const PID_NPC = 0x01000005;
let nid = 1;
function critter(hex: number, pid = 0x01000000): GameObject {
  return {
    id: nid++,
    pid,
    fid: 0x01000000,
    type: 1,
    hex,
    elevation: 0,
    rotation: 0,
    frame: 0,
    flags: 0,
    protoFlags: 0,
    scriptId: -1,
    localVars: new Int32Array(0),
    inventory: [],
    proto: undefined as never,
    extra: { kind: 'critter', flags: 0, raw: new Int32Array(10) },
    hidden: false,
  };
}

function setup(midnight?: MidnightHost) {
  const map = {
    name: 'ARTEMPLE',
    header: { playerHex: 20100, playerElevation: 0, playerOrientation: 0 } as GameMap['header'],
    tiles: [{ floor: new Uint16Array(0), roof: new Uint16Array(0) }, null, null],
    objects: [],
    byHex: new Map(),
    globalVars: new Int32Array(0),
    localVars: new Int32Array(0),
    scripts: [],
    exitGrids: [],
  } as GameMap;
  const player = critter(20100);
  const npc = critter(20140, PID_NPC);
  for (const o of [player, npc]) {
    map.objects.push(o);
    indexObject(map, o);
  }
  const objects = new Map(map.objects.map((o) => [o.id, o] as const));
  const extras = new SessionExtras({
    vars: new GameVars(Int32Array.from([0, 0])),
    partyDefs: [{ pid: PID_NPC } as never],
    player: { objId: player.id, pid: player.pid },
    rebindParty: (e) => inventory.rebindParty(e),
    quests: [],
    holodisks: [],
    karmavar: [],
  });
  // ten sam PartyState co w ScriptRuntime: opkody party_add pisza wprost do extras.party
  const inventory: InventoryModel = new InventoryModel({
    objects,
    currentMap: () => map,
    player: () => player,
    party: new PartyScriptAdapter(extras.party),
  });
  const world = {
    map,
    player,
    clock: new GameClock(1000),
    movement: new MovementSystem(map),
    loader: { load: () => Promise.reject(new Error('x')) },
    view: createGameView(),
    scripts: {
      movieFlags: new Uint8Array(17),
      inventory,
      captureCurrentMapState: () => null,
      applySavedScriptState: () => undefined,
      syncClock: () => undefined,
      tick: () => undefined,
    },
  } as unknown as World;
  const session = new GameSession({
    world,
    extras,
    store: new SaveStore(new MemorySaveBackend()),
    locale: () => 'pl',
    now: () => 1,
    engineVersion: 't',
    ...(midnight ? { midnight } : {}),
  });
  return { session, world, player, npc, extras, inventory };
}

describe('druzyna w sesji (PartyState <-> ScriptRuntime)', () => {
  it('party_add skryptu trafia od razu do PartyState, bez synchronizacji po fakcie', () => {
    const s = setup();
    s.inventory.partyAdd(s.npc.id);
    expect(s.extras.party.memberCount).toBe(1);
    expect(s.extras.party.entries[1]?.pid).toBe(PID_NPC);
    expect(s.npc.flags & 0x404).toBe(0x404);
    s.inventory.partyRemove(s.npc.id);
    expect(s.extras.party.memberCount).toBe(0);
  });

  it('zapis i odczyt: druzyna wraca do PartyState i do zbioru druzyny skryptow', async () => {
    const s = setup();
    s.inventory.partyAdd(s.npc.id);
    expect((await s.session.quickSave()).ok).toBe(true);
    s.inventory.partyRemove(s.npc.id);
    expect(s.extras.party.memberCount).toBe(0);
    expect((await s.session.quickLoad()).ok).toBe(true);
    expect(s.extras.party.memberCount).toBe(1);
    expect(s.inventory.party.has(s.npc.id)).toBe(true);
    // wczytana druzyna dalej zarzadza sie opkodami (te same instancje)
    s.inventory.partyRemove(s.npc.id);
    expect(s.extras.party.memberCount).toBe(0);
  });

  it('zapis i odczyt: flagi obejrzanych filmow (slot 21) wracaja do ScriptRuntime.movieFlags', async () => {
    const s = setup();
    const flags = (s.world.scripts as unknown as { movieFlags: Uint8Array }).movieFlags;
    flags[3] = 1;
    flags[16] = 1;
    expect((await s.session.quickSave()).ok).toBe(true);
    flags.fill(0);
    flags[7] = 1;
    expect((await s.session.quickLoad()).ok).toBe(true);
    expect(Array.from(flags)).toEqual(
      Array.from({ length: 17 }, (_, i) => (i === 3 || i === 16 ? 1 : 0)),
    );
  });

  it('zapis i odczyt: flaga gry zakonczonej wraca, wczytanie nie odpala konca ponownie', async () => {
    const ended: number[] = [];
    const s = setup({ endGame: (m) => ended.push(m) });
    const day = GameClock.TICKS_PER_DAY;
    expect((await s.session.quickSave()).ok).toBe(true); // zapis sprzed konca
    s.extras.globalAccess().set(7, 1);
    s.world.clock.advance(2 * day);
    s.session.update(0);
    expect(ended).toEqual([4]);
    expect(s.session.state.gameEnded).toBe(true);
    expect((await s.session.save('manual-0', 'k')).ok).toBe(true);
    s.session.state.gameEnded = false;
    expect((await s.session.load('manual-0')).ok).toBe(true);
    expect(s.session.state.gameEnded).toBe(true);
    s.world.clock.advance(day);
    s.session.update(0);
    expect(ended).toEqual([4]);
    // zapis sprzed konca: flaga wraca do false
    expect((await s.session.quickLoad()).ok).toBe(true);
    expect(s.session.state.gameEnded).toBe(false);
  });

  it('update: towarzysz daleko od gracza rusza za nim (sciezka przez MovementSystem)', () => {
    const s = setup();
    s.inventory.partyAdd(s.npc.id);
    s.session.update(10);
    expect(s.world.movement.stateOf(s.npc)).toBeDefined();
  });

  it('radiacja: dawka ustawia flage, polnoc testuje i zeruje, zapis v7 zachowuje flage', async () => {
    const s = setup();
    const day = GameClock.TICKS_PER_DAY;
    s.session.state.sheet.baseStats[2] = 1; // Endurance
    expect(s.session.addPlayerRadiation(0).needsMidnightCheck).toBe(false);
    expect(s.session.state.radiationFlag).toBe(false);
    s.session.addPlayerRadiation(800);
    expect(s.session.state.radiationFlag).toBe(true);
    expect((await s.session.save('manual-1', 'r')).ok).toBe(true);
    s.session.state.radiationFlag = false;
    expect((await s.session.load('manual-1')).ok).toBe(true);
    expect(s.session.state.radiationFlag).toBe(true);
    s.world.clock.advance(2 * day);
    s.session.update(0);
    expect(s.session.state.radiationFlag).toBe(false);
    const q = s.session.state.queue.peek((e) => e.kind === 'radiation');
    expect(q.length).toBeGreaterThan(0);
    // kolejna polnoc bez flagi nie dokłada zdarzen
    const n = q.length;
    s.world.clock.advance(day);
    s.session.update(0);
    expect(s.session.state.queue.peek((e) => e.kind === 'radiation').length).toBeLessThanOrEqual(n);
  });

  it('radiacja: playerRadiationPort dodaje dawke (odpornosc, flaga) i raportuje biezacy poziom', () => {
    const s = setup();
    const port = s.session.playerRadiationPort();
    port.add(30);
    const after = port.level();
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThanOrEqual(30); // odpornosc obniza dawke dodatnia
    expect(s.session.state.radiationFlag).toBe(true);
    port.add(-10);
    expect(port.level()).toBe(after - 10);
    port.add(-100);
    expect(port.level()).toBe(0);
  });

  it('radiacja: pancerz nie ma wlasnej odpornosci (0x4715f8 tylko AC/DR/DT); odpornosc daje perk pancerza (Powered Armor +30)', () => {
    const s = setup();
    const c = createSheetCritter(() => s.session.state.sheet);
    s.session.state.sheet.baseStats[2] = 5;
    const base = s.session.state.sheet.radiation ?? 0;
    s.session.addPlayerRadiation(100);
    const bare = (s.session.state.sheet.radiation ?? 0) - base;
    s.session.state.sheet.radiation = base;
    expect(perkAddForce(c, 62 as Perk).ok).toBe(true); // perk 62 = Powered Armor, stat 31 +30
    s.session.addPlayerRadiation(100);
    const worn = (s.session.state.sheet.radiation ?? 0) - base;
    expect(worn).toBeLessThan(bare);
    expect(bare - worn).toBe(30);
  });

  it('radiacja: zdarzenie ze smiercia (SPECIAL <= 0) zabija gracza i zglasza sygnal smierci', () => {
    const calls: string[] = [];
    const seen: boolean[] = [];
    const s = setup({ radiationEvent: (r) => void seen.push(r.dead) });
    (s.world.scripts as unknown as { requestPlayerDeath(): void }).requestPlayerDeath = () =>
      void calls.push('death');
    for (let i = 0; i < 7; i++) s.session.state.sheet.baseStats[i] = 1;
    s.session.state.queue.add({
      atTick: s.world.clock.ticks,
      kind: 'radiation',
      objId: s.player.id,
      payload: { level: 4, phase: 0 },
    });
    s.session.update(0);
    expect(seen).toEqual([true]);
    expect(calls).toEqual(['death']);
  });
});
