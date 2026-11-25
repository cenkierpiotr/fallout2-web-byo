import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseHolodiskTxt, parseKarmavarTxt, parsePartyTxt, parseQuestsTxt } from '@f2/formats';
import { GlobalVars } from '../src/quests/global-vars.js';
import { QuestLog } from '../src/quests/quest-log.js';
import { PartyState } from '../src/party/party-state.js';

const PATCH = process.env['F2_PATCH_DIR'];
const dataDir = PATCH ? join(PATCH, 'DATA', 'Data') : '';
const golden = !!PATCH && existsSync(join(dataDir, 'party.txt'));
const rd = (f: string) => readFileSync(join(dataDir, f), 'latin1');

describe('GlobalVars', () => {
  it('get poza zakresem = 0, set poza zakresem = false, zdarzenie tylko przy zmianie', () => {
    const g = new GlobalVars(4);
    const ev: [number, number][] = [];
    g.subscribe((i, v) => ev.push([i, v]));
    expect(g.get(99)).toBe(0);
    expect(g.set(99, 1)).toBe(false);
    g.set(2, 5);
    g.set(2, 5);
    expect(ev).toEqual([[2, 5]]);
  });
  it('round-trip JSON', () => {
    const g = new GlobalVars(3);
    g.set(1, -7);
    const r = GlobalVars.fromJSON(JSON.parse(JSON.stringify(g.toJSON())));
    expect(r.get(1)).toBe(-7);
    expect(() => GlobalVars.fromJSON({ version: 2 } as never)).toThrow();
  });
});

describe('QuestLog', () => {
  const quests = [
    { locationMsg: 1500, descriptionMsg: 100, gvar: 9, displayThreshold: 2, completedThreshold: 6 },
    {
      locationMsg: 1500,
      descriptionMsg: 101,
      gvar: 99999,
      displayThreshold: 1,
      completedThreshold: 2,
    },
  ];
  const holo = [{ gvar: 220, titleMsg: 1, textMsg: 2 }];
  it('set_global_var(9,2) -> quest aktywny; gvar poza zakresem ukryty', () => {
    const g = new GlobalVars(300);
    const log = new QuestLog(g, quests, holo, [
      { gvar: 11, pic: 148, nameMsg: 1, descriptionMsg: 2 },
    ]);
    expect(log.current.locations).toEqual([]);
    const seen: number[] = [];
    log.subscribe((v) => seen.push(v.locations.length));
    g.set(9, 2);
    expect(log.current.locations[0]?.quests).toEqual([
      { descriptionMsg: 100, gvar: 9, status: 'active' },
    ]);
    g.set(9, 6);
    expect(log.current.locations[0]?.quests[0]?.status).toBe('completed');
    g.set(220, 1);
    g.set(11, 1);
    expect(log.current.holodisks).toHaveLength(1);
    expect(log.current.titles[0]?.pic).toBe(148);
    expect(seen.length).toBe(4);
  });
  it.skipIf(!golden)('golden: quests.txt/holodisk.txt/karmavar.txt', () => {
    const q = parseQuestsTxt(rd('quests.txt'));
    const k = parseKarmavarTxt(rd('karmavar.txt'));
    const h = existsSync(join(dataDir, 'holodisk.txt')) ? parseHolodiskTxt(rd('holodisk.txt')) : []; // holodisk.txt w MASTER.DAT, nie w overlay
    expect(q.length).toBeGreaterThan(100);
    const g = new GlobalVars(700);
    const log = new QuestLog(g, q, h, k);
    g.set(q[0]!.gvar, q[0]!.completedThreshold);
    expect(log.current.locations.length).toBeGreaterThan(0);
  });
});

describe('PartyState', () => {
  const defs = [
    {
      index: 4,
      pid: 16777313,
      areaAttackMode: [],
      attackWho: [],
      bestWeapon: [],
      chemUse: [],
      distance: [],
      runAwayMode: [],
      disposition: [],
      levelMinimum: 1,
      levelUpEvery: 3,
      levelPids: [16777314, 16777315],
    },
  ];
  it('add, duplikat, awans i round-trip', () => {
    const p = new PartyState(defs, { objId: 1, pid: 16777216 });
    const r = p.add({ objId: 50, pid: 16777313, flags: 0 });
    expect(r.code).toBe(1);
    expect(p.add({ objId: 50, pid: 16777313, flags: 0 }).code).toBe(0);
    const ch1 = p.incLevels(5, { int: () => 100 });
    expect(ch1).toEqual([]);
    p.incLevels(5, { int: () => 100 });
    const ch3 = p.incLevels(5, { int: () => 100 }); // checks=3, m=0 -> awans
    expect(ch3).toEqual([{ objId: r.objId, oldPid: 16777313, newPid: 16777314 }]);
    expect(p.entries[1]?.counters.applied).toBe(1);
    const back = PartyState.fromJSON(JSON.parse(JSON.stringify(p.toJSON())), defs);
    expect(back.toJSON()).toEqual(p.toJSON());
    expect(() => PartyState.fromJSON({ version: 1, entries: [] } as never, defs)).toThrow();
  });
  it('gracz (indeks 0) nigdy nie awansuje', () => {
    const p = new PartyState([{ ...defs[0]!, pid: 16777216 }], { objId: 1, pid: 16777216 });
    expect(p.incLevels(10, { int: () => 1 })).toEqual([]);
  });
  it.skipIf(!golden)('golden party.txt: 26 sekcji, Myron/Sulik', () => {
    const d = parsePartyTxt(rd('party.txt'));
    expect(d).toHaveLength(26);
    expect(d.find((x) => x.index === 4)?.pid).toBe(16777313);
  });
});
