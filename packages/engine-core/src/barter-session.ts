/** Sesja handlu (dokumentacja techniczna): stoly gracza i kupca, cena, akceptacja, wymiana. */

export interface BarterItem {
  id: string;
  pid: number;
  count: number;
  /** Wartosc jednostkowa. */
  value: number;
  /** Masa jednostkowa. */
  weight: number;
  /** Przedmiot zablokowany do sprzedazy (np. zalozony). */
  blocked?: boolean;
}

export type BarterSide = 'player' | 'merchant';
export type BarterAcceptResult =
  | 'ok'
  | 'player-cannot-carry'
  | 'merchant-cannot-carry'
  | 'not-tradeable'
  | 'offer-too-low'
  /** Sesja juz zakonczona (po 'ok' lub cancel); odrebny wynik, nie 'offer-too-low'. */
  | 'session-closed';

/** Funkcje logiki z @f2/rules wstrzykiwane przez wolajacego (engine-core nie zalezy od rules). */
export interface BarterRules {
  barterPrice(i: {
    value: number;
    caps: number;
    merchantBarter: number;
    partyBestBarter: number;
    barterMod: number;
    masterTrader: boolean;
  }): number;
  splitCaps(entries: readonly { pid: number; count: number; value: number }[]): {
    value: number;
    caps: number;
  };
  barterAccept(i: {
    offer: number;
    merchantTableValue: number;
    merchantTableEmpty: boolean;
    playerBlocked: boolean;
    playerFreeCarry: number;
    merchantGoodsWeight: number;
    containerMode?: boolean;
    merchantFreeCarry?: number;
    playerGoodsWeight?: number;
  }): BarterAcceptResult;
}

export interface BarterParams {
  merchantBarter: number;
  partyBestBarter: number;
  barterMod: number;
  masterTrader: boolean;
  /** Wolny udzwig gracza przy pustych stolach (Carry Weight minus masa ekwipunku); przedmioty na stole zwiekszaja go o swoja mase. */
  playerFreeCarry: number;
  /** Tryb pojemnika (loot/kradziez): kontrola udzwigu drugiej strony, ceny = masy stolow. */
  containerMode?: boolean;
  /** Wolny udzwig drugiej strony przy pustych stolach (tylko tryb pojemnika). */
  merchantFreeCarry?: number;
}

export interface BarterTotals {
  /** Cena oferty gracza. */
  offer: number;
  /** Wartosc stolu kupca. */
  merchantValue: number;
  balanced: boolean;
}

function cloneItem(i: BarterItem, count: number): BarterItem {
  return { ...i, count };
}

function addStack(list: BarterItem[], item: BarterItem): void {
  const s = list.find((x) => x.id === item.id);
  if (s) s.count += item.count;
  else list.push(cloneItem(item, item.count));
}

function takeStack(list: BarterItem[], id: string, count: number): BarterItem | null {
  const s = list.find((x) => x.id === id);
  // tylko dodatnie liczby calkowite (odrzuca ulamki, NaN, Infinity)
  if (!s || !Number.isInteger(count) || count <= 0 || count > s.count) return null;
  const taken = cloneItem(s, count);
  s.count -= count;
  if (s.count === 0) list.splice(list.indexOf(s), 1);
  return taken;
}

export class BarterSession {
  readonly playerInv: BarterItem[];
  readonly merchantInv: BarterItem[];
  readonly playerTable: BarterItem[] = [];
  readonly merchantTable: BarterItem[] = [];
  private closed = false;

  constructor(
    playerInv: readonly BarterItem[],
    merchantInv: readonly BarterItem[],
    private readonly params: BarterParams,
    private readonly rules: BarterRules,
  ) {
    this.playerInv = playerInv.map((i) => cloneItem(i, i.count));
    this.merchantInv = merchantInv.map((i) => cloneItem(i, i.count));
  }

  private lists(side: BarterSide): { inv: BarterItem[]; table: BarterItem[] } {
    return side === 'player'
      ? { inv: this.playerInv, table: this.playerTable }
      : { inv: this.merchantInv, table: this.merchantTable };
  }

  /** Przenosi count sztuk z ekwipunku strony na jej stol. Zwraca false przy bledzie. */
  addToTable(side: BarterSide, id: string, count = 1): boolean {
    if (this.closed) return false;
    const { inv, table } = this.lists(side);
    const t = takeStack(inv, id, count);
    if (!t) return false;
    addStack(table, t);
    return true;
  }

