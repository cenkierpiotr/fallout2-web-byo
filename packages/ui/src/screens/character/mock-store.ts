import { signal, type Signal } from '@preact/signals';
import { tierCost } from './draft';
import type {
  CharacterCommands,
  PerkOptionView,
  PlayerView,
  CharacterResult,
  SkillView,
  StatView,
} from './types';

/** Kolejnosc: SPECIAL + reszta statow nie jest potrzebna panelowi; mock daje 38 wpisow. */
function mkStat(base: number, bonus = 0, sources: StatView['sources'] = []): StatView {
  return { base, bonus, level: base + bonus, sources };
}

const COST_TIERS = [
  { upTo: 100, cost: 1 },
  { upTo: 125, cost: 2 },
  { upTo: 150, cost: 3 },
  { upTo: 175, cost: 4 },
  { upTo: 200, cost: 5 },
  { upTo: 299, cost: 6 },
];

const PERKS: PerkOptionView[] = [
  {
    id: 1,
    name: 'Szybki refleks',
    description: '+2 PA w walce.',
    rank: 0,
    maxRank: 1,
    available: true,
    unmet: [],
  },
  {
    id: 2,
    name: 'Zimna krew',
    description: 'Odpornosc na strach.',
    rank: 0,
    maxRank: 2,
    available: true,
    unmet: [],
  },
  {
    id: 3,
    name: 'Mistrz medycyny',
    description: 'Lepsze leczenie.',
    rank: 0,
    maxRank: 1,
    available: false,
    unmet: ['IN<6', 'skill:Doctor<75', 'level<12'],
  },
];

export function createMockPlayer(overrides: Partial<PlayerView> = {}): PlayerView {
  const stats: StatView[] = Array.from({ length: 38 }, () => mkStat(0));
  const special = [6, 7, 5, 4, 8, 7, 5];
  special.forEach((v, i) => {
    stats[i] = mkStat(v);
  });
  stats[0] = mkStat(6, 1, [{ kind: 'item', name: 'Wzmacniacz Sily', amount: 1 }]);
  stats[5] = mkStat(7, 0);
  const skills: SkillView[] = Array.from({ length: 18 }, (_, i) => ({
    level: 20 + i * 3,
    tagged: i === 0 || i === 9,
    cost: 1,
    gain: i === 0 || i === 9 ? 2 : 1,
  }));
  return {
    name: 'Wybraniec',
    level: 3,
    exp: 3400,
    expNext: 6000,
    hp: 40,
    hpMax: 48,
    ap: 8,
    apMax: 8,
    stats,
    skills,
    skillCostTiers: COST_TIERS,
    skillMax: 300,
    traits: [
      { id: 0, name: 'Szybki metabolizm', description: 'Szybsze leczenie, nizsza odpornosc.' },
      { id: 4, name: 'Finezja', description: 'Wieksza szansa na krytyk.' },
    ],
    perks: [
      { id: 9, name: 'Czujnosc', description: 'Widzisz statystyki wroga.', rank: 1, maxRank: 1 },
    ],
    availablePerks: PERKS,
    karma: 120,
    karmaTitle: 'Obronca',
    skillPoints: 7,
    unspentPerks: 1,
    kills: 0,
    levelUpPending: false,
    ...overrides,
  };
}

export interface MockCharacterStore {
  view: { player: Signal<PlayerView> };
  commands: CharacterCommands;
  /** Wywolania `spendSkill` w kolejnosci (do asercji w testach). */
  calls: Array<[number, 1 | -1]>;
}

/** Magazyn do playground/e2e: odzwierciedla zachowanie przyszlego adaptera `GameCommands.character`. */
export function createMockCharacterStore(
  initial: PlayerView = createMockPlayer(),
): MockCharacterStore {
  const player = signal<PlayerView>(initial);
  const calls: Array<[number, 1 | -1]> = [];
  const commands: CharacterCommands = {
    spendSkill(skill, delta): CharacterResult {
      calls.push([skill, delta]);
      const p = player.value;
      const sk = p.skills[skill];
      if (!sk) return { ok: false, reason: 'skill-invalid' };
      if (delta < 0) return { ok: false, reason: 'skill-no-points' };
      const cost = tierCost(p.skillCostTiers, sk.level);
      if (sk.level >= p.skillMax || p.skillPoints < cost)
        return { ok: false, reason: 'no-skill-points' };
      const skills = p.skills.slice();
      const nextLevel = Math.min(p.skillMax, sk.level + sk.gain);
      skills[skill] = { ...sk, level: nextLevel, cost: tierCost(p.skillCostTiers, nextLevel) };
      player.value = { ...p, skills, skillPoints: p.skillPoints - cost };
      return { ok: true };
    },
    choosePerk(perk): CharacterResult {
      const p = player.value;
      const opt = p.availablePerks.find((o) => o.id === perk);
      if (!opt || !opt.available || p.unspentPerks <= 0)
        return { ok: false, reason: 'perk-unavailable' };
      const rank = opt.rank + 1;
      player.value = {
        ...p,
        unspentPerks: p.unspentPerks - 1,
        perks: [
          ...p.perks,
          { id: opt.id, name: opt.name, description: opt.description, rank, maxRank: opt.maxRank },
        ],
        availablePerks: p.availablePerks.filter((o) => o.id !== perk),
      };
      return { ok: true };
    },
    confirmLevelUp(): CharacterResult {
      const p = player.value;
      if (!p.levelUpPending) return { ok: false, reason: 'no-levelup' };
      player.value = { ...p, levelUpPending: false };
      return { ok: true };
    },
  };
  return { view: { player }, commands, calls };
}
