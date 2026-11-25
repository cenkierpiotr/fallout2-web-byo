/**
 * FID (identyfikator grafiki): dekodowanie pol i budowa sciezki wg `f2_fid_to_path` (0x419428)
 * oraz `f2_critter_anim_chars` (0x419314). Zob. dokumentacja techniczna
 */

export interface FidFields {
  /** bity 0..11: indeks wpisu w liscie LST typu. */
  index: number;
  /** bity 12..15: kod broni (krytery) / numer wariantu (glowy). */
  weapon: number;
  /** bity 16..23: id animacji. */
  anim: number;
  /** bity 24..27: typ obiektu (0..10 poprawne). */
  type: number;
  /** bity 28..30: kierunek (0 = .frm, 1..6 = .fr0..fr5). */
  orientation: number;
}

/** Rozbija FID na pola (maski z 0x419428; bit 31 nie jest czytany). */
export function decodeFid(fid: number): FidFields {
  return {
    index: fid & 0xfff,
    weapon: (fid & 0xf000) >>> 12,
    anim: (fid & 0xff0000) >>> 16,
    type: (fid & 0xf000000) >>> 24,
    orientation: (fid & 0x70000000) >>> 28,
  };
}

/** Katalogi typow 0..10 (art\<katalog>\<katalog>.lst), kolejnosc tablicy 0x51073c. */
export const FID_TYPE_DIRS = [
  'items',
  'critters',
  'scenery',
  'walls',
  'tiles',
  'misc',
  'intrface',
  'inven',
  'heads',
  'backgrnd',
  'skilldex',
] as const;

/**
 * Dwa znaki sufiksu nazwy krytera: `first` = znak drukowany jako pierwszy (parametr wyjsciowy EBX
 * funkcji 0x419314), `second` = drugi (ECX). Zwraca null gdy blad (weapon poza 0..10 lub anim 0x26..0x2f
 * przy weapon 0). Kolejnosc warunkow odtworzona z dekompilacji.
 */
export function critterAnimChars(
  anim: number,
  weapon: number,
): { first: string; second: string } | null {
  if (weapon < 0 || weapon > 10) return null;
  const ch = (c: number): string => String.fromCharCode(c & 0xff);
  const wc = ch(weapon + 0x63); // w + 'c'
  if (anim > 0x25 && anim < 0x30) {
    if (weapon === 0) return null;
    return { first: wc, second: ch(anim + 0x3d) }; // a + '='
  }
  if (anim === 0x24) return { first: 'c', second: 'h' };
  if (anim === 0x25) return { first: 'c', second: 'j' };
  if (anim === 0x40) return { first: 'n', second: 'a' };
  if (anim > 0x2f) return { first: 'r', second: ch(anim + 0x31) }; // a + '1'
  if (anim > 0x13) return { first: 'b', second: ch(anim + 0x4d) }; // a + 'M'
  if (anim === 0x12) {
    if (weapon === 1) return { first: 'd', second: 'm' };
    if (weapon === 4) return { first: 'g', second: 'm' };
    return { first: 'a', second: 's' };
  }
  if (anim === 0xd) {
    return weapon > 0 ? { first: wc, second: 'e' } : { first: 'a', second: 'n' };
  }
  const second = ch(anim + 0x61); // a + 'a'
  if (anim < 2 && weapon > 0) return { first: wc, second };
  return { first: 'a', second };
}
