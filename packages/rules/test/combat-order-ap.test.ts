import { describe, expect, it } from 'vitest';
import { apAtTurnStart, compareInitiative, turnOrder, freeMoveAp } from '../src/index.js';

const c = (id: number, seq: number, ag: number) => ({ id, sequence: seq, agility: ag });

describe('kolejnosc tur (0x4223c8, D)', () => {
  it('wieksza Sequence idzie pierwsza', () => {
    expect(compareInitiative(c(1, 10, 5), c(2, 5, 9))).toBeLessThan(0);
    expect(compareInitiative(c(1, 5, 5), c(2, 10, 1))).toBeGreaterThan(0);
  });
  it('remis Sequence: wieksza AG pierwsza', () => {
    expect(compareInitiative(c(1, 8, 7), c(2, 8, 4))).toBeLessThan(0);
    expect(compareInitiative(c(1, 8, 3), c(2, 8, 4))).toBeGreaterThan(0);
  });
  it('qsort 0x4f05b6 (n<16: sort Shella 3,1) nie jest stabilny (D)', () => {
    const inp = [c(1, 5, 1), c(2, 5, 1), c(3, 5, 1), c(4, 5, 1), c(5, 9, 1)];
    expect(turnOrder(inp).map((x) => x.id)).toEqual([5, 1, 3, 4, 2]);
  });
  it('pelny remis = 0, dla n<4 kolejnosc wejscia zachowana', () => {
    expect(compareInitiative(c(1, 8, 4), c(2, 8, 4))).toBe(0);
    expect(turnOrder([c(1, 8, 4), c(2, 8, 4), c(3, 9, 1)]).map((x) => x.id)).toEqual([3, 1, 2]);
  });
  it('turnOrder nie mutuje wejscia', () => {
    const inp = [c(1, 1, 1), c(2, 9, 1)];
    turnOrder(inp);
    expect(inp.map((x) => x.id)).toEqual([1, 2]);
  });
});

describe('AP (0x4222a8, 0x422914, 0x42299c, D)', () => {
  it('AP na starcie rundy = max AP', () => {
    expect(apAtTurnStart(8)).toBe(8);
  });
  it('z rekordem druzyny (DAT_0051094c) dodaje jego pole +8', () => {
    expect(apAtTurnStart(8, 2)).toBe(10);
  });
  it('darmowe punkty ruchu gracza = 2 * poziom perku', () => {
    expect(freeMoveAp(0)).toBe(0);
    expect(freeMoveAp(3)).toBe(6);
  });
});

import { manualEndCombatBlocked } from '../src/index.js';

describe('reczne konczenie walki 0x422694 (komunikat 103, D)', () => {
  const enemy = { team: 2, threat: true };
  it('blokuje przy zagrozeniu w turze gracza', () => {
    expect(manualEndCombatBlocked(0, true, [enemy], [])).toBe(true);
    expect(manualEndCombatBlocked(0, true, [], [enemy])).toBe(true);
  });
  it('poza tura gracza lub bez zagrozenia konczy', () => {
    expect(manualEndCombatBlocked(0, false, [enemy], [])).toBe(false);
    expect(manualEndCombatBlocked(0, true, [{ team: 2, threat: false }], [])).toBe(false);
  });
  it('sojusznik bez celu z wlasnej druzyny nie blokuje', () => {
    expect(manualEndCombatBlocked(0, true, [{ team: 0, threat: true }], [])).toBe(false);
    expect(manualEndCombatBlocked(0, true, [{ team: 0, whoHitMeTeam: 0, threat: true }], [])).toBe(
      true,
    );
  });
});
