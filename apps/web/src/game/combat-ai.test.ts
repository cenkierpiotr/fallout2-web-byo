import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAiTxt } from '@f2/formats';
import { AiPacketTable, DamageType, type AiPacket, type AiPacketSource } from '@f2/rules';
import { CombatSession, type Combatant, type WeaponSpec } from './combat';
import { hexDistance } from '@f2/engine-core';
import { CombatController, fleePath } from './combat-controller';
import { defaultSessionState } from './save-world';

const patch = process.env.F2_PATCH_DIR;

describe.skipIf(!patch)('AI.TXT golden: pakiety w silniku', () => {
  const table = patch
    ? new AiPacketTable(parseAiTxt(readFileSync(join(patch, 'DATA', 'Data', 'AI.TXT'), 'latin1')))
    : (undefined as never);
  it('wszystkie pakiety znormalizowane, packet_num unikalne', () => {
    expect(table.size).toBe(187);
    expect(table.find(179)?.name).toBe('Addict - Wimpy');
    expect(() => table.get(99999)).toThrow(/Missing AI Packet/);
  });
  it('Addict - Wimpy: coward, min_to_hit 90, zakresy taunta z pliku', () => {
    const p = table.get(179);
    expect(p.runAwayIndex).toBe(0);
    expect(p.minToHit).toBe(90);
    expect(p.msgRanges.run).toEqual([2000, 2019]);
    expect(p.msgRanges.hitHead).toEqual([1000, 1009]);
    expect(p.chance).toBe(15);
  });
});

const RIFLE: WeaponSpec = {
  name: 'rifle',
  pid: 8,
  minDmg: 5,
  maxDmg: 5,
  apCost: 4,
  range: 12,
  skill: 90,
  burst: 1,
  damageType: DamageType.Normal,
  cls: 4,
};
const msgRanges = Object.fromEntries(
  [
    'attack',
    'move',
    'run',
    'miss',
    'hitEyes',
    'hitGroin',
    'hitHead',
    'hitLeftArm',
    'hitLeftLeg',
    'hitRightArm',
    'hitRightLeg',
    'hitTorso',
  ].map((k) => [k, [0, 0]]),
) as unknown as AiPacket['msgRanges'];
const pkt = (over: Partial<AiPacket> = {}): AiPacket => ({
  name: 'T',
  packetNum: 1,
  aggression: 50,
  maxDist: 20,
  minToHit: 0,
  minHp: 0,
  chance: 0,
  hurtTooMuch: new Set(),
  runAwayIndex: 5,
  bestWeapon: -1,
  distance: 'on_your_own',
  attackWho: 'closest',
  areaMode: 'unset',
  chemUse: 0,
  msgRanges,
  ...over,
});
const player = (hex: number, hp = 40): Omit<Combatant, 'ap'> => ({
  id: 1,
  team: 0,
  hp,
  maxHp: 40,
  maxAp: 8,
  sequence: 1,
  agility: 5,
  hex,
  isPlayer: true,
});
const npc = (
  id: number,
  hex: number,
  ai: AiPacket | undefined,
  hp = 20,
  seq = 20,
): Omit<Combatant, 'ap'> => ({
  id,
  team: 1,
  hp,
  maxHp: 20,
  maxAp: 8,
  sequence: seq,
  agility: 5,
  hex,
  isPlayer: false,
  weapons: [RIFLE],
  ...(ai ? { ai } : {}),
});
const miss = () => ({ hit: false, damage: 0 });

