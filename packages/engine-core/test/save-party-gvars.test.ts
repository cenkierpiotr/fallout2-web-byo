/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import type { PartyMemberDef } from '@f2/formats';
import { GlobalVars, PartyState } from '../src/index.js';
import { migrate } from '../src/save/migrations.js';
import { deserializeWorld, serializeWorld } from '../src/save/serialize.js';
import { arbitraryWorld } from './save-fixtures.js';

const meta = () => ({
  slot: 'quick',
  name: 'q',
  characterName: 'C',
  level: 1,
  location: 'L',
  gameDate: 'd',
  realTime: 1,
  thumbnail: null,
  engineVersion: '0',
});
const defs = [{ pid: 16777313, levelPids: [] }] as unknown as PartyMemberDef[];

function worldWith() {
  const w = arbitraryWorld(3);
  const party = new PartyState(defs, { objId: 1, pid: 0x1000000 });
  party.add({ objId: 77, pid: 16777313, flags: 0 });
  party.entries[1]!.counters = { applied: 1, checks: 5, roll: true };
  party.denied = true;
  const gv = new GlobalVars(8);
  gv.set(0, -250);
  gv.set(5, 3);
  w.party = party.toJSON();
  w.gvars = gv.toJSON();
  return { w, party, gv };
}
const roundTrip = (w: ReturnType<typeof arbitraryWorld>) =>
  JSON.parse(JSON.stringify(serializeWorld(w, meta())));

describe('save v3: party + gvars', () => {
  it('round-trip party i gvars (przez JSON i migrate)', () => {
    const { w, party, gv } = worldWith();
    const save = migrate(roundTrip(w)) as any;
    expect(save.schemaVersion).toBe(7);
    const back = deserializeWorld(save);
    expect(back).toEqual(w);
    const p = PartyState.fromJSON(back.party!, defs);
    expect(p.entries).toEqual(party.entries);
    expect(p.denied).toBe(true);
    expect(GlobalVars.fromJSON(back.gvars!).get(0)).toBe(gv.get(0));
  });
  it('swiat bez party/gvars -> null w zapisie, brak pol po odczycie', () => {
    const w = arbitraryWorld(4);
    const save = roundTrip(w);
    expect(save.party).toBeNull();
    expect(save.gvars).toBeNull();
    expect(save.world.party).toBeUndefined();
    const back = deserializeWorld(migrate(save) as any);
    expect(back.party).toBeUndefined();
    expect(back.gvars).toBeUndefined();
  });
  it('zapis nie aliasuje zywego stanu', () => {
    const { w } = worldWith();
    const save = serializeWorld(w, meta());
    w.party!.entries[1]!.counters.checks = 99;
    w.gvars!.values[0] = 1;
    expect(save.party!.entries[1]!.counters.checks).toBe(5);
    expect(save.gvars!.values[0]).toBe(-250);
  });
  it('migracja v2 -> v3 dodaje party=null i gvars=null', () => {
    const g = roundTrip(arbitraryWorld(5));
    g.schemaVersion = 2;
    delete g.party;
    delete g.gvars;
    const r = migrate(g) as any;
    expect(r.schemaVersion).toBe(7);
    expect(r.party).toBeNull();
    expect(r.gvars).toBeNull();
  });
  it('v8 -> save-too-new', () => {
    expect(migrate({ ...roundTrip(arbitraryWorld(5)), schemaVersion: 8 })).toEqual({
      error: 'save-too-new',
    });
  });
  const bad = (mut: (g: any) => void) => {
    const g = roundTrip(worldWith().w);
    mut(g);
    expect(migrate(g)).toEqual({ error: 'save-corrupt' });
  };
  it('walidacja party', () => {
    bad((g) => (g.party = 5));
    bad((g) => (g.party.version = 2));
    bad((g) => (g.party.entries = []));
    bad((g) => (g.party.entries = 'x'));
    bad((g) => (g.party.denied = 1));
    bad((g) => (g.party.entries[1].objId = 1.5));
    bad((g) => (g.party.entries[1].pid = 'a'));
    bad((g) => (g.party.entries[1].counters = null));
    bad((g) => (g.party.entries[1].counters.applied = -1));
    bad((g) => (g.party.entries[1].counters.roll = 0));
    bad((g) => (g.party.entries[1].objId = g.party.entries[0].objId));
  });
  it('walidacja gvars', () => {
    bad((g) => (g.gvars = []));
    bad((g) => (g.gvars.version = 9));
    bad((g) => (g.gvars.values = 'x'));
    bad((g) => (g.gvars.values[0] = 1.5));
    bad((g) => (g.gvars.values[1] = 2 ** 31));
    bad((g) => delete g.gvars);
    bad((g) => delete g.party);
  });
});
