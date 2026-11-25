import { describe, expect, it } from 'vitest';
import { parsePartyTxt } from './party-txt.js';

describe('parsePartyTxt', () => {
  it('fixture', () => {
    const [m] = parsePartyTxt(`[Party Member 4]   ; Sulik
party_member_pid=16777313
distance=stay_close, charge
level_minimum=1
level_up_every=3
level_pids=16777314, 16777315

[Inna]
party_member_pid=1
`);
    expect(m?.index).toBe(4);
    expect(m?.pid).toBe(16777313);
    expect(m?.distance).toEqual(['stay_close', 'charge']);
    expect(m?.levelMinimum).toBe(1);
    expect(m?.levelUpEvery).toBe(3);
    expect(m?.levelPids).toEqual([16777314, 16777315]);
    expect(parsePartyTxt('[Party Member 0]\nparty_member_pid=1\n[Foo]\n')).toHaveLength(1);
  });
  it('level_pids = -1 i brakujace pola', () => {
    const [m] = parsePartyTxt('[Party Member 0]\nlevel_pids=-1\n');
    expect(m?.levelPids).toEqual([-1]);
    expect(m?.pid).toBe(0);
    expect(m?.attackWho).toEqual([]);
  });
});
