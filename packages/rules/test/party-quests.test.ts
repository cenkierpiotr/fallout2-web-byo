import { describe, expect, it } from 'vitest';
import {
  NEW_PARTY_COUNTERS,
  generalReputationTitle,
  holodiskVisible,
  karmaTitles,
  partyLevelUpCheck,
  partyMemberAdd,
  partyObjectId,
  questStatus,
  type PartyEntry,
} from '../src/index.js';

const fixedRng = (v: number) => ({ int: () => v });
const myron = { levelMinimum: 6, levelUpEvery: 4, levelPids: [1, 2, 3, 4] };

describe('partyLevelUpCheck (R17-U1)', () => {
  it('ponizej level_minimum: brak awansu i licznikow bez zmian', () => {
    const r = partyLevelUpCheck(myron, NEW_PARTY_COUNTERS, 5, fixedRng(1));
    expect(r.levelUp).toBe(false);
    expect(r.counters.checks).toBe(0);
  });
  it('level_up_every 0 -> brak awansu', () => {
    expect(
      partyLevelUpCheck({ ...myron, levelUpEvery: 0 }, NEW_PARTY_COUNTERS, 9, fixedRng(1)).levelUp,
    ).toBe(false);
  });
  it('m == 0 awansuje bez rzutu, flaga roll nie ustawiona', () => {
    let c = { applied: 0, checks: 3, roll: false };
    const r = partyLevelUpCheck(myron, c, 6, fixedRng(100));
    expect(r.levelUp).toBe(true);
    expect(r.newPid).toBe(1);
    expect(r.counters).toEqual({ applied: 1, checks: 4, roll: false });
    c = r.counters;
  });
  it('m != 0: awans gdy m*100/every >= rzut, ustawia flage', () => {
    const r = partyLevelUpCheck(myron, { applied: 0, checks: 1, roll: false }, 6, fixedRng(50)); // m=2 -> 50 >= 50
    expect(r.levelUp).toBe(true);
    expect(r.counters).toEqual({ applied: 1, checks: 2, roll: true });
    const no = partyLevelUpCheck(myron, { applied: 0, checks: 1, roll: false }, 6, fixedRng(51));
    expect(no.levelUp).toBe(false);
    expect(no.counters.checks).toBe(2);
  });
  it('rzut z zakresu inclusive [0,100] (0x495d19: min=0, max=100)', () => {
    const calls: [number, number][] = [];
    const rng = { int: (a: number, b: number) => (calls.push([a, b]), 0) };
    const r = partyLevelUpCheck(myron, { applied: 0, checks: 0, roll: false }, 6, rng); // m=1 -> prog 25
    expect(calls).toEqual([[0, 100]]);
    expect(r.levelUp).toBe(true);
  });
  it('flaga roll blokuje kolejny awans w cyklu', () => {
    const r = partyLevelUpCheck(myron, { applied: 1, checks: 2, roll: true }, 6, fixedRng(1));
    expect(r.levelUp).toBe(false);
  });
  it('wszystkie level_pids zuzyte -> zostaje na ostatnim, bez wyjatku', () => {
    const r = partyLevelUpCheck(
      { ...myron, levelPids: [1, 2] },
      { applied: 2, checks: 8, roll: false },
      20,
      fixedRng(1),
    );
    expect(r.levelUp).toBe(false);
    expect(r.newPid).toBeNull();
  });
  it('nie mutuje wejscia', () => {
    const c = { applied: 0, checks: 3, roll: false };
    partyLevelUpCheck(myron, c, 6, fixedRng(1));
    expect(c).toEqual({ applied: 0, checks: 3, roll: false });
  });
});

describe('partyMemberAdd 0x494378', () => {
  const player: PartyEntry = { objId: 1, pid: 16777216, counters: { ...NEW_PARTY_COUNTERS } };
  it('dodaje, ustawia flagi 0x404 i id (pid&0xffffff)+18000', () => {
    const r = partyMemberAdd([player], { objId: 77, pid: 16777313, flags: 0x1 }, { defCount: 26 });
    expect(r.code).toBe(1);
    expect(r.flags).toBe(0x405);
    expect(r.newObjId).toBe(partyObjectId(16777313));
    expect(r.newObjId).toBe(97 + 18000);
    expect(r.entries).toHaveLength(2);
  });
  it('duplikat (ten sam pid lub obiekt) -> 0 bez dodania', () => {
    const a = partyMemberAdd([player], { objId: 77, pid: 16777313, flags: 0 }, { defCount: 26 });
    expect(
      partyMemberAdd(a.entries, { objId: 5, pid: 16777313, flags: 0 }, { defCount: 26 }).code,
    ).toBe(0);
    expect(
      partyMemberAdd(a.entries, { objId: a.newObjId as number, pid: 9, flags: 0 }, { defCount: 26 })
        .code,
    ).toBe(0);
  });
  it('limit defCount + 0x14 -> -1', () => {
    const r = partyMemberAdd([player], { objId: 2, pid: 5, flags: 0 }, { defCount: 0 - 19 });
    expect(r.code).toBe(-1);
  });
  it('DENIED -> 0', () => {
    expect(
      partyMemberAdd([player], { objId: 2, pid: 5, flags: 0 }, { defCount: 26, denied: true }).code,
    ).toBe(0);
  });
});

describe('questy, holodyski, reputacja', () => {
  const def = { gvar: 9, displayThreshold: 2, completedThreshold: 6 };
  it('questStatus', () => {
    expect(questStatus(def, 1)).toBe('hidden');
    expect(questStatus(def, 2)).toBe('active');
    expect(questStatus(def, 3)).toBe('active');
    expect(questStatus(def, 6)).toBe('completed');
  });
  it('hidden ma pierwszenstwo przed completed (0x497bd8)', () => {
    expect(questStatus({ gvar: 9, displayThreshold: 5, completedThreshold: 2 }, 3)).toBe('hidden');
  });
  it('holodiskVisible', () => {
    expect(holodiskVisible({ gvar: 220 }, 0)).toBe(false);
    expect(holodiskVisible({ gvar: 220 }, 1)).toBe(true);
  });
  const genrep = [
    { threshold: 1000, nameMsg: 3000 },
    { threshold: 750, nameMsg: 3001 },
    { threshold: 250, nameMsg: 3003 },
  ];
  it('generalReputationTitle', () => {
    expect(generalReputationTitle(1000, genrep)).toBe(3000);
    expect(generalReputationTitle(750, genrep)).toBe(3001);
    expect(generalReputationTitle(250, genrep)).toBe(3003);
    expect(generalReputationTitle(249, genrep)).toBeNull();
  });
  it('karmaTitles: gvar != 0, bez gvar 0', () => {
    const kv = [
      { gvar: 0, pic: 48, nameMsg: 1000, descriptionMsg: 1100 },
      { gvar: 11, pic: 148, nameMsg: 1011, descriptionMsg: 1111 },
    ];
    expect(karmaTitles((i) => (i === 11 || i === 0 ? 1 : 0), kv)).toEqual([
      { pic: 148, nameMsg: 1011, descriptionMsg: 1111 },
    ]);
  });
});
