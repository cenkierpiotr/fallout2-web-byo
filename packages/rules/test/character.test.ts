import { describe, expect, it } from 'vitest';
import {
  CHARACTER_SPECIAL_TOTAL,
  characterPointsRemaining,
  createCharacter,
  defaultRulesContext,
  skillIsTagged,
  statLevel,
  Stat,
} from '../src/index.js';

const ctx = defaultRulesContext();
const narg = {
  name: 'Narg',
  age: 21,
  gender: 0 as const,
  baseStats: [8, 5, 9, 3, 4, 7, 4],
  tags: [4, 0, 5, -1],
  traits: [6, 15],
};

describe('character', () => {
  it('hp ustawione na maxHP, SPECIAL i tagi z opcji', () => {
    const r = createCharacter(narg, ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const c = r.character;
    expect(c.isPlayer).toBe(true);
    expect(c.curHP).toBe(statLevel(c, Stat.MaxHitPoints, ctx));
    expect(c.curHP).toBe(44);
    expect(c.baseStats[Stat.Age]).toBe(21);
    expect(skillIsTagged(c, 4)).toBe(true);
    expect(c.level).toBe(1);
    expect(c.skillRaw).toHaveLength(18);
  });
  it('pula punktow: premade 0, nowa postac 5, rozdysponowane ponad 40 odrzucone', () => {
    expect(characterPointsRemaining(narg.baseStats)).toBe(0);
    expect(characterPointsRemaining([5, 5, 5, 5, 5, 5, 5])).toBe(CHARACTER_SPECIAL_TOTAL - 35);
    const r = createCharacter({ ...narg, baseStats: [10, 10, 10, 10, 10, 10, 10] }, ctx);
    expect(r).toEqual({ ok: false, reason: 'points-exceeded' });
  });
  it('odrzuca bledne wejscie', () => {
    expect(createCharacter({ ...narg, baseStats: [11, 5, 5, 5, 5, 5, 4] }, ctx)).toEqual({
      ok: false,
      reason: 'stat-out-of-range',
    });
    expect(createCharacter({ ...narg, tags: [1, 2, 3, 4] }, ctx)).toEqual({
      ok: false,
      reason: 'tag-limit',
    });
    expect(createCharacter({ ...narg, traits: [6, 6] }, ctx)).toEqual({
      ok: false,
      reason: 'trait-duplicate',
    });
  });
  it('premade stealth i diplomat dostaja HP z oryginalu (28, 27)', () => {
    const mingan = createCharacter(
      {
        name: 'Mingan',
        age: 32,
        gender: 0,
        baseStats: [5, 8, 4, 4, 5, 9, 5],
        tags: [8, 9, 10, -1],
        traits: [14, 2],
      },
      ctx,
    );
    const chitsa = createCharacter(
      {
        name: 'Chitsa',
        age: 19,
        gender: 1,
        baseStats: [4, 5, 4, 10, 7, 6, 4],
        tags: [14, 15, 6, -1],
        traits: [3, 13],
      },
      ctx,
    );
    expect(mingan.ok && mingan.character.curHP).toBe(28);
    expect(chitsa.ok && chitsa.character.curHP).toBe(27);
  });
});
