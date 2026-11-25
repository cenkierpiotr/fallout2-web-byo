import { describe, expect, it } from 'vitest';
import { barterAccept, barterPrice, splitCaps } from '../../rules/src/barter.js';
import { BarterSession, type BarterItem, type BarterParams } from '../src/index.js';

const rules = { barterPrice, splitCaps, barterAccept };
const item = (
  id: string,
  pid: number,
  count: number,
  value: number,
  weight = 1,
  blocked = false,
): BarterItem => ({
  id,
  pid,
  count,
  value,
  weight,
  blocked,
});
const params = (over: Partial<BarterParams> = {}): BarterParams => ({
  merchantBarter: 100,
  partyBestBarter: 100,
  barterMod: 0,
  masterTrader: false,
  playerFreeCarry: 100,
  ...over,
});
const mk = (p = params()) =>
  new BarterSession(
    [item('knife', 1, 2, 100), item('caps', 0x29, 500, 1, 0)],
    [item('stim', 2, 3, 100), item('ammo', 3, 10, 5)],
    p,
    rules,
  );

describe('BarterSession', () => {
  it('moves items between inventory and table with stack limits', () => {
    const s = mk();
    expect(s.addToTable('player', 'knife', 3)).toBe(false);
    expect(s.addToTable('player', 'knife', 1)).toBe(true);
    expect(s.playerTable[0]!.count).toBe(1);
    expect(s.playerInv.find((i) => i.id === 'knife')!.count).toBe(1);
    expect(s.removeFromTable('player', 'knife', 1)).toBe(true);
    expect(s.playerTable).toHaveLength(0);
    expect(s.playerInv.find((i) => i.id === 'knife')!.count).toBe(2);
    expect(s.removeFromTable('player', 'knife', 1)).toBe(false);
  });
  it('prices offer with caps unmultiplied (golden 290)', () => {
    const s = mk(params({ barterMod: 20 }));
    s.addToTable('player', 'knife', 1);
    s.addToTable('player', 'caps', 50);
    expect(s.totals().offer).toBe(290);
  });
  it('rejects low offer and empty merchant table', () => {
    const s = mk();
    s.addToTable('player', 'knife', 1);
    expect(s.accept()).toBe('offer-too-low');
    s.addToTable('merchant', 'stim', 2);
    expect(s.totals()).toMatchObject({ offer: 200, merchantValue: 200, balanced: true });
    s.addToTable('merchant', 'stim', 1);
    expect(s.totals().balanced).toBe(false);
    expect(s.accept()).toBe('offer-too-low');
    expect(s.isClosed).toBe(false);
  });
  it('blocks selling blocked items and overweight', () => {
    const s = new BarterSession(
      [item('armor', 4, 1, 500, 1, true)],
      [item('stim', 2, 1, 10)],
      params(),
      rules,
    );
    s.addToTable('player', 'armor');
    s.addToTable('merchant', 'stim');
    expect(s.accept()).toBe('not-tradeable');
    const h = new BarterSession(
      [item('caps', 0x29, 100, 1, 0)],
      [item('gun', 5, 1, 10, 50)],
      params({ playerFreeCarry: 10 }),
      rules,
    );
    h.addToTable('player', 'caps', 50);
    h.addToTable('merchant', 'gun');
    expect(h.accept()).toBe('player-cannot-carry');
  });
  it('executes trade on inventories and merges stacks', () => {
    const s = mk();
    s.addToTable('player', 'knife', 2);
    s.addToTable('merchant', 'stim', 3);
    expect(s.accept()).toBe('ok');
    expect(s.isClosed).toBe(true);
    expect(s.playerInv.find((i) => i.id === 'stim')!.count).toBe(3);
    expect(s.merchantInv.find((i) => i.id === 'knife')!.count).toBe(2);
    expect(s.merchantInv.find((i) => i.id === 'stim')).toBeUndefined();
    expect(s.addToTable('player', 'caps')).toBe(false);
  });
  it('cancel returns everything', () => {
    const s = mk();
    s.addToTable('player', 'knife', 2);
    s.addToTable('merchant', 'ammo', 4);
    s.cancel();
    expect(s.playerInv.find((i) => i.id === 'knife')!.count).toBe(2);
    expect(s.merchantInv.find((i) => i.id === 'ammo')!.count).toBe(10);
  });
  it('frees player carry by the weight of items moved to the table', () => {
    const mkH = () =>
      new BarterSession(
        [item('caps', 0x29, 100, 1, 0), item('rock', 6, 1, 1, 30)],
        [item('gun', 5, 1, 10, 50)],
        params({ playerFreeCarry: 20 }),
        rules,
      );
    const a = mkH();
    a.addToTable('player', 'caps', 50);
    a.addToTable('merchant', 'gun');
    expect(a.accept()).toBe('player-cannot-carry');
    const b = mkH();
    b.addToTable('player', 'caps', 50);
    b.addToTable('player', 'rock');
    b.addToTable('merchant', 'gun');
    expect(b.accept()).toBe('ok');
  });
  it('container mode checks merchant carry and uses table weights', () => {
    const mkC = (mfc: number) =>
      new BarterSession(
        [item('rock', 6, 1, 1, 30)],
        [item('gun', 5, 1, 10, 20)],
        params({ containerMode: true, merchantFreeCarry: mfc, playerFreeCarry: 100 }),
        rules,
      );
    const a = mkC(5);
    a.addToTable('player', 'rock');
    a.addToTable('merchant', 'gun');
    expect(a.totals().offer).toBe(30);
    expect(a.accept()).toBe('merchant-cannot-carry');
    const b = mkC(10);
    b.addToTable('merchant', 'gun');
    expect(b.accept()).toBe('ok');
    const c = mkC(40);
    c.addToTable('player', 'rock');
    c.addToTable('merchant', 'gun');
    expect(c.accept()).toBe('ok');
  });

  describe('balance', () => {
    it('adds just enough caps to balance', () => {
      const s = mk();
      s.addToTable('merchant', 'stim', 2); // 200
      s.addToTable('player', 'caps', 20);
      expect(s.balance()).toBe('ok');
      const t = s.totals();
      expect(t.balanced).toBe(true);
      expect(t.offer).toBe(200); // dokladnie, bez nadplaty
      expect(s.playerTable.find((i) => i.id === 'caps')!.count).toBe(200);
    });
    it('reports not-enough-caps and leaves table unchanged', () => {
      const s = mk();
      s.addToTable('merchant', 'stim', 3);
      const s2 = new BarterSession(
        [item('caps', 0x29, 10, 1, 0)],
        [item('stim', 2, 3, 100)],
        params(),
        rules,
      );
      s2.addToTable('merchant', 'stim', 3);
      expect(s2.balance()).toBe('not-enough-caps');
      expect(s2.playerTable).toHaveLength(0);
      expect(s2.playerInv[0]!.count).toBe(10);
    });
    it('nothing-to-balance when merchant table empty or already balanced', () => {
      const s = mk();
      expect(s.balance()).toBe('nothing-to-balance');
      s.addToTable('merchant', 'ammo', 1);
      s.addToTable('player', 'knife', 1);
      expect(s.balance()).toBe('nothing-to-balance');
    });
    it('does nothing in container mode and after close', () => {
      const s = mk(params({ containerMode: true }));
      expect(s.balance()).toBe('nothing-to-balance');
    });
  });

  describe('review M5 fixes', () => {
    it('container mode: both tables empty gives offer-too-low', () => {
      const s = mk(params({ containerMode: true, merchantFreeCarry: 100 }));
      expect(s.accept()).toBe('offer-too-low');
      expect(s.isClosed).toBe(false);
    });
    it('takeStack rejects fractional, NaN and Infinity counts', () => {
      const s = mk();
      for (const c of [0.5, 1.5, NaN, Infinity, -1, 0]) {
        expect(s.addToTable('player', 'knife', c)).toBe(false);
      }
      expect(s.playerInv.find((i) => i.id === 'knife')!.count).toBe(2);
      s.addToTable('player', 'knife', 2);
      expect(s.removeFromTable('player', 'knife', 0.5)).toBe(false);
      expect(s.removeFromTable('player', 'knife', NaN)).toBe(false);
      expect(s.playerTable[0]!.count).toBe(2);
    });
    it('accept on a closed session returns session-closed', () => {
      const s = mk();
      s.addToTable('player', 'knife', 2);
      s.addToTable('merchant', 'stim', 1);
      expect(s.accept()).toBe('ok');
      expect(s.accept()).toBe('session-closed');
      const c = mk();
      c.cancel();
      expect(c.accept()).toBe('session-closed');
    });
  });
});
