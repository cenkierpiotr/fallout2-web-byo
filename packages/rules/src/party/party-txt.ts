// party.txt -> rekord 200 B (0xc8), loader 0x493bc0 (R17-U5, D). Kolejnosc kluczy w pliku nie ma znaczenia.
export interface PartyTxtField {
  key: string;
  offset: number;
  /** Adres tabeli nazw enum w silnik gry. */
  table: number;
  entries: number;
}

export const PARTY_TXT_FIELDS: readonly PartyTxtField[] = [
  { key: 'area_attack_mode', offset: 0x00, table: 0x51806c, entries: 5 },
  { key: 'run_away_mode', offset: 0x14, table: 0x518080, entries: 7 },
  { key: 'best_weapon', offset: 0x30, table: 0x51809c, entries: 8 },
  { key: 'distance', offset: 0x50, table: 0x5180bc, entries: 5 },
  { key: 'attack_who', offset: 0x64, table: 0x5180d0, entries: 5 },
  { key: 'chem_use', offset: 0x78, table: 0x5180e4, entries: 6 },
  { key: 'disposition', offset: 0x90, table: 0x5180fc, entries: 6 },
];

/** Inne pola rekordu: level_minimum +0xa8, level_up_every +0xac, licznik level_pids +0xb0, level_pids +0xb4.. (max 5). */
export const PARTY_RECORD_SIZE = 0xc8;

/** Opcja o danym indeksie enum ustawia int32 = 1 pod offset + 4 * indeks. */
export function partyTxtOffset(key: string, enumIndex: number): number {
  const f = PARTY_TXT_FIELDS.find((x) => x.key === key);
  if (!f) throw new Error(`party.txt: nieznany klucz ${key}`);
  if (!Number.isInteger(enumIndex) || enumIndex < 0 || enumIndex >= f.entries) {
    throw new Error(`party.txt: indeks ${enumIndex} poza zakresem ${key}`);
  }
  return f.offset + 4 * enumIndex;
}
