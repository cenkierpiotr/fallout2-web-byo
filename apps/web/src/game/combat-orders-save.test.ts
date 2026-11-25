import { describe, expect, it } from 'vitest';
import type { AiPacket, AiPacketTable } from '@f2/rules';
import { CombatController, type CombatHost } from './combat-controller';
import { loadCombatSave, saveCombat } from './combat-save';
import { defaultSessionState } from './save-world';

let nid = 500;
const line = (from: number, to: number): number[] => {
  const out: number[] = [];
  for (let h = from; h !== to;) {
    h += Math.sign(to - h);
    out.push(h);
  }
  return out;
};
function critter(hex: number, over: Record<string, unknown> = {}): never {
  const raw = new Int32Array(10);
  raw[7] = 12;
  return {
    id: nid++,
    pid: 0x1000000 + 5,
    fid: 0x1000000,
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
    proto: {
      kind: 'critter',
      team: 1,
      aiPacket: 0,
      killType: 0,
      skills: new Array(18).fill(0),
      baseStats: new Array(35).fill(5).map((v, i) => (i >= 9 && i !== 13 && i !== 15 ? 0 : v)),
      bonusStats: new Array(35).fill(0),
      critterFlags: 0,
      bodyType: 0,
      expForKill: 7,
      damageType: 0,
    },
    extra: { kind: 'critter', flags: 0, raw },
    hidden: false,
    ...over,
  } as never;
}

function setup(foeHex: number, allyHex: number) {
  nid = 500;
  const player = critter(100, { id: 1 });
  const ally = critter(allyHex, { team: 0 }) as {
    id: number;
    hex: number;
    extra: { raw: Int32Array };
  };
  ally.extra.raw[5] = 0;
  const foe = critter(foeHex);
  const objects = [player, ally, foe] as { id: number; hex: number }[];
  const state = defaultSessionState();
  state.sheet.hp = 30;
  const host: CombatHost = {
    world: {
      player,
      map: { objects, byHex: new Map() },
      movement: { cancel: () => undefined, start: () => ({ ok: true }), stateOf: () => undefined },
      scripts: { applyHit: () => {}, inventory: { partyObjects: () => [ally] } },
    } as never,
    state,
    enemiesNearby: () => false,
  };
  return { host, ally, foe: foe as unknown as { id: number } };
}

const PK: AiPacket = {
  name: 'test',
  packetNum: 0,
  aggression: 50,
  maxDist: 30,
  minToHit: 0,
  minHp: 0,
  chance: 0,
  hurtTooMuch: new Set(),
  runAwayIndex: -1,
  bestWeapon: -1,
  distance: 'charge',
  attackWho: 'closest',
  areaMode: 'unset',
  chemUse: 0,
  msgRanges: {} as AiPacket['msgRanges'],
};
const table = { find: () => PK } as unknown as AiPacketTable;

describe('rozkazy druzyny w walce (Zadanie 38)', () => {
  it('rozkazy z PartyState nadpisuja pakiet AI towarzysza, wrog zostaje przy domyslnym', () => {
    const { host, ally, foe } = setup(110, 101);
    (host as { extras?: unknown }).extras = {
      party: {
        ordersOf: (id: number) =>
          id === ally.id ? { distance: 'stay_close', attackWho: 'strongest' } : {},
      },
    };
    const c = CombatController.start(host, { seed: 1, path: line, ai: table }) as CombatController;
    const a = c.combat.all.find((x) => x.id === ally.id)!;
    const f = c.combat.all.find((x) => x.id === foe.id)!;
    expect(a.ai?.distance).toBe('stay_close');
    expect(a.ai?.attackWho).toBe('strongest');
    expect(f.ai?.distance).toBe('charge');
    expect(PK.distance).toBe('charge'); // wejscie nie mutowane
  });

  it('klucz rozkazow to id wpisu PartyState (partyStateId), nie id obiektu', () => {
    const { host, ally } = setup(110, 101);
    (
      host.world.scripts as unknown as { inventory: Record<string, unknown> }
    ).inventory.partyStateId = (id: number) => (id === ally.id ? 9001 : id);
    (host as { extras?: unknown }).extras = {
      party: { ordersOf: (id: number) => (id === 9001 ? { distance: 'snipe' } : {}) },
    };
    const c = CombatController.start(host, { seed: 1, path: line, ai: table }) as CombatController;
    expect(c.combat.all.find((x) => x.id === ally.id)?.ai?.distance).toBe('snipe');
  });
});

describe('zapis trwajacej walki (Zadanie 43)', () => {
  it('snapshot -> JSON -> restore daje identyczny dalszy przebieg walki', () => {
    const run = (c: CombatController, n: number): string => {
      for (let i = 0; i < n && !c.combat.ended; i++) c.endTurn();
      return JSON.stringify([c.combat.snapshot(), c.combat.events.length]);
    };
    // walka A: 3 tury, zapis, dalsze 6 tur
    const a = setup(104, 101);
    const ca = CombatController.start(a.host, { seed: 11, path: line }) as CombatController;
    for (let i = 0; i < 2 && !ca.combat.ended; i++) ca.endTurn();
    const save = JSON.parse(JSON.stringify(ca.snapshot()));
    expect(save.version).toBe(1);
    const tailA = run(ca, 6);
    const stateA = JSON.parse(tailA)[0];

    // walka B: swiat odtworzony od zera, stan z zapisu, te same dalsze 6 tur
    const b = setup(104, 101);
    // ten sam stan swiata co w chwili zapisu (hex-y uczestnikow ze snapshotu)
    const cb = CombatController.restore(b.host, save, { path: line }) as CombatController;
    expect(JSON.stringify(cb.combat.snapshot())).toBe(JSON.stringify(save.session));
    const tailB = run(cb, 6);
    expect(JSON.parse(tailB)[0].order.map((o: { id: number; hp: number }) => o.hp)).toEqual(
      stateA.order.map((o: { id: number; hp: number }) => o.hp),
    );
  });

  it('modData: saveCombat zapisuje trwajaca walke, a zakonczona/brak czysci wpis', () => {
    const { host } = setup(104, 101);
    const c = CombatController.start(host, { seed: 3, path: line }) as CombatController;
    const sess = { state: { modData: {} as Record<string, unknown> } };
    expect(loadCombatSave(sess)).toBeUndefined();
    saveCombat(sess, c);
    expect(loadCombatSave(sess)?.version).toBe(1);
    saveCombat(sess, null);
    expect(loadCombatSave(sess)).toBeUndefined();
  });
});
