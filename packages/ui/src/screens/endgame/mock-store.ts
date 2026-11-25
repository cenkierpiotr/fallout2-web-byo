import { signal, type Signal } from '@preact/signals';
import type {
  CreditsLineView,
  EndgameCommands,
  EndgameScreenId,
  EndgameSlideView,
  EndgameView,
} from './types';

export interface MockEndgameOptions {
  /** Ekran poczatkowy (domyslnie 'endgame'). */
  start?: EndgameScreenId;
  slides?: EndgameSlideView[];
  deathText?: string;
  credits?: CreditsLineView[];
  lastSave?: string | null;
}

export const MOCK_SLIDES: EndgameSlideView[] = [
  {
    art: 440,
    text: 'Po zniszczeniu Enklawy uchodzcy z Arroyo osiedlili sie na nowo.',
    pan: 0,
    narrator: 'nar_ar1',
  },
  { art: 327, text: 'Pustynia rozciagala sie az po horyzont.', pan: -1, narrator: 'nar_ar2' },
  { art: 446, text: 'Modoc kwitl jeszcze wiele lat.', pan: 1, narrator: 'nar_mo1' },
];

export const MOCK_CREDITS: CreditsLineView[] = [
  { kind: 'title', text: 'Fallout 2' },
  { kind: 'blank', text: '' },
  { kind: 'section', text: 'Projekt' },
  { kind: 'name', text: 'Imie Nazwisko' },
  { kind: 'name', text: 'Inne Imie' },
];

/** Atrapa przebiegu zakonczenia (adapter na EndgameFlow w apps/web): ten sam graf przejsc co w flow. */
export function createMockEndgame(opts: MockEndgameOptions = {}) {
  const slides = opts.slides ?? MOCK_SLIDES;
  const start = opts.start ?? 'endgame';
  let index = 0;
  const first = start === 'endgame' ? (slides[0] ?? null) : null;
  const view: Signal<EndgameView> = signal({
    screen: start,
    slide:
      start === 'death'
        ? { art: 309, text: opts.deathText ?? 'Zginales w pustyni.', pan: 0, narrator: 'generic1' }
        : first,
    credits: opts.credits ?? MOCK_CREDITS,
    lastSave: opts.lastSave ?? null,
  });
  const calls: string[] = [];
  const set = (p: Partial<EndgameView>) => {
    view.value = { ...view.value, ...p };
  };
  const commands: EndgameCommands = {
    advance() {
      calls.push('advance');
      const cur = view.value;
      if (cur.screen === 'endgame') {
        index += 1;
        const next = slides[index];
        if (next) set({ slide: next });
        else set({ screen: 'credits', slide: null });
      } else if (cur.screen === 'death') {
        set({ screen: 'main-menu', slide: null });
      }
    },
    finishCredits() {
      calls.push('finishCredits');
      if (view.value.screen === 'credits') set({ screen: 'main-menu' });
    },
    newGame: () => void calls.push('newGame'),
    load: () => void calls.push('load'),
    loadLast: () => void calls.push('loadLast'),
    openSettings: () => void calls.push('openSettings'),
    showCredits() {
      calls.push('showCredits');
      set({ screen: 'credits' });
    },
    quit: () => void calls.push('quit'),
  };
  return { view, commands, calls };
}
