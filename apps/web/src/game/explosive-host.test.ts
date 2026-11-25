import { describe, expect, it, vi } from 'vitest';
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
import {
  FUSE_DEFAULT_SECONDS,
  FUSE_MAX_SECONDS,
  FUSE_MIN_SECONDS,
  clampFuseSeconds,
  fusePrompt,
  isUnarmedExplosive,
  plantFromHost,
} from './explosive-host';
import { createWorldInventory } from './inventory-world';
import { defaultSheet } from './save-world';

let nid = 1;
function obj(type: number, pid: number, hex: number, inv: GameObject[] = [], qty = 1): GameObject {
  return {
    id: nid++,
    pid,
    fid: 0,
    type,
    hex,
    elevation: 0,
    rotation: 0,
    frame: 0,
    flags: 0,
    protoFlags: 0,
    scriptId: -1,
    localVars: new Int32Array(0),
    inventory: inv,
    quantity: qty,
    proto:
      type === 0
        ? ({
            kind: 'item',
            pid,
            subtype: 5,
            weight: 1,
            cost: 1,
            invFid: 0,
            data: [],
            size: 1,
          } as never)
        : (undefined as never),
    extra:
      type === 0
        ? { kind: 'item', subtype: 5, flags: 0, raw: new Int32Array(0) }
        : { kind: 'critter', flags: 0, raw: new Int32Array(10) },
    hidden: false,
  };
}

function setup(opts: { degree?: number; perk?: boolean; qty?: number } = {}) {
  const dynamite = obj(0, 0x33, -1, [], opts.qty ?? 1);
  const player = obj(1, 0x01000000, 20100, [dynamite]);
  const map = {
    name: 'T',
    header: { playerHex: 20100, playerElevation: 0, playerOrientation: 0 },
    tiles: [{ floor: new Uint16Array(0), roof: new Uint16Array(0) }, null, null],
    objects: [player],
    byHex: new Map(),
    globalVars: new Int32Array(0),
    localVars: new Int32Array(0),
    scripts: [],
    exitGrids: [],
  } as unknown as GameMap;
  indexObject(map, player);
  const blast = vi.fn(() => []);
  const rt = {
    getObject: (id: number) => (id === player.id ? player : undefined),
    ownerOfItem: (it: GameObject) => (player.inventory.includes(it) ? player : undefined),
    rollVsSkill: vi.fn(() => ({ degree: opts.degree ?? 2, delta: 0 })),
    random: (min: number) => min,
    blastCritters: blast,
    destroyObject: vi.fn(),
    tick: vi.fn(),
    inventory: { rmObjFromInven: vi.fn(), partyObjects: () => [] },
  };
  const world = {
    map,
    player,
    clock: new GameClock(1000),
    movement: new MovementSystem(map),
    loader: {} as never,
    view: createGameView(),
    scripts: rt as never,
  } as World;
  const session = new GameSession({
    world,
    store: new SaveStore(new MemorySaveBackend()),
    locale: () => 'pl',
    now: () => 1000,
    engineVersion: 't',
  });
  if (opts.perk) session.state.sheet.perks[0x52] = 1;
  return { session, world, player, dynamite, rt, blast };
}

describe('zakres czasu zapalnika', () => {
  it('przycina do 1..180 i zaokragla, NaN daje domyslny', () => {
    expect(clampFuseSeconds(0)).toBe(FUSE_MIN_SECONDS);
    expect(clampFuseSeconds(999)).toBe(FUSE_MAX_SECONDS);
    expect(clampFuseSeconds(12.4)).toBe(12);
    expect(clampFuseSeconds(Number.NaN)).toBe(FUSE_DEFAULT_SECONDS);
  });
  it('rozpoznaje tylko nieustawione ladunki', () => {
    expect(isUnarmedExplosive(obj(0, 0x33, -1))).toBe(true);
    expect(isUnarmedExplosive(obj(0, 0x55, -1))).toBe(true);
    expect(isUnarmedExplosive(obj(0, 0xce, -1))).toBe(false);
  });
});

describe('ustawienie i wybuch ladunku w sesji', () => {
  it('zakolejkowany wybuch wykonuje sie w petli (session.update), przedmiot znika', () => {
    const { session, player, dynamite, blast } = setup();
    const r = plantFromHost(session, dynamite.id, 5);
    expect(r).toMatchObject({ ok: true, kind: 'explosion', atTick: 1050 });
    expect(dynamite.pid).toBe(0xce);
    expect(session.state.queue.peek((e) => e.kind !== 'midnight')).toHaveLength(1);
    session.update(49);
    expect(blast).not.toHaveBeenCalled();
    session.update(1);
    expect(blast).toHaveBeenCalledWith(player.hex, 0, 30);
    expect(player.inventory).not.toContain(dynamite);
    expect(session.state.queue.peek((e) => e.kind !== 'midnight')).toHaveLength(0);
  });
  it('niewypal (rzut 0) nie rani, ale usuwa ladunek po pelnym czasie', () => {
    const { session, player, dynamite, blast } = setup({ degree: 0 });
    const r = plantFromHost(session, dynamite.id, 2);
    expect(r).toMatchObject({ ok: true, kind: 'misfire', atTick: 1020 });
    session.update(20);
    expect(blast).toHaveBeenCalled();
    expect(player.inventory).not.toContain(dynamite);
  });
  it('Demolition Expert pomija rzut i dodaje obrazenia', () => {
    const { session, dynamite, blast, rt } = setup({ degree: 0, perk: true });
    plantFromHost(session, dynamite.id, 1);
    expect(rt.rollVsSkill).not.toHaveBeenCalled();
    session.update(10);
    expect(blast).toHaveBeenCalledWith(expect.anything(), 0, 40);
  });
  it('bez runtime skryptow zwraca missing', () => {
    const { session, world, dynamite } = setup();
    (world as { scripts?: unknown }).scripts = undefined;
    expect(plantFromHost(session, dynamite.id, 5)).toEqual({ ok: false, reason: 'missing' });
  });
});

describe('uzycie z ekwipunku otwiera dialog czasu', () => {
  it('useOnSelf pokazuje prompt, potwierdzenie ustawia tylko jedna sztuke ze stosu', () => {
    const { session, world, player, dynamite } = setup({ qty: 3 });
    const inv = createWorldInventory({
      world,
      sheet: () => defaultSheet(),
      allocId: () => nid++,
      useExplosive: (o, takeOne) => {
        fusePrompt.value = {
          itemId: o.id,
          onConfirm: (s) => {
            fusePrompt.value = null;
            plantFromHost(session, takeOne().id, s);
          },
        };
        return { ok: true };
      },
    });
    const view = inv.inventory.value.items.find((i) => i.id === dynamite.id);
    expect(view?.usable).toBe(true);
    expect(inv.useOnSelf(dynamite).ok).toBe(true);
    expect(fusePrompt.value?.itemId).toBe(dynamite.id);
    fusePrompt.value!.onConfirm(10);
    const armed = player.inventory.filter((o) => o.pid === 0xce);
    const rest = player.inventory.filter((o) => o.pid === 0x33);
    expect(armed).toHaveLength(1);
    expect(armed[0]!.quantity).toBe(1);
    expect(rest[0]!.quantity).toBe(2);
    expect(fusePrompt.value).toBeNull();
  });
});
