/**
 * Typy widoku handlu (Zadanie 29-31 planu M4-M5: `BarterView`, komendy `barter.*`).
 * Ceny i akceptacje liczy `BarterSession` (@f2/engine-core) z regulami @f2/rules; adapter
 * `createBarterBinding` (@f2/app) mapuje ja na te typy. Ekran niczego nie przelicza sam.
 */
import type { ItemView } from '../inventory/types';

export type BarterSide = 'player' | 'merchant';

/** Przedmiot handlu: pole `tradeable` = false oznacza przedmiot nie na sprzedaz (np. questowy). */
export interface BarterItem extends ItemView {
  tradeable: boolean;
}

/** Parametry cennika (do opisu; cene liczy sesja). */
export interface BarterParams {
  merchantBarter: number;
  partyBestBarter: number;
  barterMod: number;
  masterTrader: boolean;
}

/** Sumy z sesji: cena oferty gracza, wartosc stolu kupca, czy oferta wystarcza. */
export interface BarterTotalsView {
  offer: number;
  wanted: number;
  balanced: boolean;
}

export interface BarterView {
  merchantName: string;
  /** Inwentarze poza stolami. */
  player: BarterItem[];
  merchant: BarterItem[];
  /** Stoly ofert (przedmioty przeniesione z inwentarza strony o tej samej nazwie). */
  tablePlayer: BarterItem[];
  tableMerchant: BarterItem[];
  params: BarterParams;
  totals: BarterTotalsView;
  /**
   * Tryb pojemnika (loot/kradziez): bez cennika; oferta = masa stolu gracza, liczy sie udzwig
   * obu stron (odmowy player-cannot-carry i merchant-cannot-carry).
   */
  containerMode: boolean;
  /**
   * Handlu z czlonkiem druzyny: oryginal uzywa wtedy osobnego tla trade.frm (id 421) zamiast
   * barter.frm (id 112). Brak pola = zwykly handel z NPC (kompatybilnosc ze starymi adapterami).
   */
  party?: boolean;
}

export type BarterRefusal =
  'player-cannot-carry' | 'merchant-cannot-carry' | 'not-tradeable' | 'offer-too-low';

export type BarterReason =
  | BarterRefusal
  | 'count-exceeds'
  | 'not-found'
  | 'empty-table'
  | 'session-closed'
  | 'not-enough-caps'
  | 'nothing-to-balance'
  | 'unknown';

export type BarterResult = { ok: true } | { ok: false; reason: BarterReason };

export interface BarterCommands {
  /** Przenosi `count` sztuk: `to` 'table' (z inwentarza na stol) albo 'inventory' (ze stolu z powrotem). */
  move(side: BarterSide, itemId: number, count: number, to: 'table' | 'inventory'): BarterResult;
  accept(): BarterResult;
  /** Dokłada kapsle gracza na stol, az oferta pokryje stol kupca. */
  balance(): BarterResult;
  /** Zamyka handel, oddajac przedmioty ze stolow do wlascicieli. */
  cancel(): void;
}
