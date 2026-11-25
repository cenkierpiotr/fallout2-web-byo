import { signal, type ReadonlySignal } from '@preact/signals';

/** Ekrany przeplywu gry: menu -> kreator -> gra -> smierc/zakonczenie -> napisy -> menu. */
export type FlowScreen = 'menu' | 'creator' | 'playing' | 'death' | 'ending' | 'credits';

const ALLOWED: Record<FlowScreen, readonly FlowScreen[]> = {
  menu: ['creator', 'playing', 'credits'],
  creator: ['menu', 'playing'],
  playing: ['menu', 'death', 'ending'],
  death: ['menu', 'playing', 'credits'],
  ending: ['credits', 'menu'],
  credits: ['menu'],
};

/** Maszyna stanow przeplywu aplikacji; niedozwolone przejscia sa ignorowane (zwraca false). */
export class GameFlow {
  private readonly _screen = signal<FlowScreen>('menu');
  /** Powod smierci (tekst/kod) do ekranu smierci. */
  readonly deathReason = signal<string>('');
  /** Ostatni zapis (do "wczytaj ostatni"). */
  readonly lastSave = signal<string | null>(null);

  get screen(): ReadonlySignal<FlowScreen> {
    return this._screen;
  }

  private go(to: FlowScreen): boolean {
    if (!ALLOWED[this._screen.value].includes(to)) return false;
    this._screen.value = to;
    return true;
  }

  newGame(): boolean {
    return this.go('creator');
  }
  /** Koniec kreatora albo wczytanie zapisu: wchodzimy do gry. */
  startPlaying(): boolean {
    return this.go('playing');
  }
  die(reason = ''): boolean {
    if (!this.go('death')) return false;
    this.deathReason.value = reason;
    return true;
  }
  endGame(): boolean {
    return this.go('ending');
  }
  showCredits(): boolean {
    return this.go('credits');
  }
  toMenu(): boolean {
    return this.go('menu');
  }
  noteSave(id: string): void {
    this.lastSave.value = id;
  }
}
