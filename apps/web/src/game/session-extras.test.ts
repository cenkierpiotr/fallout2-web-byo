import { describe, expect, it } from 'vitest';
import { GameVars } from '@f2/engine-core';
import { SessionExtras } from './session-extras';

function make(rebind?: (e: readonly { objId: number; pid: number }[]) => number) {
  const vars = new GameVars(Int32Array.from([0, 0, 0, 0]));
  const ex = new SessionExtras({
    vars,
    partyDefs: [{ pid: 0x1000001 } as never],
    player: { objId: 1, pid: 0x1000000 },
    ...(rebind ? { rebindParty: rebind } : {}),
    quests: [],
    holodisks: [],
    karmavar: [],
  });
  return { vars, ex };
}

describe('SessionExtras', () => {
  it('odbija zmiany zmiennych skryptowych do GlobalVars', () => {
    const { vars, ex } = make();
    vars.set(2, 7);
    expect(ex.gvars.get(2)).toBe(7);
  });
  it('snapshot/restore przenosi gvars i druzyne, instancja PartyState zostaje ta sama', () => {
    const a = make();
    a.ex.party.add({ objId: 50, pid: 0x1000001, flags: 0 });
    a.vars.set(1, 9);
    const snap = a.ex.snapshot();
    expect(snap.party?.entries.length).toBe(2);
    const b = make();
    const same = b.ex.party;
    b.ex.restore(snap);
    expect(b.vars.get(1)).toBe(9);
    expect(b.ex.gvars.get(1)).toBe(9);
    expect(b.ex.party.memberCount).toBe(1);
    expect(b.ex.party).toBe(same);
  });
  it('rebindParty przekazuje wpisy druzyny do hosta swiata', () => {
    let got = 0;
    const { ex } = make((e) => (got = e.length));
    ex.party.add({ objId: 50, pid: 0x1000001, flags: 0 });
    ex.rebindParty();
    expect(got).toBe(2);
  });
});
