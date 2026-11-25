import { describe, expect, it } from 'vitest';
import {
  GameClock,
  MemorySaveBackend,
  MovementSystem,
  SaveStore,
  createGameView,
  indexObject,
  type GameMap,
  type GameObject,
  type World,
} from '@f2/engine-core';
import { GameSession } from './game-session';
import { BARTER_RULES, commitBarter, createBarter } from './barter-open';
import { buildSaveWorld, defaultSessionState, toSaveItem } from './save-world';
import { MapRegistry } from '@f2/engine-core';

let nid = 1;
function item(pid: number, qty: number, cost: number, weight = 1, flags = 0): GameObject {
  return {
    id: nid++,
    pid,
    fid: 0x0000_0001,
    type: 0,
    hex: -1,
    elevation: 0,
    rotation: 0,
    frame: 0,
    flags,
    protoFlags: 0,
    scriptId: -1,
    localVars: new Int32Array(0),
    inventory: [],
    quantity: qty,
    proto: {
      kind: 'item',
      pid,
      type: 0,
      index: pid & 0xffffff,
      textId: 0,
      fid: 0,
      lightDistance: 0,
      lightIntensity: 0,
      flags: 0,
      extFlags: 0,
      scriptId: -1,
      subtype: 5,
      material: 0,
      size: 1,
      weight,
      cost,
      invFid: 0,
      soundId: 0,
      data: [],
      tail: [],
    } as unknown as GameObject['proto'],
    extra: { kind: 'item', subtype: 5, flags: 0, raw: new Int32Array(0) },
    hidden: false,
  };
}

function critter(hex: number, inv: GameObject[] = []): GameObject {
  return {
    id: nid++,
    pid: 0x01000000,
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
    inventory: inv,
    proto: undefined as never,
    extra: { kind: 'critter', flags: 0, raw: new Int32Array(10) },
    hidden: false,
  };
}

function mapOf(name: string): GameMap {
  return {
    name,
    header: { playerHex: 20100, playerElevation: 0, playerOrientation: 0 } as GameMap['header'],
    tiles: [{ floor: new Uint16Array(0), roof: new Uint16Array(0) }, null, null],
    objects: [],
    byHex: new Map(),
    globalVars: new Int32Array(0),
    localVars: new Int32Array(0),
    scripts: [],
    exitGrids: [],
  };
}

const fakeProtos = {
  get: (pid: number) => Promise.resolve(item(pid, 1, 10, 1).proto),
};

function setup(withProtos = false) {
  const map = mapOf('ARTEMPLE');
  const caps = item(0x29, 100, 1, 0);
  const knife = item(0x10, 1, 40, 2);
  const player = critter(20100, [caps, knife]);
  const merchant = critter(20110, [item(0x2a, 2, 50, 1)]);
  for (const o of [player, merchant]) {
    map.objects.push(o);
    indexObject(map, o);
  }
  const other = mapOf('ARCAVES');
  const world: World = {
    map,
    player,
    clock: new GameClock(302400),
    movement: new MovementSystem(map),
    loader: {
      load: (n) => (n === 'ARCAVES' ? Promise.resolve(other) : Promise.reject(new Error('x'))),
    },
    view: createGameView(),
  };
  const store = new SaveStore(new MemorySaveBackend());
  const session = new GameSession({
    world,
    store,
    locale: () => 'pl',
    now: () => 1000,
    engineVersion: 't',
    ...(withProtos ? { protos: fakeProtos } : {}),
  });
  return { session, world, player, merchant, map };
}

describe('SaveWorld z prawdziwego World', () => {
  it('buildSaveWorld mapuje gracza, ekwipunek (quantity), zegar i mape', () => {
    const { world } = setup();
    const w = buildSaveWorld(world, defaultSessionState(), new MapRegistry());
    expect(w.player.hex).toBe(20100);
    expect(w.player.inventory.map((i) => [i.pid, i.count])).toEqual([
      [0x29, 100],
      [0x10, 1],
    ]);
    expect(w.clock.ticks).toBe(302400);
    expect(w.currentMap.name).toBe('ARTEMPLE');
    expect(w.maps.map((m) => m.name)).toEqual(['ARTEMPLE']);
    // gracz nie trafia do obiektow mapy
    expect(w.maps[0]!.elevations[0]!.objects.some((o) => o.objId === world.player.id)).toBe(false);
  });

  it('toSaveItem rozpoznaje zalozony przedmiot', () => {
    expect(toSaveItem(item(1, 1, 1, 1, 0x1000000)).equippedSlot).toBe('left');
  });
});