  /** Zdejmuje count sztuk ze stolu strony z powrotem do jej ekwipunku. */
  removeFromTable(side: BarterSide, id: string, count = 1): boolean {
    if (this.closed) return false;
    const { inv, table } = this.lists(side);
    const t = takeStack(table, id, count);
    if (!t) return false;
    addStack(inv, t);
    return true;
  }

  private static weight(list: readonly BarterItem[]): number {
    return list.reduce((w, i) => w + i.weight * i.count, 0);
  }

  totals(): BarterTotals {
    if (this.params.containerMode) {
      const offer = BarterSession.weight(this.playerTable);
      // ODSTEPSTWO (dokumentacja techniczna): w trybie pojemnika oryginal porownuje oferte (masa stolu
      // gracza) z "wartoscia" stolu drugiej strony 0x477dac; tu merchantValue = 0 i balanced = true,
      // wiec liczy sie tylko udzwig (kontrole 1-2) oraz niepusty stol (kontrola 4).
      return { offer, merchantValue: 0, balanced: true };
    }
    const { value, caps } = this.rules.splitCaps(this.playerTable);
    const offer = this.rules.barterPrice({
      value,
      caps,
      merchantBarter: this.params.merchantBarter,
      partyBestBarter: this.params.partyBestBarter,
      barterMod: this.params.barterMod,
      masterTrader: this.params.masterTrader,
    });
    const merchantValue = this.merchantTable.reduce((s, i) => s + i.value * i.count, 0);
    return { offer, merchantValue, balanced: offer >= merchantValue && merchantValue > 0 };
  }

  /** Probuje zaakceptowac wymiane; przy 'ok' przenosi przedmioty miedzy ekwipunkami i zamyka sesje. */
  accept(): BarterAcceptResult {
    if (this.closed) return 'session-closed';
    const t = this.totals();
    const res = this.rules.barterAccept({
      offer: t.offer,
      merchantTableValue: t.merchantValue,
      // kontrola 4 dotyczy tez trybu pojemnika: gdy oba stoly puste, brak transakcji
      merchantTableEmpty: this.params.containerMode
        ? this.merchantTable.length === 0 && this.playerTable.length === 0
        : this.merchantTable.length === 0,
      playerBlocked: this.playerTable.some((i) => i.blocked),
      playerFreeCarry: this.params.playerFreeCarry + BarterSession.weight(this.playerTable),
      merchantGoodsWeight: BarterSession.weight(this.merchantTable),
      ...(this.params.containerMode
        ? {
            containerMode: true,
            merchantFreeCarry:
              (this.params.merchantFreeCarry ?? 0) + BarterSession.weight(this.merchantTable),
            playerGoodsWeight: BarterSession.weight(this.playerTable),
          }
        : {}),
    });
    if (res !== 'ok') return res;
    for (const i of this.playerTable) addStack(this.merchantInv, i);
    for (const i of this.merchantTable) addStack(this.playerInv, i);
    this.playerTable.length = 0;
    this.merchantTable.length = 0;
    this.closed = true;
    return 'ok';
  }

  /**
   * Dokłada kapsle gracza na jego stol, az oferta pokryje stol kupca.
   * Kapsle sa liczone 1:1 (bez mnoznika Barter). Przy braku kapsli stol bez zmian.
   */
  balance(capsPid = 0x29): 'ok' | 'not-enough-caps' | 'nothing-to-balance' {
    if (this.closed || this.params.containerMode) return 'nothing-to-balance';
    const t = this.totals();
    if (this.merchantTable.length === 0 || t.offer >= t.merchantValue) return 'nothing-to-balance';
    const stack = this.playerInv.find((i) => i.pid === capsPid);
    const need = t.merchantValue - t.offer;
    if (!stack || stack.count < need) return 'not-enough-caps';
    this.addToTable('player', stack.id, need);
    return 'ok';
  }

  /** Anuluje: wszystko ze stolow wraca do wlascicieli. */
  cancel(): void {
    for (const i of [...this.playerTable]) this.removeFromTable('player', i.id, i.count);
    for (const i of [...this.merchantTable]) this.removeFromTable('merchant', i.id, i.count);
    this.closed = true;
  }

  get isClosed(): boolean {
    return this.closed;
  }
}
