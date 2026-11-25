/** Handel (barter): czyste funkcje wg dokumentacja techniczna (R18b). */

export const CAPS_PID = 0x29;
export const MASTER_TRADER_DISCOUNT = 25;
export const BARTER_MIN_MOD = 0.01;

export interface BarterPriceInput {
  /** Wartosc towaru na stole bez kapsli (suma wartosci minus kapsle). */
  value: number;
  /** Kapsle na stole (nie mnozone). */
  caps: number;
  /** Poziom skilla Barter strony B (kupca). */
  merchantBarter: number;
  /** Najlepszy Barter w druzynie. */
  partyBestBarter: number;
  /** barter_mod ustawiany skryptem (0 = standardowa cena). */
  barterMod: number;
  /** A to gracz z perkiem Master Trader. */
  masterTrader: boolean;
}

/** Cena transakcji: trunc(2*V*ratio*mod + caps). */
export function barterPrice(i: BarterPriceInput): number {
  const ratio = (i.merchantBarter + 160) / (160 + i.partyBestBarter);
  const disc = i.masterTrader ? MASTER_TRADER_DISCOUNT : 0;
  let mod = (i.barterMod + 100 - disc) * 0.01;
  if (mod < 0) mod = BARTER_MIN_MOD;
  return Math.trunc(2 * i.value * ratio * mod + i.caps);
}

/**
 * f2_party_best_skill 0x4955c8 (D): maksimum skill_level po liscie druzyny (0x519da8, w ktorej na pierwszym miejscu
 * jest gracz: dodany w 0x488940 przy inicjacji). Pomija obiekty z flaga +0x24 & 1 (ukryte) i nie-krytery;
 * wynik startuje od 0 i rosnie tylko przy wartosci wiekszej, wiec nigdy nie jest ujemny.
 */
export function partyBestSkill(levels: readonly number[]): number {
  let best = 0;
  for (const l of levels) if (l > best) best = l;
  return best;
}

export interface BarterEntry {
  pid: number;
  count: number;
  value: number;
}

/** Rozdziela wartosc stolu na czesc towarowa i kapsle (pid 0x29). */
export function splitCaps(entries: readonly BarterEntry[]): { value: number; caps: number } {
  let value = 0;
  let caps = 0;
  for (const e of entries) {
    if (e.pid === CAPS_PID) caps += e.count;
    else value += e.value * e.count;
  }
  return { value, caps };
}

export type BarterAcceptResult =
  'ok' | 'player-cannot-carry' | 'merchant-cannot-carry' | 'not-tradeable' | 'offer-too-low';

export interface BarterAcceptInput {
  /** Cena oferty gracza (barterPrice). */
  offer: number;
  /** Wartosc stolu kupca (suma wartosci, wlacznie z kapslami). */
  merchantTableValue: number;
  /** Czy stol kupca jest pusty. */
  merchantTableEmpty: boolean;
  /** Czy na stole gracza jest przedmiot zablokowany do sprzedazy. */
  playerBlocked: boolean;
  /** Wolny udzwig gracza oraz masa towaru kupca. */
  playerFreeCarry: number;
  merchantGoodsWeight: number;
  /** Tylko tryb pojemnika: kontrola drugiej strony. */
  containerMode?: boolean;
  merchantFreeCarry?: number;
  playerGoodsWeight?: number;
}

/** Kontrole 1-4 z f2_barter_attempt (kolejnosc jak w oryginale). */
export function barterAccept(i: BarterAcceptInput): BarterAcceptResult {
  if (i.playerFreeCarry < i.merchantGoodsWeight) return 'player-cannot-carry';
  if (i.containerMode && (i.merchantFreeCarry ?? 0) < (i.playerGoodsWeight ?? 0)) {
    return 'merchant-cannot-carry';
  }
  if (!i.containerMode && i.playerBlocked) return 'not-tradeable';
  if (i.merchantTableEmpty || i.offer < i.merchantTableValue) return 'offer-too-low';
  return 'ok';
}
