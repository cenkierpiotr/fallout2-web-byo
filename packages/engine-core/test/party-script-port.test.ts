import { describe, expect, it } from 'vitest';
import type { PartyMemberDef } from '@f2/formats';
import { PartyState } from '../src/party/party-state.js';
import { PartyScriptAdapter } from '../src/party/party-script-port.js';

const defs = [{ pid: 16777313, levelPids: [] }] as unknown as PartyMemberDef[];
const mk = (limit?: () => number) => {
  const st = new PartyState(defs, { objId: 1, pid: 0x1000000 });
  return { st, ad: new PartyScriptAdapter(st, limit) };
};

describe('PartyScriptAdapter (opkody party_add / party_remove)', () => {
  it('partyAdd dodaje, zwraca flagi 0x404 i nowe objId', () => {
    const { st, ad } = mk();
    const r = ad.partyAdd({ objId: 77, pid: 16777313, flags: 0 });
    expect(r).toEqual({ code: 1, flags: 0x404, objId: 18097 });
    expect(st.entries).toHaveLength(2);
    expect(ad.partyMemberCount()).toBe(1);
  });
  it('duplikat -> code 0', () => {
    const { ad } = mk();
    ad.partyAdd({ objId: 77, pid: 16777313, flags: 0 });
    expect(ad.partyAdd({ objId: 77, pid: 16777313, flags: 0 }).code).toBe(0);
  });
  it('limit z callbacku -> code -1 bez zmiany', () => {
    const { st, ad } = mk(() => 0);
    expect(ad.partyAdd({ objId: 77, pid: 16777313, flags: 0 }).code).toBe(-1);
    expect(st.entries).toHaveLength(1);
  });
  it('partyRemove usuwa czlonka i czysci flagi; gracza i nieznanego nie', () => {
    const { st, ad } = mk();
    const a = ad.partyAdd({ objId: 77, pid: 16777313, flags: 0x10 });
    expect(ad.partyRemove(1)).toEqual({ removed: false });
    expect(ad.partyRemove(999)).toEqual({ removed: false });
    const r = ad.partyRemove(a.objId as number, 0x414);
    expect(r).toEqual({ removed: true, flags: 0x10 });
    expect(st.entries).toHaveLength(1);
  });
  it('isPartyMember', () => {
    const { ad } = mk();
    const a = ad.partyAdd({ objId: 77, pid: 16777313, flags: 0 });
    expect(ad.isPartyMember(a.objId as number)).toBe(true);
    expect(ad.isPartyMember(1)).toBe(true);
    expect(ad.isPartyMember(5)).toBe(false);
  });
});

describe('PartyState.remove kolejnosc (D 0x4944dc)', () => {
  it('ostatni czlonek zajmuje miejsce usunietego', () => {
    const s = new PartyState(
      [
        { pid: 16777313, levelPids: [] },
        { pid: 16777314, levelPids: [] },
        { pid: 16777315, levelPids: [] },
      ] as unknown as PartyMemberDef[],
      { objId: 1, pid: 0x1000000 },
    );
    for (const [objId, pid] of [
      [10, 16777313],
      [11, 16777314],
      [12, 16777315],
    ] as const)
      s.add({ objId, pid, flags: 0 });
    expect(s.entries.map((e) => e.objId)).toEqual([1, 18097, 18098, 18099]);
    expect(s.remove(18097)).toBe(true);
    expect(s.entries.map((e) => e.objId)).toEqual([1, 18099, 18098]);
  });
});
