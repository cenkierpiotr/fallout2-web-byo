import { parseCredits, type CreditsLine, type DeathSlide, type EndgameSlide } from '@f2/formats';
import { selectDeath } from '../endgame/select-death.js';
import { selectEndgameSlides } from '../endgame/select-slides.js';
import type { GvarReader } from '../endgame/gvar-registry.js';
import { createSignal, type Signal } from '../game-view.js';

/** Id ekranu aktywnego w przebiegu zakonczenia i smierci. */
export type EndgameScreenId = 'game' | 'endgame' | 'death' | 'credits' | 'main-menu';

/** Slajd widoczny w UI: art = numer wiersza intrface.lst (FID typu intrface), pan = kierunek panoramy. */
export interface EndgameSlideView {
  art: number;
  text: string;
  pan: -1 | 0 | 1;
  narrator: string;
}

export interface EndgameViewState {
  screen: EndgameScreenId;
  slide: EndgameSlideView | null;
  /** Slajdy pokazane w tym przebiegu (do testow i smoke M10). */
  history: EndgameSlideView[];
  credits: CreditsLine[];
  /** Identyfikator ostatniego zapisu (po smierci menu proponuje wczytanie) lub null. */
  lastSave: string | null;
}

export type SpeechResult = 'finished' | 'skipped' | 'missing';

export interface EndgameDeps {
  endgameTable: readonly EndgameSlide[];
  deathTable: readonly DeathSlide[];
  gvars: GvarReader;
  isAreaKnown: (id: number) => boolean;
  level: number;
  rng: { int(min: number, max: number): number };
  /** Katalog jezyka tekstow gry (`english`, `polish`). */
  lang: string;
  speech: { play(path: string): Promise<SpeechResult>; stop(): void };
  /** Tekst z VFS (`text/<lang>/cuts/<nar>.txt`, `text/<lang>/credits.txt`) lub null, gdy brak pliku. */
  loadText(path: string): Promise<string | null>;
  /** Odtwarzacz filmow (MvePlayer.play); wynik tekstowy zgodny z MovieResult. */
  movie: { play(name: string): Promise<string> };
  lastSave(): Promise<string | null>;
  /** Oczekiwanie (domyslnie setTimeout); wstrzykiwane dla testow. */
  delay?: (ms: number) => Promise<void>;
}

/** art\intrface\death.frm (intrface id 309, spec screens.md). */
export const DEATH_ART = 309;
/** Timeout ekranu smierci bez pliku mowy (spec screens.md pkt 7). */
export const DEATH_NO_SPEECH_TIMEOUT_MS = 3000;
/** Ogon po zakonczeniu bez klawisza (spec screens.md pkt 8). */
export const DEATH_TAIL_MS = 500;

/**
 * Tekst narracji do napisow: wiersze "N:tekst" -> tekst (prefiks numeru usuwany, spec screens.md pkt 4),
 * koncowy znak `#` pomijany (znacznik konca bloku; Z: znaczenie niepotwierdzone), wiersze sklejone spacja.
 */
