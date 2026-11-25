/**
 * Lokalne typy widoku zakonczenia, smierci, napisow i menu glownego. Odpowiadaja `EndgameViewState`
 * z engine-core (packages/engine-core/src/flow/endgame-flow.ts); UI nie zalezy od engine-core.
 */

export type EndgameScreenId = 'game' | 'endgame' | 'death' | 'credits' | 'main-menu';

export interface EndgameSlideView {
  /** Numer wiersza intrface.lst (FID typu intrface). */
  art: number;
  text: string;
  /** Kierunek panoramy: -1 w lewo, 0 brak, 1 w prawo. */
  pan: -1 | 0 | 1;
  narrator: string;
}

export interface CreditsLineView {
  kind: 'section' | 'title' | 'name' | 'blank';
  text: string;
}

export interface EndgameView {
  screen: EndgameScreenId;
  slide: EndgameSlideView | null;
  credits: CreditsLineView[];
  /** Identyfikator ostatniego zapisu lub null. */
  lastSave: string | null;
}

export interface EndgameCommands {
  /** Kolejny slajd / koniec narracji (klawisz, tap). */
  advance(): void;
  /** Koniec napisow (dojscie do konca lub ESC). */
  finishCredits(): void;
  newGame(): void;
  load(): void;
  loadLast(): void;
  openSettings(): void;
  showCredits(): void;
  /** Brak w PWA: przycisk wyjscia jest wtedy ukryty (canQuit=false). */
  quit?(): void;
}

/** Zamiana numeru art na adres obrazu (HD/baza z assets); undefined = obraz zastepczy. */
export type ArtUrl = (art: number) => string | undefined;

/** Predkosc przewijania napisow: oryginal 1 rzad / 38 ms (spec screens.md), ok. 26 px/s. */
export const CREDITS_SPEED_PX_PER_S = 26;
/** Wysokosc wiersza napisow w px (zalozenie UI; oryginal: wysokosc czcionki 104, Z). */
export const CREDITS_LINE_PX = 28;
