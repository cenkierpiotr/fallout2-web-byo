/**
 * Reguly gry z flagami poprawek wzgledem oryginalu (ADR-0004). Kazda poprawka ma wpis
 * "Odchylenie od oryginalu" w odpowiedniej specyfikacji.
 */
export interface Rules {
  fixes: {
    /**
     * Limit rozmiaru list otwartych i zamknietych w A* (pathfinding.md sekcja 1). Oryginal: 2000
     * (tryb klasyczny), co obcina dalekie szukanie. Domyslnie 40000 (liczba heksow), czyli brak
     * sztucznego limitu.
     */
    pathNodeLimit: number;
  };
}

export const CLASSIC_PATH_NODE_LIMIT = 2000;

export const DEFAULT_RULES: Rules = { fixes: { pathNodeLimit: 40000 } };
export const CLASSIC_RULES: Rules = { fixes: { pathNodeLimit: CLASSIC_PATH_NODE_LIMIT } };

/** Buduje `Rules` z flag `rules.fixes.*` (rejestr w @f2/rules): `pathNodeLimit` wlaczony = limit 40000. */
export function rulesFromFixes(flags: Readonly<Record<string, boolean>>): Rules {
  return flags['pathNodeLimit'] === false || flags['pathNodeLimit'] === undefined
    ? CLASSIC_RULES
    : DEFAULT_RULES;
}