export function cleanNarration(raw: string): string {
  return raw
    .split(/\r\n|\r|\n/)
    .map((l) =>
      l
        .replace(/^\s*\d+:/, '')
        .replace(/#\s*$/, '')
        .trim(),
    )
    .filter((l) => l !== '')
    .join(' ');
}

const speechPath = (nar: string): string => `sound/speech/narrator/${nar.toLowerCase()}.acm`;

/**
 * Przebieg zakonczenia gry i smierci (logika bez UI). Slajdy -> film credits -> napisy -> menu;
 * smierc -> slajd smierci -> menu z propozycja wczytania ostatniego zapisu.
 * UI czyta `view` (sygnal) i woła `advance()` (klawisz/tap) oraz `finishCredits()` (koniec/ESC napisow).
 */
export class EndgameFlow {
  readonly view: Signal<EndgameViewState>;
  private advanceWaiters = new Set<() => void>();
  private creditsWaiters = new Set<() => void>();
  private readonly visited = new Set<EndgameScreenId>();
  private screenWaiters: { screen: EndgameScreenId; resolve: () => void }[] = [];

  constructor(private readonly deps: EndgameDeps) {
    this.view = createSignal<EndgameViewState>({
      screen: 'game',
      slide: null,
      history: [],
      credits: [],
      lastSave: null,
    });
  }

  /** Kolejny slajd / koniec biezacej narracji (klawisz, tap). */
  advance(): void {
    for (const w of [...this.advanceWaiters]) w();
  }

  /** Koniec napisow (przewiniecie do konca lub ESC). */
  finishCredits(): void {
    for (const w of [...this.creditsWaiters]) w();
  }

  /** Czeka, az przebieg dojdzie do ekranu (takze gdy juz tam byl). Dla testow i harnessu. */
  waitFor(screen: EndgameScreenId): Promise<void> {
    if (this.visited.has(screen)) return Promise.resolve();
    return new Promise((resolve) => this.screenWaiters.push({ screen, resolve }));
  }

  async run(): Promise<void> {
    this.visited.clear();
    this.patch({ history: [], credits: [], slide: null, lastSave: null });
    const slides = selectEndgameSlides(this.deps.endgameTable, this.deps.gvars);
    this.setScreen('endgame');
    for (const s of slides) {
      const text = await this.narrationText(s.narrator);
      const slide: EndgameSlideView = { art: s.art, text, pan: s.direction, narrator: s.narrator };
      this.patch({ slide, history: [...this.view.value.history, slide] });
      await this.playNarration(s.narrator);
    }
    this.patch({ slide: null });
    // Z: czy film credits.mve idzie przed napisami tekstowymi (spec screens.md: osobna sciezka gmovie_play)
    await this.deps.movie.play('credits');
    const raw = await this.deps.loadText(`text/${this.deps.lang}/credits.txt`);
    this.patch({ credits: raw === null ? [] : parseCredits(raw) });
    this.setScreen('credits');
    await new Promise<void>((resolve) => {
      const done = () => {
        this.creditsWaiters.delete(done);
        resolve();
      };
      this.creditsWaiters.add(done);
    });
    await this.toMainMenu();
  }

  /** reason: 0 zwykla smierc, 1 bez Modoc, 2 timeout (patrz selectDeath). */
  async runDeath(reason: 0 | 1 | 2 = 0): Promise<void> {
    this.visited.clear();
    this.patch({ history: [], credits: [], slide: null, lastSave: null });
    const row = selectDeath(this.deps.deathTable, {
      gvars: this.deps.gvars,
      areaKnown: this.deps.isAreaKnown,
      level: this.deps.level,
      reason,
      rng: this.deps.rng,
    });
    if (row) {
      const text = await this.narrationText(row.narrator);
      const slide: EndgameSlideView = { art: DEATH_ART, text, pan: 0, narrator: row.narrator };
      this.setScreen('death');
      this.patch({ slide, history: [slide] });
      const r = await this.playNarration(row.narrator, true);
      if (r === 'finished') await this.delay(DEATH_TAIL_MS);
    }
    this.patch({ slide: null });
    await this.toMainMenu();
  }

  private async toMainMenu(): Promise<void> {
    const lastSave = await this.deps.lastSave();
    this.patch({ slide: null, lastSave });
    this.setScreen('main-menu');
  }

  private delay(ms: number): Promise<void> {
    return this.deps.delay ? this.deps.delay(ms) : new Promise((r) => setTimeout(r, ms));
  }

  private async narrationText(narrator: string): Promise<string> {
    const raw = await this.deps.loadText(
      `text/${this.deps.lang}/cuts/${narrator.toLowerCase()}.txt`,
    );
    return raw === null ? '' : cleanNarration(raw);
  }

  /**
   * Odtwarza mowe; konczy sie przy koncu pliku, advance() albo (brak pliku, smierc) po timeoucie.
   * Przy braku pliku poza smiercia przechodzi dalej od razu (UI i tak pokazuje tekst do advance()).
   */
  private async playNarration(narrator: string, timeoutWhenMissing = false): Promise<SpeechResult> {
    let skipped = false;
    let release: () => void = () => {};
    const advanced = new Promise<void>((resolve) => {
      release = () => {
        skipped = true;
        this.advanceWaiters.delete(release);
        resolve();
      };
      this.advanceWaiters.add(release);
    });
    const speech = this.deps.speech.play(speechPath(narrator));
    const result = await Promise.race([speech, advanced.then((): SpeechResult => 'skipped')]);
    if (skipped) {
      this.deps.speech.stop();
    } else {
      this.advanceWaiters.delete(release);
      if (result === 'missing' && timeoutWhenMissing) {
        await Promise.race([this.delay(DEATH_NO_SPEECH_TIMEOUT_MS), advanced]);
        this.advanceWaiters.delete(release);
      }
    }
    return skipped ? 'skipped' : result;
  }

  private setScreen(screen: EndgameScreenId): void {
    this.patch({ screen });
    this.visited.add(screen);
    const ready = this.screenWaiters.filter((w) => w.screen === screen);
    this.screenWaiters = this.screenWaiters.filter((w) => w.screen !== screen);
    for (const w of ready) w.resolve();
  }

  private patch(p: Partial<EndgameViewState>): void {
    this.view.value = { ...this.view.value, ...p };
  }
}