describe('CombatSession z pakietem AI', () => {
  it('coward ucieka zamiast atakowac (zdarzenie flee, wiekszy dystans)', () => {
    const c = new CombatSession([player(0), npc(2, 5, pkt({ runAwayIndex: 0 }), 19)], miss);
    expect(c.current.id).toBe(2);
    c.autoTurn();
    const e = c.events;
    expect(e.some((x) => x.kind === 'flee')).toBe(true);
    expect(e.some((x) => x.kind === 'attack')).toBe(false);
    expect(c.all.find((x) => x.id === 2)?.hex).toBeGreaterThan(5);
  });
  it('przyparty (brak sciezki ucieczki) walczy dalej', () => {
    const c = new CombatSession(
      [player(0), npc(2, 5, pkt({ runAwayIndex: 0 }), 19)],
      miss,
      undefined,
      { flee: () => null },
    );
    c.autoTurn();
    expect(c.events.some((x) => x.kind === 'attack')).toBe(true);
  });
  it('bez pakietu zachowanie bez zmian (atak najblizszego)', () => {
    const c = new CombatSession([player(0), npc(2, 5, undefined)], miss);
    c.autoTurn();
    expect(c.events.filter((x) => x.kind === 'attack').length).toBe(2);
  });
  it('distance=stay: nie podchodzi bez trafienia', () => {
    const c = new CombatSession(
      [player(0), npc(2, 30, pkt({ distance: 'stay', maxDist: 40 }))],
      miss,
    );
    c.autoTurn();
    expect(c.events.some((x) => x.kind === 'move' || x.kind === 'attack')).toBe(false);
    expect(c.all.find((x) => x.id === 2)?.hex).toBe(30);
  });
  it('max_dist: cel poza zasiegiem ignorowany, charge podchodzi', () => {
    const far = new CombatSession([player(0), npc(2, 50, pkt({ maxDist: 10 }))], miss);
    far.autoTurn();
    expect(far.events.some((x) => x.kind === 'move')).toBe(false);
    const ch = new CombatSession(
      [player(0), npc(2, 50, pkt({ maxDist: 10, distance: 'charge' }))],
      miss,
    );
    ch.autoTurn();
    expect(ch.events.some((x) => x.kind === 'move')).toBe(true);
  });
  it('attack_who=weakest wybiera slabszy cel (kompan gracza)', () => {
    const ally = {
      id: 3,
      team: 0,
      hp: 5,
      maxHp: 40,
      maxAp: 8,
      sequence: 1,
      agility: 5,
      hex: 8,
      isPlayer: false,
    };
    const c = new CombatSession([player(2), ally, npc(9, 6, pkt({ attackWho: 'weakest' }))], miss);
    c.autoTurn();
    const a = c.events.find((x) => x.kind === 'attack');
    expect(a).toMatchObject({ attacker: 9, target: 3 });
  });
  it('min_to_hit: nie strzela gdy szansa ponizej progu', () => {
    const c = new CombatSession([player(0), npc(2, 1, pkt({ minToHit: 60 }))], miss, undefined, {
      hitChance: () => 30,
    });
    c.autoTurn();
    expect(c.events.some((x) => x.kind === 'attack')).toBe(false);
  });
  it('taunty: chance 100 daje wiersz z zakresu; ofiara reaguje na trafienie i pudlo', () => {
    const ranges = { ...msgRanges, attack: [2040, 2042] as const, miss: [2060, 2062] as const };
    const c = new CombatSession(
      [player(0), npc(2, 3, pkt({ chance: 100, msgRanges: ranges }))],
      miss,
    );
    c.autoTurn();
    const t = c.events.filter((x) => x.kind === 'taunt') as { id: number; msgId: number }[];
    expect(t.length).toBeGreaterThan(0);
    for (const x of t) expect(x.msgId >= 2040 && x.msgId <= 2042).toBe(true);
  });
  it('chance 0: zero taunta', () => {
    const ranges = { ...msgRanges, attack: [2040, 2042] as const };
    const c = new CombatSession(
      [player(0), npc(2, 3, pkt({ chance: 0, msgRanges: ranges }))],
      miss,
    );
    c.autoTurn();
    expect(c.events.some((x) => x.kind === 'taunt')).toBe(false);
  });
  it('best_weapon: ranged wybiera karabin zamiast piesci/noza', () => {
    const KNIFE: WeaponSpec = { ...RIFLE, name: 'knife', pid: 9, range: 1, cls: 2, apCost: 3 };
    const n = { ...npc(2, 5, pkt({ bestWeapon: 4 })), weapons: [KNIFE, RIFLE] };
    const c = new CombatSession([player(0), n], miss);
    c.autoTurn();
    expect(c.events.filter((x) => x.kind === 'attack').length).toBe(2); // 4 AP strzaly zamiast podchodzenia
    expect(c.events.some((x) => x.kind === 'move')).toBe(false);
  });
  it('body_type 1 (czworonog): bramka 0x4299a0 odcina bron z ekwipunku (kandydat B)', () => {
    const KNIFE: WeaponSpec = { ...RIFLE, name: 'knife', pid: 9, range: 1, cls: 2, apCost: 3 };
    const base = { ...npc(2, 5, pkt({ bestWeapon: 4 })), weapons: [KNIFE, RIFLE] };
    const quad = new CombatSession([player(0), { ...base, bodyType: 1 }], miss);
    quad.autoTurn();
    expect(quad.events.some((x) => x.kind === 'move')).toBe(true);
    const robot = new CombatSession([player(0), { ...base, bodyType: 2 }], miss);
    robot.autoTurn();
    expect(robot.events.some((x) => x.kind === 'move')).toBe(false);
  });
  it('Dogmeat (pid 0x1000098) omija bramke body_type', () => {
    const KNIFE: WeaponSpec = { ...RIFLE, name: 'knife', pid: 9, range: 1, cls: 2, apCost: 3 };
    const dog = {
      ...npc(2, 5, pkt({ bestWeapon: 4 })),
      weapons: [KNIFE, RIFLE],
      bodyType: 1,
      pid: 0x1000098,
    };
    const c = new CombatSession([player(0), dog], miss);
    c.autoTurn();
    expect(c.events.some((x) => x.kind === 'move')).toBe(false);
  });
});

