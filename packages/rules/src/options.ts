/** Opcje regul (ADR-0004): `classicMode` = zachowanie oryginalu, domyslnie false = poprawione. */
export interface RulesOptions {
  classicMode: boolean;
}

export const defaultRulesOptions: RulesOptions = { classicMode: false };
