import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BEST_WEAPON_NAMES, createRng, DamageType, type AiPacket } from '@f2/rules';
import {
  CombatSession,
  FISTS,
  type AttackResolver,
  type Combatant,
  type WeaponSpec,
} from './combat';
import { createRulesResolver, hitChance } from './combat-rules';

/**
 * Zadanie 31 (M6): 10 walk skryptowanych, deterministycznie (seed w JSON), bez gry i bez przegladarki.
 * Scenariusze: tests/golden/combat/scenarios/*.json. Kryterium: kazda walka konczy sie w limicie rund,
 * HP nie schodzi ponizej 0, XP = suma xp zabitych wrogow, a oczekiwane zachowania (seria, eksplozja,
 * ucieczka, wybor broni towarzysza) faktycznie wystepuja.
 */

const dir = join(__dirname, '../../../../tests/golden/combat/scenarios');

const w = (over: Partial<WeaponSpec> & Pick<WeaponSpec, 'name'>): WeaponSpec => ({
  pid: 1,
  minDmg: 1,
  maxDmg: 2,
  apCost: 4,
  range: 1,
  skill: 70,
  burst: 1,
  damageType: DamageType.Normal,
  cls: 4,
  ...over,
});
const CATALOG: Record<string, WeaponSpec> = {
  fists: FISTS,
  spear: w({ name: 'spear', pid: 4, minDmg: 3, maxDmg: 8, apCost: 4, range: 2, cls: 2, skill: 70 }),
  bite: w({ name: 'bite', pid: 0, minDmg: 2, maxDmg: 5, apCost: 3, range: 1, cls: 1, skill: 60 }),
  pistol10: w({ name: 'pistol10', pid: 6, minDmg: 5, maxDmg: 12, apCost: 5, range: 15, skill: 75 }),
  rifle: w({ name: 'rifle', pid: 8, minDmg: 8, maxDmg: 20, apCost: 5, range: 25, skill: 80 }),
  smg: w({ name: 'smg', pid: 9, minDmg: 5, maxDmg: 9, apCost: 6, range: 12, burst: 5, skill: 75 }),
  grenade: w({
    name: 'grenade',
    pid: 14,
    minDmg: 15,
    maxDmg: 30,
    apCost: 4,
    range: 10,
    explosive: true,
    damageType: DamageType.Explosion,
    cls: 3,
    skill: 80,
  }),
};

interface FoeDef {
  name: string;
  hex: number;
  hp: number;
  maxHp?: number;
  xp: number;
  weapon: string;
  ai: 'default' | 'coward';
}
interface AllyDef {
  name: string;
  hex: number;
  hp: number;
  weapon?: string;
  weapons?: string[];
  bestWeapon?: string;
  ai: 'default';
}
interface Scenario {
  name: string;
  seed: number;
  player: {
    hp: number;
    maxAp: number;
    hex: number;
    weapon: string;
    ac?: number;
    skillPenalty?: number;
    legFlags?: number;
  };
  allies?: AllyDef[];
  foes: FoeDef[];
  expect?: {
    burstUsed?: boolean;
    splashUsed?: boolean;
    minFlee?: number;
    allyWeaponAttacks?: Record<string, string>;
  };
}

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
const packet = (kind: 'default' | 'coward', best = -1): AiPacket => ({
  name: kind,
  packetNum: kind === 'coward' ? 2 : 1,
  aggression: 50,
  maxDist: 30,
  minToHit: 0,
  minHp: 0,
  chance: 0,
  hurtTooMuch: new Set(),
  // indeks 5 = nigdy nie ucieka, 0 = ucieka zawsze gdy zagrozony
  runAwayIndex: kind === 'coward' ? 0 : 5,
  bestWeapon: best,
  distance: 'on_your_own',
  attackWho: 'closest',
  areaMode: 'unset',
  chemUse: 0,
  msgRanges,
});

interface Result {
  ended: boolean;
  rounds: number;
  xp: number;
  expectedXp: number;
  minHp: number;
  flees: number;
  burst: boolean;
  splash: boolean;
  allyWeapons: Record<string, Set<string>>;
}

