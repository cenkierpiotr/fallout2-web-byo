import { describe, expect, it, vi } from 'vitest';
import { BodyPart } from '@f2/rules';
import { CombatController, type CombatHost } from './combat-controller';
import { defaultSessionState } from './save-world';

let nid = 100;
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
  raw[2] = 6;
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
      expForKill: 0,
      damageType: 0,
    },
    extra: { kind: 'critter', flags: 0, raw },
    hidden: false,
    ...over,
  } as never;
}

function host(foeHexes: number[]): { host: CombatHost; foes: ReturnType<typeof critter>[] } {
  const player = critter(100, { id: 1 });
  const foes = foeHexes.map((h) => critter(h));
  const objects = [player, ...foes] as { id: number; hex: number }[];
  const state = defaultSessionState();
  state.sheet.hp = 30;
  const h: CombatHost = {
    world: {
      player,
      map: { objects, byHex: new Map() },
      movement: { cancel: () => undefined, start: () => ({ ok: true }), stateOf: () => undefined },
    } as never,
    state,
    enemiesNearby: () => false,
  };
  return { host: h, foes };
}

describe('CombatController', () => {
  it('terminate_combat (0x8153) konczy walke i czysci hook', () => {
    const { host: h } = host([101]);
    const w = h.world as unknown as { scripts: { onTerminateCombat?: (id: number) => void } };
    w.scripts = { inventory: { partyObjects: () => [] } } as never;
    const c = CombatController.start(h, { seed: 1 }) as CombatController;
    expect(typeof w.scripts.onTerminateCombat).toBe('function');
    w.scripts.onTerminateCombat?.(-1);
    expect(c.combat.ended).toBe(true);
    expect(h.enemiesNearby()).toBe(false);
    expect(w.scripts.onTerminateCombat).toBeUndefined();
  });
  it('terminate_combat zglasza koniec walki przez onChange (host UI domyka stan)', () => {
    const { host: h } = host([101]);
    const w = h.world as unknown as { scripts: { onTerminateCombat?: (id: number) => void } };
    w.scripts = { inventory: { partyObjects: () => [] } } as never;
    const seen: boolean[] = [];
    const ref: { c?: CombatController } = {};
    ref.c = CombatController.start(h, {
      seed: 1,
      onChange: () => seen.push(ref.c?.ended ?? false),
    }) as CombatController;
    seen.length = 0;
    w.scripts.onTerminateCombat?.(-1);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]).toBe(true);
  });
  it('start: brak wrogow w poblizu zwraca null', () => {
    expect(CombatController.start(host([]).host, { seed: 1 })).toBeNull();
  });
  it('start: buduje uczestnikow z proto (HP z mapy, druzyna) i ustawia enemiesNearby', () => {
    const { host: h } = host([101]);
    const c = CombatController.start(h, { seed: 1 }) as CombatController;
    expect(c).not.toBeNull();
    const foe = c.combat.all.find((x) => !x.isPlayer);
    expect(foe?.hp).toBe(12);
    expect(foe?.team).toBe(1);
    expect(h.enemiesNearby()).toBe(true);
    expect(c.combat.all.find((x) => x.isPlayer)?.hp).toBe(30);
  });
  it('start: gracz dostaje traity i perki z arkusza (Fast Shot, Bonus Rate of Fire), NPC nie', () => {
    const { host: h } = host([101]);
    h.state.sheet.traits = [7, -1];
    h.state.sheet.perks = { '5': 1 };
    const c = CombatController.start(h, { seed: 1 }) as CombatController;
    const me = c.combat.all.find((x) => x.isPlayer);
    expect(me?.traits).toEqual([7, -1]);
    expect(me?.perks).toEqual({ 5: 1 });
    expect(c.combat.all.find((x) => !x.isPlayer)?.perks).toBeUndefined();
  });
  it('Fast Shot: z bronia dystansowa celowanie wylaczone (szansa = Uncalled, aim zerowany po ataku), piescia dozwolone', () => {
    const { host: h, foes } = host([103]);
    h.state.sheet.traits = [7, -1];
    const c = CombatController.start(h, { seed: 1 }) as CombatController;
    const id = (foes[0] as unknown as { id: number }).id;
    expect(c.canAim()).toBe(true); // piesci
    const me = c.combat.all.find((x) => x.isPlayer) as unknown as { weapons?: unknown[] };
    me.weapons = [
      {
        name: 'rifle',
        pid: 8,
        minDmg: 5,
        maxDmg: 5,
        apCost: 5,
        range: 10,
        skill: 90,
        burst: 1,
        damageType: 0,
        cls: 4,
      },
    ];
    expect(c.canAim()).toBe(false);
    expect(c.chance(id, BodyPart.Head)).toBe(c.chance(id, BodyPart.Uncalled));
    c.aim = BodyPart.Head;
    c.attack(id);
    const ev = c.combat.events.find((e) => e.kind === 'attack') as { part: BodyPart } | undefined;
    expect(ev?.part).toBe(BodyPart.Uncalled);
  });
  it('szansa trafienia zalezy od celowanej czesci ciala', () => {
    const { host: h, foes } = host([101]);
    const c = CombatController.start(h, { seed: 1 }) as CombatController;
    const id = (foes[0] as unknown as { id: number }).id;
    const torso = c.chance(id, BodyPart.Torso);
    const head = c.chance(id, BodyPart.Head);
    expect(head).toBeLessThan(torso);
  });
  it('atak gracza + koniec tury: walka dobiega konca, HP wraca do arkusza, wrog znika', () => {
    const { host: h, foes } = host([101]);
    const c = CombatController.start(h, { seed: 3, path: line }) as CombatController;
    const id = (foes[0] as unknown as { id: number }).id;
    for (let i = 0; i < 80 && !c.combat.ended; i++) {
      if (c.combat.current.isPlayer) {
        if (!c.attack(id)) c.endTurn();
      } else c.endTurn();
    }
    expect(c.combat.ended).toBe(true);
    expect(h.enemiesNearby()).toBe(false);
    const me = c.combat.all.find((x) => x.isPlayer);
    expect(h.state.sheet.hp).toBe(me?.hp);
    if (c.combat.playerAlive) {
      const o = foes[0] as unknown as {
        hidden: boolean;
        fid: number;
        frame: number;
        flags: number;
      };
      expect(o.hidden).toBe(false);
      expect((o.fid >>> 16) & 0xff).toBeGreaterThanOrEqual(0x14);
      expect(o.fid >>> 24).toBe(1);
      expect(o.frame).toBe(255);
      expect(o.flags & 0x10).toBe(0x10);
    }
  });
  it('attack poza zasiegiem podchodzi (ruch przez movement.start) zamiast odmawiac', () => {
    const { host: h, foes } = host([110]);
    const c = CombatController.start(h, { seed: 1, path: line }) as CombatController;
    // w testach brak prawdziwej mapy: sciezka prosta po heksach
    const id = (foes[0] as unknown as { id: number }).id;
    while (!c.combat.current.isPlayer) c.endTurn();
    const before = c.combat.current.hex;
    c.attack(id);
    expect(c.combat.all.find((x) => x.isPlayer)?.hex).not.toBe(before);
  });
  it('onEvent dostaje kazde nowe zdarzenie walki (atak) dokladnie raz', () => {
    const { host: h, foes } = host([101]);
    const kinds: string[] = [];
    const c = CombatController.start(h, {
      seed: 3,
      path: line,
      onEvent: (e) => kinds.push(e.kind),
    }) as CombatController;
    const id = (foes[0] as unknown as { id: number }).id;
    while (!c.combat.current.isPlayer) c.endTurn();
    c.attack(id);
    expect(kinds.filter((k) => k === 'attack').length).toBe(
      c.combat.events.filter((e) => e.kind === 'attack').length,
    );
    expect(kinds.filter((k) => k === 'attack').length).toBeGreaterThan(0);
  });
  it('trafienie broni podaje jej damageType do applyHit celu (damage_p_proc, metarule 49)', () => {
    let hits = 0;
    for (let seed = 1; seed <= 40 && hits === 0; seed++) {
      const { host: h, foes } = host([101]);
      const applyHit = vi.fn(() => ({ ran: true, overridden: false, error: false }));
      (h.world as unknown as { scripts: unknown }).scripts = {
        applyHit,
        inventory: { partyObjects: () => [] },
      };
      const c = CombatController.start(h, { seed }) as CombatController;
      const id = (foes[0] as unknown as { id: number }).id;
      const me = c.combat.all.find((x) => x.isPlayer) as unknown as { weapons?: unknown[] };
      me.weapons = [
        {
          name: 'dynamite',
          pid: 8,
          minDmg: 1,
          maxDmg: 2,
          apCost: 2,
          range: 10,
          skill: 300,
          burst: 1,
          damageType: 6,
          cls: 4,
        },
      ];
      c.attack(id);
      const ev = c.combat.events.filter((e) => e.kind === 'attack' && e.hit);
      expect(applyHit).toHaveBeenCalledTimes(ev.length);
      if (ev.length > 0) {
        expect(applyHit).toHaveBeenCalledWith(id, 1, 6);
        hits++;
      }
    }
    expect(hits).toBe(1);
  });
  it('pudlo nie wola applyHit', () => {
    const { host: h, foes } = host([101]);
    const applyHit = vi.fn();
    (h.world as unknown as { scripts: unknown }).scripts = {
      applyHit,
      inventory: { partyObjects: () => [] },
    };
    const c = CombatController.start(h, { seed: 1 }) as CombatController;
    const me = c.combat.all.find((x) => x.isPlayer) as unknown as { weapons?: unknown[] };
    me.weapons = [
      {
        name: 'x',
        pid: 8,
        minDmg: 1,
        maxDmg: 2,
        apCost: 2,
        range: 10,
        skill: 0,
        burst: 1,
        damageType: 6,
        cls: 4,
      },
    ];
    c.attack((foes[0] as unknown as { id: number }).id);
    const hit = c.combat.events.some((e) => e.kind === 'attack' && e.hit);
    expect(applyHit).toHaveBeenCalledTimes(hit ? 1 : 0);
  });
  it('drugi tryb ataku: toggleMode tylko dla broni z drugim trybem, koszt z apCost2, zapis/odczyt trybu', () => {
    const { host: h } = host([103]);
    const c = CombatController.start(h, { seed: 1 }) as CombatController;
    expect(c.canSecondary()).toBe(false);
    c.toggleMode();
    expect(c.mode).toBe(0);
    const me = c.combat.all.find((x) => x.isPlayer) as unknown as { weapons?: unknown[] };
    me.weapons = [
      {
        name: 'smg',
        pid: 8,
        minDmg: 1,
        maxDmg: 2,
        apCost: 4,
        apCost2: 6,
        range: 10,
        skill: 100,
        burst: 1,
        damageType: 0,
        cls: 4,
        secondary: { range: 8, burst: 5, cls: 4 },
      },
    ];
    expect(c.canSecondary()).toBe(true);
    const c0 = c.attackCost();
    c.toggleMode();
    expect(c.mode).toBe(1);
    expect(c.attackCost()).toBe(6);
    expect(c0).toBe(4);
    expect(c.snapshot()?.mode).toBe(1);
    c.toggleMode();
    expect(c.mode).toBe(0);
    expect(c.snapshot()?.mode).toBeUndefined();
  });
});