describe('GameSession: zapis/odczyt', () => {
  it('quickSave + zmiana stanu + quickLoad przywraca zegar i pozycje', async () => {
    const { session, world } = setup();
    expect((await session.quickSave()).ok).toBe(true);
    expect(session.view.saves.value.map((s) => s.slot)).toContain('quick');
    world.clock.advance(5000);
    world.player.hex = 20120;
    expect((await session.quickLoad()).ok).toBe(true);
    expect(world.clock.ticks).toBe(302400);
    expect(world.player.hex).toBe(20100);
    expect(session.view.clock.value.ticks).toBe(302400);
  });

  it('beforeSave dopisuje stan z UI (np. mapa swiata) do modData zapisu, a wczytanie go zwraca', async () => {
    const { session } = setup();
    let n = 0;
    session.beforeSave = () => {
      n += 1;
      session.state.modData['worldmapOpen'] = 1;
    };
    expect((await session.save('manual-0')).ok).toBe(true);
    expect(n).toBeGreaterThan(0);
    session.beforeSave = null;
    session.state.modData = {};
    expect((await session.load('manual-0')).ok).toBe(true);
    expect(session.state.modData['worldmapOpen']).toBe(1);
  });

  it('wczytanie zapisu z innej mapy przechodzi na te mape', async () => {
    const { session, world } = setup();
    expect((await session.travelTo('ARCAVES', 20300)).ok).toBe(true);
    await session.save('manual-0');
    // wracamy na ARTEMPLE przez loader (symulacja: nowa mapa w loaderze)
    world.loader = { load: () => Promise.resolve(mapOf('ARTEMPLE')) };
    await session.travelTo('ARTEMPLE', 20100);
    expect(world.map.name).toBe('ARTEMPLE');
    world.loader = { load: () => Promise.resolve(mapOf('ARCAVES')) };
    expect((await session.load('manual-0')).ok).toBe(true);
    expect(world.map.name).toBe('ARCAVES');
    expect(world.player.hex).toBe(20300);
  });

  it('travelTo wrzuca opuszczana mape do rejestru', async () => {
    const { session } = setup();
    await session.travelTo('ARCAVES');
    expect(session.registry.has('ARTEMPLE')).toBe(true);
  });

  it('zapis zablokowany w dialogu', async () => {
    const { world } = setup();
    const s = new GameSession({
      world,
      store: new SaveStore(new MemorySaveBackend()),
      locale: () => 'pl',
      now: () => 1,
      engineVersion: 't',
      isInDialog: () => true,
    });
    expect(await s.quickSave()).toEqual({ ok: false, reason: 'save-in-dialog' });
  });

  it('zapis (szybki, reczny, auto) zablokowany w walce, po walce dziala', async () => {
    const { world } = setup();
    let inCombat = true;
    const s = new GameSession({
      world,
      store: new SaveStore(new MemorySaveBackend()),
      locale: () => 'pl',
      now: () => 1,
      engineVersion: 't',
      isInCombat: () => inCombat,
    });
    expect(await s.quickSave()).toEqual({ ok: false, reason: 'save-in-combat' });
    expect(await s.saveCommands.autosave()).toEqual({ ok: false, reason: 'save-in-combat' });
    expect(await s.saveCommands.save('manual-1')).toEqual({ ok: false, reason: 'save-in-combat' });
    inCombat = false;
    expect((await s.quickSave()).ok).toBe(true);
  });
});

