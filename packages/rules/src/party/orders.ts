// Rozkazy dla towarzyszy (Zadanie 38, M7): walidacja wg list `allowed` z party.txt i nalozenie na pakiet AI.
// Z: dokladny kod okna rozkazow exe nie jest zdekompilowany; reguly wynikaja z party.txt (opcje wymienione
// w polu sekcji = dozwolone) i enumow AI. Rozkaz spoza listy jest odrzucany.
import {
  BEST_WEAPON_NAMES,
  CHEM_USE_NAMES,
  RUN_AWAY_NAMES,
  type AiAreaMode,
  type AiAttackWho,
  type AiDistance,
  type AiPacket,
} from '../combat/ai-packet.js';

/** Podzbior PartyMemberDef (party.txt) z listami dozwolonych opcji. */
export interface PartyAllowedDef {
  areaAttackMode: readonly string[];
  attackWho: readonly string[];
  bestWeapon: readonly string[];
  chemUse: readonly string[];
  distance: readonly string[];
  runAwayMode: readonly string[];
}

export interface PartyOrders {
  areaAttackMode?: string;
  attackWho?: string;
  bestWeapon?: string;
  chemUse?: string;
  distance?: string;
  runAwayMode?: string;
}

export const PARTY_ORDER_KEYS = [
  'areaAttackMode',
  'attackWho',
  'bestWeapon',
  'chemUse',
  'distance',
  'runAwayMode',
] as const satisfies readonly (keyof PartyOrders)[];

export interface OrdersValidation {
  accepted: PartyOrders;
  /** Klucze odrzucone (wartosc spoza listy `allowed` albo nieznana nazwa enum). */
  rejected: (keyof PartyOrders)[];
}

/** Zwraca tylko rozkazy dozwolone dla czlonka; reszta trafia do `rejected`. */
export function validateOrders(def: PartyAllowedDef, orders: PartyOrders): OrdersValidation {
  const accepted: PartyOrders = {};
  const rejected: (keyof PartyOrders)[] = [];
  for (const k of PARTY_ORDER_KEYS) {
    const v = orders[k];
    if (v === undefined) continue;
    if (def[k].includes(v)) accepted[k] = v;
    else rejected.push(k);
  }
  return { accepted, rejected };
}

/** Nakłada zatwierdzone rozkazy na pakiet AI czlonka (zwraca nowy pakiet, wejscie bez zmian). */
export function applyPartyOrders(packet: AiPacket, orders: PartyOrders): AiPacket {
  const out: AiPacket = { ...packet };
  if (orders.distance !== undefined) out.distance = orders.distance as AiDistance;
  if (orders.attackWho !== undefined) out.attackWho = orders.attackWho as AiAttackWho;
  if (orders.areaAttackMode !== undefined) out.areaMode = orders.areaAttackMode as AiAreaMode;
  if (orders.bestWeapon !== undefined) {
    const i = BEST_WEAPON_NAMES.indexOf(orders.bestWeapon as never);
    if (i >= 0) out.bestWeapon = i;
  }
  if (orders.chemUse !== undefined) {
    const i = CHEM_USE_NAMES.indexOf(orders.chemUse as never);
    if (i >= 0) out.chemUse = i;
  }
  if (orders.runAwayMode !== undefined) {
    // jak loader AI: indeks tablicy minus 1, 'never' (6) -> 5
    const i = RUN_AWAY_NAMES.indexOf(orders.runAwayMode as never);
    if (i >= 0) out.runAwayIndex = Math.min(5, i - 1);
  }
  return out;
}
