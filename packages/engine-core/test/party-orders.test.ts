import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parsePartyTxt } from '@f2/formats';
import { PartyState } from '../src/party/party-state.js';

const PATCH = process.env['F2_PATCH_DIR'];
const file = PATCH ? join(PATCH, 'DATA', 'Data', 'party.txt') : '';

describe.skipIf(!PATCH || !existsSync(file))('rozkazy druzyny na prawdziwym party.txt', () => {
  const defs = parsePartyTxt(existsSync(file) ? readFileSync(file, 'latin1') : '');
  const SULIK = 16777313;
  const mk = () => {
    const s = new PartyState(defs, { objId: 1, pid: 0x01000001 });
    const r = s.add({ objId: 50, pid: SULIK, flags: 0 });
    return Object.assign(s, { sid: r.objId ?? 50 });
  };
  it('Sulik: dozwolone przyjete, niedozwolone odrzucone, round-trip zapisu', () => {
    const s = mk();
    const id = s.sid;
    const v = s.setOrders(id, { distance: 'stay', attackWho: 'weakest', runAwayMode: 'never' });
    expect(v?.rejected).toEqual(['attackWho']);
    expect(s.ordersOf(id)).toEqual({ distance: 'stay', runAwayMode: 'never' });
    const j = JSON.parse(JSON.stringify(s.toJSON()));
    const r = PartyState.fromJSON(j, defs);
    expect(r.ordersOf(id)).toEqual({ distance: 'stay', runAwayMode: 'never' });
  });
  it('rozkazy znikaja po usunieciu czlonka; nieznany czlonek = undefined; stary zapis bez orders dziala', () => {
    const s = mk();
    const id = s.sid;
    s.setOrders(id, { distance: 'charge' });
    expect(s.setOrders(999, { distance: 'charge' })).toBeUndefined();
    s.remove(id);
    expect(s.ordersOf(id)).toEqual({});
    const j = mk().toJSON();
    expect('orders' in j).toBe(false);
    expect(PartyState.fromJSON(j, defs).ordersOf(s.sid)).toEqual({});
  });
});