describe('GameSession: handel', () => {
  it('createBarter korzysta z regul @f2/rules', () => {
    expect(typeof BARTER_RULES.barterPrice).toBe('function');
  });

  it('open: snapshot z ekwipunkow, nieodpowiednia oferta odrzucona, balance + accept przepisuje ekwipunki', () => {
    const { session, player, merchant } = setup();
    const snap = session.openBarter(merchant, { merchantName: 'Vic', barterMod: 0 });
    expect(snap.player.map((i) => i.pid)).toEqual([0x29, 0x10]);
    expect(snap.merchant.map((i) => i.pid)).toEqual([0x2a]);
    const wanted = snap.merchant[0]!;
    expect(session.barter.move('merchant', wanted.id, 1, 'table')).toEqual({ ok: true });
    expect(session.view.barter.value!.tableMerchant).toHaveLength(1);
    expect(session.barter.accept()).toEqual({ ok: false, reason: 'offer-too-low' });
    expect(session.barter.balance()).toEqual({ ok: true });
    expect(session.barter.accept()).toEqual({ ok: true });
    // gracz dostal 1 szt. towaru, oddal kapsle
    const got = player.inventory.find((o) => o.pid === 0x2a);
    expect(got?.quantity).toBe(1);
    expect(merchant.inventory.find((o) => o.pid === 0x2a)?.quantity).toBe(1);
    const caps = merchant.inventory.find((o) => o.pid === 0x29);
    expect(caps!.quantity).toBeGreaterThan(0);
    expect(player.inventory.find((o) => o.pid === 0x29)!.quantity! + caps!.quantity!).toBe(100);
  });

  it('barter_mod z gdialog_barter trafia do parametrow sesji handlu (domyslnie 0)', () => {
    const a = setup();
    expect(a.session.openBarter(a.merchant, { barterMod: 50 }).params.barterMod).toBe(50);
    const b = setup();
    expect(b.session.openBarter(b.merchant, { barterMod: -20 }).params.barterMod).toBe(-20);
    const c = setup();
    expect(c.session.openBarter(c.merchant).params.barterMod).toBe(0);
  });

  it('merchantBarter liczony z rekordu NPC (4*CH + punkty Barter z protoku), nie 0', () => {
    const a = setup();
    // brak prototypu: domyslny SPECIAL 5 => Barter 4*5 = 20
    expect(a.session.openBarter(a.merchant).params.merchantBarter).toBe(20);
    const b = setup();
    const baseStats = new Array<number>(35).fill(5);
    baseStats[3] = 8;
    const skills = new Array<number>(18).fill(0);
    skills[15] = 30;
    b.merchant.proto = { kind: 'critter', baseStats, bonusStats: [], skills } as never;
    expect(b.session.openBarter(b.merchant).params.merchantBarter).toBe(4 * 8 + 30);
    // jawne nadpisanie ma pierwszenstwo
    const c = setup();
    expect(c.session.openBarter(c.merchant, { merchantBarter: 77 }).params.merchantBarter).toBe(77);
  });

  it('partyBestBarter = najlepszy Barter wsrod gracza i widocznych towarzyszy (f2_party_best_skill 0x4955c8)', () => {
    const a = setup();
    const own = a.session.openBarter(a.merchant).params.partyBestBarter;
    const mate = critter(20120, []);
    const hiddenMate = critter(20121, []);
    hiddenMate.hidden = true;
    (a.world as { scripts?: unknown }).scripts = {
      critters: { skill: (o: unknown) => (o === mate ? own + 40 : o === hiddenMate ? 900 : 0) },
      inventory: { partyObjects: () => [a.player, mate, hiddenMate] },
    };
    // ukryty towarzysz jest pomijany (+0x24 & 1), jawne nadpisanie ma pierwszenstwo
    expect(a.session.openBarter(a.merchant).params.partyBestBarter).toBe(own + 40);
    expect(a.session.openBarter(a.merchant, { partyBestBarter: 5 }).params.partyBestBarter).toBe(5);
  });

  it('wyzszy Barter kupca podnosi cene oferty gracza (ratio (B+160)/(160+P))', () => {
    const low = setup();
    low.player.inventory[1]!.flags = 0;
    const baseStats = new Array<number>(35).fill(5);
    baseStats[3] = 10;
    const skills = new Array<number>(18).fill(0);
    skills[15] = 100;
    const hi = setup();
    hi.merchant.proto = { kind: 'critter', baseStats, bonusStats: [], skills } as never;
    const price = (x: ReturnType<typeof setup>): number => {
      const snap = x.session.openBarter(x.merchant);
      x.session.barter.move('player', snap.player[1]!.id, 1, 'table');
      return x.session.view.barter.value!.totals.offer;
    };
    expect(price(hi)).toBeGreaterThan(price(low));
  });

  it('cancel nic nie przepisuje; ekwipunek zalozony jest nietransferowalny', () => {
    const { session, player, merchant } = setup();
    player.inventory[1]!.flags |= 0x2000000;
    const snap = session.openBarter(merchant);
    expect(snap.player[1]!.tradeable).toBe(false);
    expect(session.barter.move('player', snap.player[1]!.id, 1, 'table')).toEqual({
      ok: false,
      reason: 'not-tradeable',
    });
    session.barter.cancel();
    expect(player.inventory.map((o) => o.quantity)).toEqual([100, 1]);
  });

  it('commitBarter bez sesji: brak sesji zwraca blad', () => {
    const { session } = setup();
    expect(session.barter.accept()).toEqual({ ok: false, reason: 'session-closed' });
    expect(typeof commitBarter).toBe('function');
    expect(typeof createBarter).toBe('function');
  });
});

