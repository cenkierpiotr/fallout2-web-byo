import type { PartyMemberDef } from '@f2/formats';
import { PARTY_ORDER_KEYS, type PartyOrders } from '@f2/rules';
import type { PartyState } from '@f2/engine-core';

/** Wiersz okna rozkazow: czlonek, dozwolone opcje z party.txt (per klucz) i aktualne rozkazy. */
export interface PartyOrdersRow {
  objId: number;
  pid: number;
  options: Record<keyof PartyOrders, readonly string[]>;
  orders: PartyOrders;
}

/** Model okna rozkazow dla UI: wszyscy towarzysze (bez gracza), z mozliwymi opcjami. */
export function partyOrdersView(
  party: PartyState,
  defs: readonly PartyMemberDef[],
): PartyOrdersRow[] {
  const rows: PartyOrdersRow[] = [];
  party.entries.forEach((e, i) => {
    if (i === 0) return;
    const def = defs.find((d) => d.pid === e.pid) ?? defs.find((d) => d.levelPids.includes(e.pid));
    if (!def) return;
    const options = {} as Record<keyof PartyOrders, readonly string[]>;
    for (const k of PARTY_ORDER_KEYS) options[k] = def[k];
    rows.push({ objId: e.objId, pid: e.pid, options, orders: party.ordersOf(e.objId) });
  });
  return rows;
}

/** Ustawia jeden rozkaz; false gdy czlonka brak albo wartosc spoza listy dozwolonych. */
export function setPartyOrder(
  party: PartyState,
  objId: number,
  key: keyof PartyOrders,
  value: string,
): boolean {
  const v = party.setOrders(objId, { [key]: value });
  return !!v && v.rejected.length === 0;
}
