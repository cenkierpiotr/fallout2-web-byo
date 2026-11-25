import { signal } from '@preact/signals';
import { tutorialHint, type TutorialEvent } from './onboarding';

const KEY = 'f2.tutorial';

export interface TutorialStore {
  fired: Set<string>;
  /** Uzytkownik pominal wszystkie podpowiedzi. */
  off: boolean;
}

/** Biezaca podpowiedz do pokazania w grze (null = brak). */
export const currentHint = signal<TutorialEvent | null>(null);

const EVENTS: readonly string[] = ['move', 'interact', 'actionMenu', 'inventory', 'save'];

export function loadTutorial(): TutorialStore {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (typeof v === 'object' && v !== null) {
      const { fired, off } = v as { fired?: unknown; off?: unknown };
      return {
        fired: new Set(
          Array.isArray(fired)
            ? fired.filter((e): e is string => typeof e === 'string' && EVENTS.includes(e))
            : [],
        ),
        off: off === true,
      };
    }
  } catch {
    /* brak storage albo zly JSON */
  }
  return { fired: new Set(), off: false };
}

export function saveTutorial(s: TutorialStore): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ fired: [...s.fired], off: s.off }));
  } catch {
    /* ignoruj */
  }
}

let store: TutorialStore | null = null;
const get = (): TutorialStore => (store ??= loadTutorial());

/** Wywolaj przy zdarzeniu w grze; pokazuje podpowiedz tylko raz (zapamietane) i tylko gdy samouczek nie jest pominiety. */
export function fireHint(ev: TutorialEvent): TutorialEvent | null {
  const s = get();
  if (s.off) return null;
  const shown = tutorialHint(s.fired, ev);
  if (shown) {
    saveTutorial(s);
    currentHint.value = shown;
  }
  return shown;
}

export const dismissHint = (): void => {
  currentHint.value = null;
};

export function skipTutorial(): void {
  const s = get();
  s.off = true;
  saveTutorial(s);
  currentHint.value = null;
}

/** Tylko dla testow: wyczysc pamiec modulu i podpowiedz. */
export function resetTutorialForTest(): void {
  store = null;
  currentHint.value = null;
}

/** Podpowiedz po dotknieciu mapy: obiekt obsluzony = interakcja, puste pole = ruch. */
export const hintForTap = (handled: boolean): TutorialEvent | null =>
  fireHint(handled ? 'interact' : 'move');

/** Podpowiedz po klawiszu: F5 = szybki zapis. */
export const hintForKey = (key: string): TutorialEvent | null =>
  key === 'F5' ? fireHint('save') : null;

/** Podpowiedz po otwarciu menu akcji (PPM / long press na obiekcie). */
export const hintForMenu = (): TutorialEvent | null => fireHint('actionMenu');
