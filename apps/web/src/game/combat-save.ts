import type { CombatController, CombatSave } from './combat-controller';

/** Klucz zapisu trwajacej walki w `SessionState.modData` (Zadanie 43). */
export const COMBAT_KEY = 'combat';

/** Minimalny widok sesji: tylko modData. */
export interface CombatSaveHost {
  state: { modData: Record<string, unknown> };
}

/** Zapisuje stan walki do modData; `null` albo zakonczona walka czyszcza wpis (zapis poza walka). */
export function saveCombat(session: CombatSaveHost, ctl: CombatController | null): void {
  const snap = ctl?.snapshot() ?? null;
  if (snap) session.state.modData[COMBAT_KEY] = snap;
  else delete session.state.modData[COMBAT_KEY];
}

/** Zapis walki z modData (do `CombatController.restore`) albo undefined, gdy zapis byl poza walka. */
export function loadCombatSave(session: CombatSaveHost): CombatSave | undefined {
  const j = session.state.modData[COMBAT_KEY] as CombatSave | undefined;
  return j && j.version === 1 ? j : undefined;
}
