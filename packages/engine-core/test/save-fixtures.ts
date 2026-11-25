import { EventQueue, GameClock } from '../src/index.js';
import type { SaveItem, SaveWorld } from '../src/save/schema.js';

/** Maly deterministyczny PRNG (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KINDS = ['drug-revert', 'withdrawal', 'script-timer', 'poison', 'map-update'] as const;

export function arbitraryWorld(seed: number): SaveWorld {
  const r = rng(seed);
  const int = (n: number): number => Math.floor(r() * n);
  const item = (depth: number): SaveItem => ({
    pid: int(500),
    count: 1 + int(20),
    equippedSlot: r() < 0.2 ? (['left', 'right', 'armor'] as const)[int(3)]! : null,
    ammo: r() < 0.3 ? int(30) : null,
    ammoPid: r() < 0.3 ? 30 + int(20) : null,
    contents: depth < 3 && r() < 0.3 ? Array.from({ length: int(3) }, () => item(depth + 1)) : [],
  });
  const queue = new EventQueue();
  for (let i = 0, n = int(21); i < n; i++) {
    const kind = KINDS[int(KINDS.length)]!;
    const atTick = int(100000);
    const objId = int(1000);
    const payload =
      kind === 'drug-revert' || kind === 'withdrawal'
        ? {
            seq: i + 1,
            targetId: objId,
            atTick,
            kind: kind === 'drug-revert' ? 'drug-stage' : 'withdrawal',
            deltas: [{ stat: int(7), amount: int(5) - 2 }],
            drugPid: int(500),
            useId: i + 1,
            addictionIndex: int(3),
            withdrawalEffect: int(3),
          }
        : { v: int(9), s: 'x' };
    queue.add({ atTick, kind, objId, payload });
  }
  const gvars: Record<string, number> = {};
  for (let i = 0, n = int(10); i < n; i++) gvars[`g${i}`] = int(2000) - 1000;
  return {
    clock: new GameClock(int(10_000_000)),
    queue,
    rng: { seed: int(2 ** 31) },
    globals: gvars,
    player: {
      objId: 1,
      hex: int(40000),
      elevation: int(3),
      orientation: int(6),
      flags: int(256),
      inventory: Array.from({ length: int(51) }, () => item(0)),
      hp: int(300),
      radiation: int(1000),
      poison: int(100),
      baseStats: Array.from({ length: 35 }, () => int(10)),
      statBonuses: Array.from({ length: 35 }, () => int(5)),
      skills: Array.from({ length: 18 }, () => int(200)),
      taggedSkills: [int(18), int(18)],
      skillUseSlots: Array.from({ length: int(4) }, () => ({
        skill: int(18),
        atTick: int(100000),
      })),
      perks: { [`p${int(5)}`]: 1 + int(3) },
      traits: [int(16), int(16)],
      kills: Array.from({ length: 19 }, () => int(50)),
      progress: {
        level: 1 + int(20),
        xp: int(100000),
        freeSkillPoints: int(10),
        reputation: int(100),
        karma: int(2000) - 1000,
        perkPending: seed % 2 === 1,
      },
      sneaking: r() < 0.5,
    },
    currentMap: { name: `map${int(3)}`, elevation: int(3) },
    maps: Array.from({ length: 1 + int(3) }, (_, m) => ({
      name: `map${m}`,
      lastVisitTick: int(1_000_000),
      mapVars: Array.from({ length: int(8) }, () => int(100)),
      scriptLocals: { [`s${int(5)}`]: Array.from({ length: int(4) }, () => int(50)) },
      elevations: Array.from({ length: 1 + int(3) }, () => ({
        objects: Array.from(
          { length: int(51) },
          (): SaveWorld['maps'][number]['elevations'][number]['objects'][number] => ({
            objId: int(100000),
            pid: int(500),
            hex: int(40000),
            orientation: int(6),
            flags: int(1000),
            hp: int(200),
            scriptLocalId: r() < 0.5 ? int(10) : null,
            inventory: Array.from({ length: int(4) }, () => item(1)),
          }),
        ),
      })),
    })),
    settings: { gameDifficulty: int(3), combatDifficulty: int(3), violence: int(4) },
    scriptTimers: { [`t${int(3)}`]: int(1000) },
    modData: { sfall: { x: [1, 2, { y: 'z' }] } },
    movieFlags: Array.from({ length: 17 }, () => int(2)),
    gameEnded: int(2) === 1,
    radiationFlag: int(2) === 1,
  };
}
