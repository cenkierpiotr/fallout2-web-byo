import { describe, expect, it } from 'vitest';
import {
  applyPartyOrders,
  normalizeAiPacket,
  validateOrders,
  type PartyAllowedDef,
} from '../src/index.js';

const sulik: PartyAllowedDef = {
  areaAttackMode: ['always', 'sometimes', 'be_careful'],
  attackWho: ['whomever_attacking_me', 'strongest', 'whomever', 'closest'],
  bestWeapon: ['no_pref', 'melee', 'melee_over_ranged', 'ranged_over_melee', 'unarmed'],
  chemUse: ['clean', 'stims_when_hurt_little', 'always'],
  distance: ['stay_close', 'charge', 'snipe', 'on_your_own', 'stay'],
  runAwayMode: ['none', 'tourniquet', 'never'],
};
const msgRanges = {} as never;
const base = () =>
  normalizeAiPacket({
    name: 'x',
    packetNum: 1,
    aggression: 50,
    maxDist: 20,
    minToHit: 0,
    minHp: 0,
    chance: 0,
    hurtTooMuch: new Set(),
    msgRanges,
  });

describe('rozkazy druzyny (Zadanie 38)', () => {
  it('walidacja: dozwolone przechodza, spoza listy sa odrzucane', () => {
    const v = validateOrders(sulik, {
      distance: 'stay',
      attackWho: 'weakest',
      runAwayMode: 'coward',
    });
    expect(v.accepted).toEqual({ distance: 'stay' });
    expect(v.rejected.sort()).toEqual(['attackWho', 'runAwayMode']);
  });
  it('nalozenie na pakiet: distance, bron, ucieczka, chem; wejscie nietkniete', () => {
    const p = base();
    const q = applyPartyOrders(p, {
      distance: 'stay_close',
      bestWeapon: 'ranged_over_melee',
      runAwayMode: 'never',
      chemUse: 'always',
      attackWho: 'strongest',
      areaAttackMode: 'be_careful',
    });
    expect(q.distance).toBe('stay_close');
    expect(q.bestWeapon).toBe(3);
    expect(q.runAwayIndex).toBe(5);
    expect(q.chemUse).toBe(5);
    expect(q.attackWho).toBe('strongest');
    expect(q.areaMode).toBe('be_careful');
    expect(p.distance).toBe('on_your_own');
    expect(applyPartyOrders(p, { runAwayMode: 'none' }).runAwayIndex).toBe(-1);
  });
});
