import { describe, expect, it } from 'vitest';
import { resolveArtPath } from './art-manifest';

const lst = [
  'blank.frm      ; x',
  'egg.frm',
  'IFACE.FRM      ; main interface\r',
  'OPTIUP.FRM',
  'TRADE.FRM',
];
const lower = (names: string[]) => names.map((n) => `${n}.frm`);

describe('art-manifest', () => {
  it('resolveArtPath znajduje nazwe po indeksie z lst', () => {
    expect(resolveArtPath(lst, 'iface.bar')).toBe('art/intrface/iface.frm');
    expect(resolveArtPath(lst, 'iface.opts.up')).toBe('art/intrface/optiup.frm');
  });
  it('zwraca undefined dla nieznanego klucza', () => {
    expect(resolveArtPath(lst, 'nie.ma')).toBeUndefined();
    expect(resolveArtPath([], 'iface.bar')).toBeUndefined();
  });
  it('klucze zweryfikowane tym zadaniem rozwiazuja sie na wlasciwe pliki', () => {
    const all = lower(['numbers', 'invbox', 'lilredup', 'edtredt', 'opbtnoff', 'opbtnon', 'trade']);
    expect(resolveArtPath(all, 'iface.digits')).toBe('art/intrface/numbers.frm');
    expect(resolveArtPath(all, 'inv.bg')).toBe('art/intrface/invbox.frm');
    expect(resolveArtPath(all, 'inv.done.up')).toBe('art/intrface/lilredup.frm');
    expect(resolveArtPath(all, 'char.bg')).toBe('art/intrface/edtredt.frm');
    // po zamianie z opts.tab: up = opbtnoff (spoczynek), dn = opbtnon (wcisniety)
    expect(resolveArtPath(all, 'opts.tab.up')).toBe('art/intrface/opbtnoff.frm');
    expect(resolveArtPath(all, 'opts.tab.dn')).toBe('art/intrface/opbtnon.frm');
    expect(resolveArtPath(lst, 'barter.bg.party')).toBe('art/intrface/trade.frm');
  });
});