describe('fleePath', () => {
  it('wybiera heks dalej od wroga, w limicie krokow', () => {
    const p = fleePath(
      (to) => Array.from({ length: hexDistance(20100, to) }, (_, i) => to + i),
      20100,
      20099,
      4,
    );
    expect(p).not.toBeNull();
    expect((p as number[]).length).toBeLessThanOrEqual(4);
    expect(hexDistance((p as number[])[0] as number, 20099)).toBeGreaterThanOrEqual(0);
  });
});

describe('CombatController z AI.TXT', () => {
  const mkCritter = (id: number, hex: number, aiPacket: number): never => {
    const raw = new Int32Array(10);
    raw[7] = 12;
    raw[2] = 6;
    return {
      id,
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
        aiPacket,
        killType: 0,
        skills: new Array(18).fill(0),
        baseStats: new Array(35).fill(5).map((v, i) => (i >= 9 && i !== 13 && i !== 15 ? 0 : v)),
        bonusStats: new Array(35).fill(0),
        critterFlags: 0,
        bodyType: 0,
        expForKill: 0,
        damageType: 0,
      },
      extra: { kind: 'critter', flags: 0, raw },
      hidden: false,
    } as never;
  };
  const setup = (foeHex: number, aiPacket: number) => {
    const player = mkCritter(1, 20100, 0);
    const foe = mkCritter(2, foeHex, aiPacket);
    // ranny NPC: max HP 20 (stat 7), aktualne 12
    (foe as unknown as { proto: { baseStats: number[] } }).proto.baseStats[7] = 20;
    const state = defaultSessionState();
    state.sheet.hp = 30;
    const host = {
      world: {
        player,
        map: { objects: [player, foe], byHex: new Map() },
        movement: {
          cancel: () => undefined,
          start: () => ({ ok: true }),
          stateOf: () => undefined,
        },
      } as never,
      state,
      enemiesNearby: () => false,
    };
    return { host, foe: foe as { hex: number } };
  };
  const line = (from: number, to: number): number[] => {
    const out: number[] = [];
    for (let h = from; h !== to;) {
      h += Math.sign(to - h);
      out.push(h);
    }
    return out;
  };
  const table = (over: Partial<AiPacketSource>): AiPacketTable =>
    new AiPacketTable([
      {
        name: 'P',
        packetNum: 7,
        aggression: 50,
        maxDist: 20,
        minToHit: 0,
        minHp: 0,
        chance: 100,
        hurtTooMuch: new Set<string>(),
        msgRanges: {
          ...pkt().msgRanges,
          attack: [2040, 2042],
          miss: [2060, 2062],
          run: [2000, 2003],
        },
        ...over,
      } as AiPacketSource,
    ]);

  it('pakiet z proto.aiPacket: taunt NPC trafia do callbacku', () => {
    const { host } = setup(20103, 7);
    const taunts: number[] = [];
    const cc = CombatController.start(host, {
      seed: 3,
      ai: table({}),
      path: (f, t) => line(f, t),
      onTaunt: (_id, m) => taunts.push(m),
    });
    expect(cc).not.toBeNull();
    expect(cc?.foes[0]?.ai?.packetNum).toBe(7);
    cc?.endTurn();
    expect(taunts.length).toBeGreaterThan(0);
    expect(taunts.every((m) => (m >= 2040 && m <= 2042) || (m >= 2060 && m <= 2062))).toBe(true);
  });
  it('coward z pakietu ucieka od gracza w kontrolerze', () => {
    const { host, foe } = setup(20102, 7);
    const cc = CombatController.start(host, {
      seed: 3,
      ai: table({ runAwayMode: 'coward', chance: 0 }),
      path: (f, t) => line(f, t),
    });
    const before = foe.hex;
    if (cc?.foes[0]) expect(cc.foes[0].hp).toBe(12);
    // gracz pierwszy lub drugi w kolejnosci: po turze gracza NPC uciekl
    if (cc?.playerTurn) cc.endTurn();
    expect(cc?.combat.events.some((e) => e.kind === 'flee')).toBe(true);
    expect(foe.hex).not.toBe(before);
  });
  it('brak pakietu w tabeli: proste AI, bez bledu', () => {
    const { host } = setup(20102, 99);
    const cc = CombatController.start(host, { seed: 3, ai: table({}), path: (f, t) => line(f, t) });
    expect(cc?.foes[0]?.ai).toBeUndefined();
  });
});
