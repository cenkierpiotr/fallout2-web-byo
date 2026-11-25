import { describe, expect, it } from 'vitest';
import { CombatController, type CombatHost } from './combat-controller';
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

describe('walka z towarzyszami', () => {
  it('towarzysz z druzyny jest sojusznikiem (team gracza), nie wrogiem', () => {
    const { host, ally } = setup(105, 101);
    const c = CombatController.start(host, { seed: 1, path: line }) as CombatController;
    expect(c.allies.map((a) => a.id)).toEqual([ally.id]);
    expect(c.foes.some((f) => f.id === ally.id)).toBe(false);
    expect(c.foes.length).toBe(1);
    expect(c.allies[0]?.team).toBe(c.player.team);
  });
  it('bez wrogow walka sie nie zaczyna, mimo towarzysza', () => {
    const { host } = setup(105, 101);
    (host.world.map as unknown as { objects: unknown[] }).objects.pop();
    expect(CombatController.start(host, { seed: 1 })).toBeNull();
  });
  it('towarzysz atakuje wroga w swojej turze', () => {
    const { host, ally, foe } = setup(102, 101);
    const c = CombatController.start(host, { seed: 4, path: line }) as CombatController;
    for (let i = 0; i < 60 && !c.combat.ended; i++) c.endTurn();
    const hits = c.combat.events.filter(
      (e) => e.kind === 'attack' && (e as { attacker?: number }).attacker === ally.id,
    );
    const foeC = c.combat.all.find((x) => x.id === foe.id);
    expect(hits.length > 0 || (foeC?.hp ?? 1) <= 0).toBe(true);
  });
  it('smierc wroga konczy walke, towarzysz bez XP, XP tylko za wroga', () => {
    const { host, foe } = setup(102, 101);
    let xp = 0;
    const c = CombatController.start(host, {
      seed: 4,
      path: line,
      onKill: (x) => (xp += x),
    }) as CombatController;
    for (let i = 0; i < 100 && !c.combat.ended; i++) {
      if (c.combat.current.isPlayer) {
        if (!c.attack(foe.id)) c.endTurn();
      } else c.endTurn();
    }
    expect(c.combat.ended).toBe(true);
    if (c.combat.playerAlive) expect(xp).toBe(7);
  });
});
