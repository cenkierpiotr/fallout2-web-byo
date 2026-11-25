import { describe, expect, it, vi } from 'vitest';
import { BarterSession, type BarterItem } from '../../engine-core/src/barter-session.js';
import { barterAccept, barterPrice, splitCaps } from '../../rules/src/barter.js';
import { createBarterBinding, type BarterItemMeta } from '../src/barter-binding.js';

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
  ...(blocked ? { blocked } : {}),
});
const meta: Record<string, BarterItemMeta> = {
  caps: { id: 1, name: 'Kapsle', fid: 1, category: 'misc' },
  knife: { id: 2, name: 'Noz', fid: 2, category: 'weapon' },
  quest: { id: 3, name: 'Dysk', fid: 3, category: 'quest' },
  stim: { id: 4, name: 'Stimpak', fid: 4, category: 'drug' },
};
const params = { merchantBarter: 100, partyBestBarter: 100, barterMod: 0, masterTrader: false };

function mk(
  over: { containerMode?: boolean; merchantFreeCarry?: number; playerFreeCarry?: number } = {},
) {
  const session = new BarterSession(
    [item('caps', 0x29, 500, 1, 0), item('knife', 1, 2, 100), item('quest', 5, 1, 1, 1, true)],
    [item('stim', 2, 3, 100)],
    { ...params, playerFreeCarry: 100, ...over },
    rules,
  );
  const onChange = vi.fn();
  const b = createBarterBinding(session, {
    merchantName: 'Maida',
    meta,
    params,
    ...(over.containerMode ? { containerMode: true } : {}),
    onChange,
  });
  return { session, b, onChange };
}

describe('createBarterBinding', () => {
  it('mapuje sesje na widok z numerycznymi id i flaga tradeable', () => {
    const { b } = mk();
    const v = b.snapshot();
    expect(v.merchantName).toBe('Maida');
    expect(v.player.map((i) => [i.id, i.name, i.tradeable])).toEqual([
      [1, 'Kapsle', true],
      [2, 'Noz', true],
      [3, 'Dysk', false],
    ]);
    expect(v.totals).toEqual({ offer: 0, wanted: 0, balanced: false });
  });

  it('move/accept/balance korzystaja z regul i wolaja onChange', () => {
    const { b, onChange, session } = mk();
    expect(b.commands.move('merchant', 4, 1, 'table')).toEqual({ ok: true });
    expect(b.commands.balance()).toEqual({ ok: true });
    expect(b.snapshot().totals).toEqual({ offer: 100, wanted: 100, balanced: true });
    expect(b.commands.accept()).toEqual({ ok: true });
    expect(session.isClosed).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it('odmowy ruchu: not-found, count-exceeds, not-tradeable, session-closed', () => {
    const { b, onChange } = mk();
    expect(b.commands.move('player', 99, 1, 'table')).toEqual({ ok: false, reason: 'not-found' });
    expect(b.commands.move('player', 2, 3, 'table')).toEqual({
      ok: false,
      reason: 'count-exceeds',
    });
    expect(b.commands.move('player', 2, 1.5, 'table')).toEqual({
      ok: false,
      reason: 'count-exceeds',
    });
    expect(b.commands.move('player', 3, 1, 'table')).toEqual({
      ok: false,
      reason: 'not-tradeable',
    });
    expect(b.commands.move('player', 2, 1, 'inventory')).toEqual({
      ok: false,
      reason: 'not-found',
    });
    expect(onChange).not.toHaveBeenCalled();
    b.commands.cancel();
    expect(b.commands.move('player', 2, 1, 'table')).toEqual({
      ok: false,
      reason: 'session-closed',
    });
  });

  it('odmowy akceptacji przekazuje z regul (offer-too-low, player-cannot-carry)', () => {
    const { b } = mk({ playerFreeCarry: 1 });
    expect(b.commands.accept()).toEqual({ ok: false, reason: 'offer-too-low' });
    b.commands.move('merchant', 4, 3, 'table');
    expect(b.commands.accept()).toEqual({ ok: false, reason: 'player-cannot-carry' });
  });

  it('tryb pojemnika: merchant-cannot-carry, masa jako oferta, bez wyrownania', () => {
    const { b } = mk({ containerMode: true, merchantFreeCarry: 1 });
    b.commands.move('player', 2, 2, 'table');
    const v = b.snapshot();
    expect(v.containerMode).toBe(true);
    expect(v.totals.offer).toBe(2);
    expect(b.commands.accept()).toEqual({ ok: false, reason: 'merchant-cannot-carry' });
    expect(b.commands.balance()).toEqual({ ok: false, reason: 'nothing-to-balance' });
  });

  it('brak danych prezentacji lub powtorzone id UI rzuca wyjatek', () => {
    const session = new BarterSession(
      [item('x', 1, 1, 1)],
      [],
      { ...params, playerFreeCarry: 1 },
      rules,
    );
    const b = createBarterBinding(session, { merchantName: 'M', meta: {}, params });
    expect(() => b.snapshot()).toThrow(/brak danych/);
    expect(() =>
      createBarterBinding(session, {
        merchantName: 'M',
        meta: {
          a: { id: 1, name: 'a', fid: 0, category: 'misc' },
          b: { id: 1, name: 'b', fid: 0, category: 'misc' },
        },
        params,
      }),
    ).toThrow(/powtorzone/);
  });
});
