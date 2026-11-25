// Model druzyny (R17, dokumentacja techniczna). Struktury bez zaleznosci od @f2/formats.

/** Podzbior PartyMemberDef (party.txt) potrzebny regulom awansu. */
export interface PartyLevelDef {
  levelMinimum: number;
  levelUpEvery: number;
  levelPids: number[];
}

/** Liczniki awansu czlonka: bloki [0], [1], [2] z partyMemberIncLevels 0x495b60 (D). */
export interface PartyLevelCounters {
  /** [0]: liczba zastosowanych awansow */
  applied: number;
  /** [1]: ile razy sprawdzono (poziom gracza >= level_minimum) */
  checks: number;
  /** [2]: flaga "awans losowy juz wykonany w tym cyklu" */
  roll: boolean;
}

export const NEW_PARTY_COUNTERS: Readonly<PartyLevelCounters> = {
  applied: 0,
  checks: 0,
  roll: false,
};

/** Wpis listy druzyny (0x10 B w oryginale: obiekt, 0, 0). Indeks 0 = gracz. */
export interface PartyEntry {
  objId: number;
  pid: number;
  counters: PartyLevelCounters;
}
