// Wybor reki/trybu ataku i drugi tryb AP broni (silnik gry, odtworzone z asemblera; D chyba ze zaznaczono Z).

/**
 * Reka wybrana przez tryb ataku w item_w_ap_cost (0x478b24, tablica skokow 0x478b04, tryby 0..7):
 * 0,1,6 -> 0x471bbc (przedmiot z flaga +0x27 & 1), 2,3,7 -> 0x471b70 (flaga +0x27 & 2); tryby 4,5 i > 7 -> brak broni (ebx = 0).
 * Nazwy 'A'/'B' neutralne: ktora to lewa/prawa reka jest Z.
 */
export function attackModeHand(mode: number): 'A' | 'B' | null {
  if (mode === 0 || mode === 1 || mode === 6) return 'A';
  if (mode === 2 || mode === 3 || mode === 7) return 'B';
  return null;
}

export interface AiSecondaryModeInput {
  /** Bron w rece (0x429db4: ebp != 0); brak -> tryb 4 (piesc). */
  hasWeapon: boolean;
  /** 0x477afc(bron) == 3 (typ przedmiotu: bron, wartosc 3 jako warunek, nazwa Z). */
  isWeaponType: boolean;
  /** Klasa broni w trybie 3 (0x478280(bron, 3)); 0 -> tryb 2. */
  classOfSecondary: number;
  /** 0x4298ec(critter, bron, 3) != 0: bron uzywalna w trybie 3. */
  usable: boolean;
  /** Brak pakietu AI (0x4280b4 == 0) -> 4. */
  packetMissing?: boolean;
  /** Flaga obszaru z area_attack_mode (mayUseAreaWeapon; unset/sometimes/be_*). */
  areaFlag: boolean;
  /** 0x42938c: klasa jest na liscie preferencji pakietu (tablica 0x518158 wg best_weapon). */
  classPreferred?: boolean;
  /** Klasa 3 (rzut): 0x4299a0(..., 0, cel) == 0 (brak innej broni do wziecia; semantyka funkcji Z). */
  noOtherWeapon?: boolean;
  /** Klasa 3: wynik 0x4afa78(critter, stat 4, 0, 0) > 1 (rzut na Inteligencje udany). */
  intRollSuccess?: boolean;
}

/**
 * Wybor trybu glownego (2) albo wtornego (3) broni AI po flagach obszaru; tryb 4 = piesc (0x429db4, D).
 * Zwraca 2, 3 albo 4.
 */
export function aiSecondaryModeChoice(i: AiSecondaryModeInput): 2 | 3 | 4 {
  if (!i.hasWeapon || !i.isWeaponType) return 4;
  if (i.classOfSecondary === 0 || !i.usable) return 2;
  if (i.packetMissing) return 4;
  if (!i.areaFlag || !i.classPreferred) return 2;
  if (i.classOfSecondary === 3 && i.noOtherWeapon && i.intRollSuccess) return 2;
  return 3;
}
