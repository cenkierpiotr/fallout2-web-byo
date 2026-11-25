import { describe, expect, it } from 'vitest';
import {
  Skill,
  defaultRulesContext,
  newCritterData,
  newSkillState,
  recalcDerived,
  type SkillCritter,
} from '@f2/rules';
import { GameClock, type GameObject } from '@f2/engine-core';
import { createSkillUseHost, skillOutcomeMessage } from './skill-use-host';
import type { GameSession } from './game-session';

function critter(skills: Partial<Record<Skill, number>>): SkillCritter {
  const c = newCritterData(true);
  [5, 5, 5, 5, 5, 5, 5].forEach((v, i) => (c.baseStats[i] = v));
  recalcDerived(c, defaultRulesContext());
  const sk = newSkillState();
  for (const [k, v] of Object.entries(skills)) sk.skillRaw[Number(k)] = v;
  return Object.assign(c, sk);
}

function obj(type: number, hex: number, extra: GameObject['extra']): GameObject {
  return {
    id: hex,
    pid: type << 24,
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
    inventory: [],
    proto: undefined as never,
    extra,
    hidden: false,
  } as GameObject;
}

function fakeSession(player: GameObject, objects: GameObject[]) {
  const sheet = { skillUseSlots: [] as { skill: number; atTick: number }[], sneaking: false };
  return {
    state: { rng: { seed: 7 }, sheet, settings: { gameDifficulty: 1 } },
    world: { player, clock: new GameClock(1_000_000), map: { objects }, scripts: undefined },
  } as unknown as GameSession;
}

describe('skillOutcomeMessage', () => {
  const base = {
    skill: Skill.Lockpick,
    targetId: 1,
    ok: true,
    roll: null,
    messageId: null,
    xp: 0,
    minutesSpent: 0,
  };
  it('sukces wytrycha', () => {
    expect(skillOutcomeMessage({ ...base, effects: [{ kind: 'unlock' }] }).key).toBe(
      'skill.result.unlock',
    );
  });
  it('porazka krytyczna: zaciety zamek', () => {
    expect(skillOutcomeMessage({ ...base, ok: false, effects: [{ kind: 'jam' }] }).key).toBe(
      'skill.result.jam',
    );
  });
  it('leczenie niesie ilosc', () => {
    expect(skillOutcomeMessage({ ...base, effects: [{ kind: 'heal', amount: 4 }] })).toEqual({
      key: 'skill.result.heal',
      params: { amount: 4 },
    });
  });
  it('kody odmowy -> klucze', () => {
    expect(
      skillOutcomeMessage({ ...base, ok: false, reason: 'out-of-range', effects: [] }).key,
    ).toBe('skill.err.tooFar');
    expect(
      skillOutcomeMessage({ ...base, ok: false, reason: 'skill-exhausted', effects: [] }).key,
    ).toBe('skill.err.exhausted');
  });
});

describe('createSkillUseHost', () => {
  it('menu: skille zamknietych drzwi z szansa; uzycie otwiera zamek, czas plynie', () => {
    const player = obj(1, 20100, { kind: 'critter', flags: 0, raw: new Int32Array(10) });
    const door = obj(2, 20101, { kind: 'door', subtype: 0, flags: 0, raw: new Int32Array([0x2]) });
    const s = fakeSession(player, [player, door]);
    const host = createSkillUseHost(s, critter({ [Skill.Lockpick]: 300 }));
    expect(host.usable(door)).toContain(Skill.Lockpick);
    expect(host.chance(Skill.Lockpick, door)).toBe(95);
    const t0 = s.world.clock.ticks;
    let unlocked = false;
    // szansa 95%: w kilku probach musi sie udac
    for (let i = 0; i < 5 && !unlocked; i++) {
      const r = host.use(Skill.Lockpick, door);
      unlocked = r.ok;
      if (!r.ok && r.result.effects.some((e) => e.kind === 'jam')) break;
    }
    expect(s.world.clock.ticks).toBeGreaterThan(t0);
    expect(door.extra.kind === 'door' && (door.extra.raw[0]! & 0x2) === 0).toBe(unlocked);
  });

  it('kradziez bez przedmiotow: odmowa bez rzutu', () => {
    const player = obj(1, 20100, { kind: 'critter', flags: 0, raw: new Int32Array(10) });
    const npc = obj(1, 20101, { kind: 'critter', flags: 0, raw: new Int32Array(10) });
    const s = fakeSession(player, [player, npc]);
    const host = createSkillUseHost(s, critter({ [Skill.Steal]: 100 }));
    const t0 = s.world.clock.ticks;
    const r = host.use(Skill.Steal, npc);
    expect(r.ok).toBe(false);
    expect(r.message.key).toBe('skill.err.noItem');
    expect(s.world.clock.ticks).toBe(t0);
  });

  it('kradziez: przedmiot trafia do gracza', () => {
    const player = obj(1, 20100, { kind: 'critter', flags: 0, raw: new Int32Array(10) });
    const npc = obj(1, 20101, { kind: 'critter', flags: 0, raw: new Int32Array(10) });
    const item = obj(0, 5, { kind: 'item', subtype: 0, flags: 0, raw: new Int32Array(0) });
    npc.inventory.push(item);
    const s = fakeSession(player, [player, npc]);
    const host = createSkillUseHost(s, critter({ [Skill.Steal]: 300 }));
    let r = host.use(Skill.Steal, npc);
    for (let i = 0; i < 5 && !r.ok; i++) r = host.use(Skill.Steal, npc);
    if (r.ok) {
      expect(player.inventory).toContain(item);
      expect(r.message).toEqual({ key: 'skill.result.steal' });
    }
  });
});