describe('GameSession: odtwarzanie swiata przy wczytaniu', () => {
  it('quickLoad odtwarza obiekty mapy z rejestru i ekwipunek z zaloznym przedmiotem', async () => {
    const { session, world, player, map } = setup(true);
    const crate = item(0x30, 1, 5);
    crate.hex = 20200;
    map.objects.push(crate);
    indexObject(map, crate);
    player.inventory[1]!.flags |= 0x2000000;
    expect((await session.quickSave()).ok).toBe(true);

    // zmiany po zapisie: obiekt znika, nowy sie pojawia, ekwipunek traci kapsle
    map.objects = map.objects.filter((o) => o !== crate);
    map.byHex.clear();
    const dropped = item(0x31, 1, 5);
    dropped.hex = 20300;
    map.objects.push(dropped);
    indexObject(map, dropped);
    player.inventory = [];

    expect((await session.quickLoad()).ok).toBe(true);
    const pids = world.map.objects.filter((o) => o !== player).map((o) => o.pid);
    expect(pids).toContain(0x30);
    expect(pids).not.toContain(0x31);
    expect(world.map.byHex.get(20200)?.map((o) => o.pid)).toEqual([0x30]);
    expect(world.player.inventory.map((o) => [o.pid, o.quantity])).toEqual([
      [0x29, 100],
      [0x10, 1],
    ]);
    expect(world.player.inventory[1]!.flags & 0x2000000).toBe(0x2000000);
    expect(world.map.byHex.get(player.hex)).toContain(player);
  });
});

describe('GameSession: polnoc 0x4a3620', () => {
  it('kolejkuje polnoc, o 00:00 czyści dzienne bity obiektów mapy i planuje kolejną', () => {
    const { session, world, map } = setup();
    expect(session.state.queue.peek((e) => e.kind === 'midnight')).toHaveLength(1);
    const it = item(0x10, 1, 1);
    it.extra = { kind: 'item', subtype: 5, flags: 0x0c000000, raw: new Int32Array(0) };
    map.objects.push(it);
    const first = session.state.queue.nextTime()!;
    world.clock.ticks = first;
    session.update(0);
    expect((it.extra as { flags: number }).flags).toBe(0x08000000);
    const next = session.state.queue.peek((e) => e.kind === 'midnight');
    expect(next).toHaveLength(1);
    expect(next[0]!.atTick).toBe(first + 864000);
  });
});

describe('GameSession: hooki polnocy', () => {
  it('polnoc po 90 dniach pokazuje slajd 0xc przez host i oznacza flage filmu', () => {
    const { world } = setup();
    const flags = new Uint8Array(17);
    (world as { scripts?: unknown }).scripts = {
      movieFlags: flags,
      tick: () => {},
      inventory: { partyObjects: () => [] },
    };
    const vars = new Map<number, number>();
    const shown: number[] = [];
    const session = new GameSession({
      world,
      store: new SaveStore(new MemorySaveBackend()),
      locale: () => 'pl',
      now: () => 1000,
      engineVersion: 't',
      extras: {
        globalAccess: () => ({
          get: (i: number) => vars.get(i) ?? 0,
          set: (i: number, v: number) => void vars.set(i, v),
        }),
      } as never,
      midnight: { showSlide: (m) => shown.push(m) },
    });
    world.clock.advance(90 * 864000 - world.clock.ticks + 10);
    session.update(0);
    expect(shown).toEqual([0xc]);
    expect(flags[0xc]).toBe(1);
  });
});
