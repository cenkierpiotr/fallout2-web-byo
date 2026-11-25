// Reputacja/karma (R17-U3, D dla tytulu ogolnego; townReputationLabel Z). Loader karmavar/genrep D.
export interface GenrepRule {
  threshold: number;
  nameMsg: number;
}
export interface KarmaVarRule {
  gvar: number;
  pic: number;
  nameMsg: number;
  descriptionMsg: number;
}

/**
 * Tytul ogolnej reputacji (0x4390d0, D): tablica w KOLEJNOSCI PLIKU, pierwszy wpis z `threshold <= karma`.
 * Bez sortowania. Brak trafienia -> null (nic nie jest wypisywane).
 */
export function generalReputationTitle(
  karma: number,
  genrep: readonly GenrepRule[],
): number | null {
  const hit = genrep.find((g) => g.threshold <= karma);
  return hit ? hit.nameMsg : null;
}

/** Tytuly karmy: gvar != 0, z pominieciem gvar 0 (sama reputacja). Z: wykluczenie gvar 0. */
export function karmaTitles(
  gvars: (i: number) => number,
  karmavar: readonly KarmaVarRule[],
): { pic: number; nameMsg: number; descriptionMsg: number }[] {
  return karmavar
    .filter((k) => k.gvar !== 0 && gvars(k.gvar) !== 0)
    .map((k) => ({ pic: k.pic, nameMsg: k.nameMsg, descriptionMsg: k.descriptionMsg }));
}

/** msgId etykiet reputacji miasta w editor.msg (2000..2006). */
export const TOWN_REP_MSG = {
  idolized: 2000,
  liked: 2001,
  accepted: 2002,
  neutral: 2003,
  disliked: 2004,
  hated: 2005,
  vilified: 2006,
} as const;

/**
 * Etykieta reputacji miasta (editor.msg 2000..2006). Progi z drzewa ikon w 0x43bce0 (D): 30, 1, 0, -16, -31
 * (ikony 0x87/0x89/0x8d/0x99/0x96); podzial 15 i -15 oraz przypisanie msgId do przedzialow Z.
 * Wartosc spoza int/NaN -> neutralna.
 */
export function townReputationLabel(value: number): number {
  if (!Number.isFinite(value)) return TOWN_REP_MSG.neutral;
  const v = Math.trunc(value);
  if (v >= 30) return TOWN_REP_MSG.idolized;
  if (v >= 15) return TOWN_REP_MSG.liked;
  if (v >= 1) return TOWN_REP_MSG.accepted;
  if (v === 0) return TOWN_REP_MSG.neutral;
  if (v >= -15) return TOWN_REP_MSG.disliked;
  if (v >= -30) return TOWN_REP_MSG.hated;
  return TOWN_REP_MSG.vilified;
}