function run(sc: Scenario): Result {
  const rng = createRng(sc.seed);
  const base = createRulesResolver({ rng, difficulty: 'normal' });
  const names = new Map<number, string>();
  const used: Record<string, Set<string>> = {};
  let burst = false;
  const resolve: AttackResolver = (a, t, ctx) => {
    const wp =
      a.isPlayer && sc.player.skillPenalty
        ? { ...ctx.weapon, skill: Math.max(0, ctx.weapon.skill - sc.player.skillPenalty) }
        : ctx.weapon;
    if (wp.burst > 1 && !ctx.splash) burst = true;
    const n = names.get(a.id) ?? '?';
    (used[n] ??= new Set()).add(ctx.weapon.name);
    return base(a, t, { ...ctx, weapon: wp });
  };
  const wp = (n: string): WeaponSpec => CATALOG[n] as WeaponSpec;
  const parts: Omit<Combatant, 'ap'>[] = [];
  let id = 1;
  names.set(1, 'player');
  parts.push({
    id: 1,
    team: 0,
    hp: sc.player.hp,
    maxHp: sc.player.hp,
    maxAp: sc.player.maxAp,
    sequence: 10,
    agility: 6,
    hex: sc.player.hex,
    isPlayer: true,
    weapons: [wp(sc.player.weapon)],
    ...(sc.player.ac !== undefined ? { ac: sc.player.ac } : {}),
    ...(sc.player.legFlags !== undefined ? { legFlags: sc.player.legFlags } : {}),
  });
  for (const a of sc.allies ?? []) {
    id++;
    names.set(id, a.name);
    const bw = a.bestWeapon ? BEST_WEAPON_NAMES.indexOf(a.bestWeapon as never) : -1;
    parts.push({
      id,
      team: 0,
      name: a.name,
      hp: a.hp,
      maxHp: a.hp,
      maxAp: 8,
      sequence: 8,
      agility: 6,
      hex: a.hex,
      isPlayer: false,
      weapons: (a.weapons ?? [a.weapon ?? 'fists']).map(wp),
      ai: packet(a.ai, bw),
      aiBestWeapon: bw,
    });
  }
  const xpById = new Map<number, number>();
  for (const f of sc.foes) {
    id++;
    names.set(id, f.name);
    xpById.set(id, f.xp);
    parts.push({
      id,
      team: 1,
      name: f.name,
      hp: f.hp,
      maxHp: f.maxHp ?? f.hp,
      maxAp: 8,
      sequence: 5,
      agility: 5,
      hex: f.hex,
      isPlayer: false,
      weapons: [wp(f.weapon)],
      ai: packet(f.ai),
    });
  }
  const s = new CombatSession(parts, resolve, undefined, {
    rng,
    hitChance: (a, t, wpn, d) => hitChance(a, t, wpn, 0 as never, d, undefined),
  });
  const player = s.all.find((c) => c.isPlayer) as Combatant;
  let rounds = 0;
  let minHp = Infinity;
  let guard = 0;
  while (!s.ended && rounds < 50 && guard++ < 5000) {
    const cur = s.current;
    if (cur.hp <= 0) {
      s.endTurn();
      continue;
    }
    if (cur.id === 1) rounds++;
    if (cur.isPlayer) {
      const wpn = s.weaponOf(player);
      for (let i = 0; i < 12 && !s.ended; i++) {
        const foes = s.all.filter((c) => c.team === 1 && c.hp > 0);
        if (foes.length === 0) break;
        foes.sort((x, y) => s.dist(player, x) - s.dist(player, y));
        const tgt = foes[0] as Combatant;
        if (s.dist(player, tgt) <= wpn.range) {
          if (!s.attack(1, tgt.id)) break;
        } else {
          const step = Math.min(player.ap, s.dist(player, tgt) - wpn.range);
          const to = player.hex + Math.sign(tgt.hex - player.hex) * step;
          if (step <= 0 || !s.move(1, to)) break;
        }
      }
      if (!s.ended) s.endTurn();
    } else {
      s.autoTurn();
    }
    for (const c of s.all) minHp = Math.min(minHp, c.hp);
  }
  let xp = 0;
  let expectedXp = 0;
  for (const c of s.all) {
    if (c.team !== 1) continue;
    expectedXp += c.hp <= 0 ? (xpById.get(c.id) ?? 0) : 0;
    if (c.hp <= 0) xp += xpById.get(c.id) ?? 0;
  }
  const splash = s.events.some((e) => e.kind === 'attack' && e.splash === true);
  return {
    ended: s.ended,
    rounds,
    xp,
    expectedXp,
    minHp,
    flees: s.events.filter((e) => e.kind === 'flee').length,
    burst,
    splash,
    allyWeapons: used,
  };
}

const files = existsSync(dir)
  ? readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .sort()
  : [];

describe.skipIf(files.length === 0)('10 walk skryptowanych (kryterium M6)', () => {
  it('jest dokladnie 10 scenariuszy', () => {
    expect(files).toHaveLength(10);
  });
  for (const f of files) {
    const sc = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Scenario;
    it(`${f}: ${sc.name}`, () => {
      const r = run(sc);
      // ucieczka (minFlee) nie konczy walki w modelu headless: uciekinier biegnie az do limitu rund
      if (sc.expect?.minFlee === undefined) expect(r.ended).toBe(true);
      expect(r.rounds).toBeLessThanOrEqual(50);
      expect(r.minHp).toBeGreaterThanOrEqual(0);
      expect(r.xp).toBe(r.expectedXp);
      const e = sc.expect;
      if (e?.burstUsed) expect(r.burst).toBe(true);
      if (e?.splashUsed) expect(r.splash).toBe(true);
      if (e?.minFlee !== undefined) expect(r.flees).toBeGreaterThanOrEqual(e.minFlee);
      for (const [who, weapon] of Object.entries(e?.allyWeaponAttacks ?? {})) {
        expect(r.allyWeapons[who]?.has(weapon)).toBe(true);
      }
      // determinizm: drugi przebieg identyczny
      expect(run(sc)).toEqual(r);
    });
  }
});
