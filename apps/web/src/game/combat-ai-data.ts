import type { AiPacketTable } from '@f2/rules';

/**
 * Dane AI walki zaladowane z gry (AI.TXT, combatai.msg). Ustawia je `loadGameTables`; `CombatController`
 * uzywa ich domyslnie, wiec UI nie musi niczego przekazywac. Brak danych = proste AI bez taunta.
 */
export interface CombatAiData {
  ai: AiPacketTable;
  combatMsg: ReadonlyMap<number, string>;
}

let data: CombatAiData | null = null;

export function setCombatAiData(d: CombatAiData | null): void {
  data = d;
}

export function getCombatAiData(): CombatAiData | null {
  return data;
}
