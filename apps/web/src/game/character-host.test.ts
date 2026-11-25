import { describe, expect, it } from 'vitest';
import { defaultSessionState } from './save-world';
import { createSheetCritter } from './sheet-critter';
import { createCharacterHost } from './character-host';
import type { GameSession } from './game-session';

function fakeSession(): GameSession {
  const state = defaultSessionState();
  state.sheet.skills[6] = 20;
  state.sheet.hp = 10;
  return {
    state,
    world: { clock: { ticks: 1_000_000 } },
    eventHandlers: [],
  } as unknown as GameSession;
}

const texts = {
  perk: (i: number) => ({ name: `P${i}`, description: '' }),
  trait: (i: number) => ({ name: `T${i}`, description: '' }),
};
const mk = (s = fakeSession()) => ({
  s,
  host: createCharacterHost(s, { name: () => 'Test', texts, locale: () => 'pl' }),
});

describe('sheet-critter', () => {
  it('czyta i zapisuje arkusz, takze po jego podmianie', () => {
    const s = fakeSession();
    const c = createSheetCritter(() => s.state.sheet);
    c.curHP = 5;
    expect(s.state.sheet.hp).toBe(5);
    s.state.sheet = { ...s.state.sheet, hp: 33, taggedSkills: [4] };
    expect(c.curHP).toBe(33);
    expect(c.tags[0]).toBe(4);
    c.tags[1] = 9;
    expect(s.state.sheet.taggedSkills).toEqual([4, 9]);
  });
});

describe('character host', () => {
  it('wydawanie punktow skilli zapisuje sie w arkuszu', () => {
    const { s, host } = mk();
    s.state.sheet.progress.freeSkillPoints = 5;
    const before = s.state.sheet.skills[0] ?? 0;
    expect(host.commands.spendSkill(0, 1).ok).toBe(true);
    expect(s.state.sheet.skills[0]).toBe(before + 1);
    expect(s.state.sheet.progress.freeSkillPoints).toBeLessThan(5);
    expect(host.view.value.skills[0]?.level).toBeGreaterThan(0);
  });

  it('bez punktow skill nie rosnie', () => {
    const { host } = mk();
    expect(host.commands.spendSkill(0, 1).ok).toBe(false);
  });

  it('XP za zabicie: awans, punkty skilli i licznik zabojstw', () => {
    const { s, host } = mk();
    host.awardKill(1000, 2);
    const p = s.state.sheet.progress;
    expect(p.xp).toBe(1000);
    expect(p.level).toBeGreaterThan(1);
    expect(p.freeSkillPoints).toBeGreaterThan(0);
    expect(s.state.sheet.kills[2]).toBe(1);
    expect(host.view.value.levelUpPending).toBe(true);
    expect(host.view.value.kills).toBe(1);
    expect(host.commands.confirmLevelUp().ok).toBe(true);
    expect(host.view.value.levelUpPending).toBe(false);
  });

  it('perk na poziomie 3, a Tag! wymaga czwartej umiejetnosci', () => {
    const { s, host } = mk();
    s.state.sheet.baseStats[0] = 5;
    host.awardKill(120_000, 0);
    const v = host.view.value;
    expect(v.unspentPerks).toBe(1);
    expect(host.commands.choosePerk(51).ok).toBe(true);
    expect(host.view.value.tagPending).toBe(true);
    expect(host.commands.confirmLevelUp().ok).toBe(false);
    s.state.sheet.taggedSkills = [0, 1, 2];
    expect(host.commands.tagSkill?.(5).ok).toBe(true);
    expect(s.state.sheet.taggedSkills).toEqual([0, 1, 2, 5]);
    expect(host.view.value.tagPending).toBe(false);
    expect(host.commands.confirmLevelUp().ok).toBe(true);
  });

  it('Pierwsza pomoc leczy, zuzywa czas i ogranicza liczbe uzyc', () => {
    const { s, host } = mk();
    s.state.sheet.skills[6] = 100; // pewny sukces
    s.state.sheet.baseStats[7] = 40; // MaxHP
    const t0 = s.world.clock.ticks;
    let r = host.commands.useSkill?.(6);
    if (!r?.ok) r = host.commands.useSkill?.(6); // 5% szansy porazki z limitu szansy
    expect(r, JSON.stringify(r)).toMatchObject({ ok: true });
    expect(s.state.sheet.hp).toBeGreaterThan(10);
    expect(s.world.clock.ticks).toBeGreaterThan(t0);
    expect(s.state.sheet.skillUseSlots.length).toBeGreaterThan(0);
  });

  it('Skradanie przelacza stan', () => {
    const { s, host } = mk();
    s.state.sheet.skills[8] = 300;
    host.commands.useSkill?.(8);
    expect(s.state.sheet.sneaking).toBe(true);
    host.commands.useSkill?.(8);
    expect(s.state.sheet.sneaking).toBe(false);
    expect(s.state.queue.peek((e) => e.kind === 'sneak')).toHaveLength(0);
  });

  it('Zdarzenie 0x42e32c ustawia sneakRollOk i kolejkuje sie ponownie', () => {
    const { s, host } = mk();
    s.state.sheet.skills[8] = 300;
    host.commands.useSkill?.(8);
    expect(s.state.sheet.sneakRollOk).toBeFalsy();
    s.state.queue.processUntil(s.world.clock.ticks, (e) => {
      for (const h of s.eventHandlers) h(e);
      return 0;
    });
    expect(typeof s.state.sheet.sneakRollOk).toBe('boolean');
    const next = s.state.queue.peek((e) => e.kind === 'sneak');
    expect(next).toHaveLength(1);
    expect(next[0]!.atTick).toBeGreaterThan(s.world.clock.ticks);
  });
});
