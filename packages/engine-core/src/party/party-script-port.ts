import { PARTY_OBJ_FLAGS, canRecruit, type PartyAddCode } from '@f2/rules';
import type { PartyState } from './party-state.js';

export interface PartyAddResponse {
  code: PartyAddCode;
  flags?: number;
  objId?: number;
}

/**
 * Port dla opkodow VM party_add / party_remove (M3 podpina implementacje, ten pakiet nie zalezy od VM).
 * Obiekt swiata aktualizuje wywolujacy: ustawia `flags` i `objId` ze zwroconej odpowiedzi.
 */
export interface PartyScriptPort {
  partyAdd(obj: { objId: number; pid: number; flags: number }): PartyAddResponse;
  /** `flags` = biezace flagi obiektu; zwraca flagi po zdjeciu bitow druzyny (Z). */
  partyRemove(objId: number, flags?: number): { removed: boolean; flags?: number };
  isPartyMember(objId: number): boolean;
  partyMemberCount(): number;
}

/** Adapter nad PartyState. `limit` (opcjonalny): aktualny partyLimit gracza, -1 gdy brak miejsca (Z: w oryginale skrypty). */
export class PartyScriptAdapter implements PartyScriptPort {
  constructor(
    private readonly state: PartyState,
    private readonly limit?: () => number,
  ) {}

  partyAdd(obj: { objId: number; pid: number; flags: number }): PartyAddResponse {
    const dup = this.state.entries.some((e) => e.objId === obj.objId || e.pid === obj.pid);
    if (!dup && this.limit && !canRecruit(this.limit(), this.state.memberCount))
      return { code: -1 };
    return this.state.add(obj);
  }

  partyRemove(objId: number, flags?: number): { removed: boolean; flags?: number } {
    if (!this.state.remove(objId)) return { removed: false };
    return flags === undefined
      ? { removed: true }
      : { removed: true, flags: (flags & ~PARTY_OBJ_FLAGS) >>> 0 };
  }

  isPartyMember(objId: number): boolean {
    return this.state.has(objId);
  }

  partyMemberCount(): number {
    return this.state.memberCount;
  }
}
