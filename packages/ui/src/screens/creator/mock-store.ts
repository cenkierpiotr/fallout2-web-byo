import { useEffect, useState } from 'preact/hooks';
import {
  STAT_MAX,
  STAT_MIN,
  TAGS_REQUIRED,
  TRAITS_MAX,
  type CreatorCommands,
  type CreatorReason,
  type CreatorResult,
  type CreatorView,
  type PresetItem,
} from './types';

/** Dane atrapy (w grze nazwy i opisy daja pliki MSG przez GameView). */
const STATS: [string, string][] = [
  ['Siła', 'Siła określa udźwig oraz obrażenia w walce wręcz.'],
  ['Percepcja', 'Percepcja wpływa na zasięg ataków i wykrywanie pułapek.'],
  ['Wytrzymałość', 'Wytrzymałość daje punkty życia i odporności.'],
  ['Charyzma', 'Charyzma decyduje o reakcjach rozmówców i liczbie kompanów.'],
  ['Inteligencja', 'Inteligencja wpływa na liczbę punktów umiejętności i dialogi.'],
  ['Zręczność', 'Zręczność daje punkty akcji i klasę pancerza.'],
  ['Szczęście', 'Szczęście wpływa na trafienia krytyczne i losowe zdarzenia.'],
];

/** [nazwa, baza, mnoznik, stat1, stat2|-1] */
const SKILLS: [string, number, number, number, number][] = [
  ['Broń palna', 5, 4, 5, -1],
  ['Broń ciężka', 0, 2, 5, -1],
  ['Broń energetyczna', 0, 2, 5, -1],
  ['Walka bez broni', 30, 2, 5, 0],
  ['Broń biała', 20, 2, 5, 0],
  ['Rzucanie', 0, 4, 5, -1],
  ['Pierwsza pomoc', 0, 2, 1, 4],
  ['Lekarz', 5, 1, 1, 4],
  ['Skradanie', 5, 3, 5, -1],
  ['Włamywanie', 10, 1, 1, 5],
  ['Kradzież', 0, 3, 5, -1],
  ['Pułapki', 10, 1, 1, 5],
  ['Nauka', 0, 4, 4, -1],
  ['Naprawa', 0, 3, 4, -1],
  ['Wymowa', 0, 5, 3, -1],
  ['Handel', 0, 4, 3, -1],
  ['Hazard', 0, 5, 6, -1],
  ['Survival', 0, 2, 2, 4],
];

const TRAITS: [string, string][] = [
  [
    'Szybki metabolizm',
    'Leczysz się szybciej, ale masz niższą odporność na promieniowanie i truciznę.',
  ],
  ['Zabijaka', 'Więcej siły, ale mniej punktów akcji.'],
  ['Drobna budowa', 'Większa zręczność, mniejszy udźwig.'],
  ['Jednoręczny', 'Lepsza celność jedną ręką, gorsza dwiema.'],
  ['Finezja', 'Częstsze trafienia krytyczne, mniejsze obrażenia.'],
  ['Kamikadze', 'Pierwszeństwo w walce kosztem pancerza.'],
  ['Ciężka ręka', 'Mocniejsze ciosy, słabsze krytyki.'],
  ['Szybkie strzelanie', 'Szybszy strzał bez celowania.'],
  ['Krwawa jatka', 'Walki kończą się widowiskowymi zgonami.'],
  ['Pechowiec', 'Krytyki częstsze dla wszystkich, także dla ciebie.'],
  ['Dobroduszny', 'Lepsze umiejętności towarzyskie i medyczne.'],
  ['Uzależnienie od chemii', 'Chemia działa dłużej, ale łatwo się uzależnić.'],
  ['Odporność na chemię', 'Rzadsze uzależnienia, krótsze działanie chemii.'],
  ['Urok osobisty', 'Lepsze reakcje przeciwnej płci.'],
  ['Wyszkolony', 'Więcej punktów umiejętności, perk co 4 poziomy.'],
  ['Utalentowany', 'Wyższe statystyki bazowe, mniej punktów umiejętności.'],
];

const PRESETS: (PresetItem & {
  gender: 'male' | 'female';
  age: number;
  tags: number[];
  traits: number[];
})[] = [
  {
    id: 'combat',
    name: 'Narg',
    bio: 'Narg to weteran plemiennych walk, silny i wytrzymały, wierzący w pięść zamiast słów.',
    special: [8, 5, 9, 3, 4, 7, 4],
    gender: 'male',
    age: 21,
    tags: [4, 0, 5],
    traits: [6, 15],
  },
  {
    id: 'stealth',
    name: 'Mingan',
    bio: 'Mingan woli ciszę i cień. Zamki i kieszenie nie mają przed nim tajemnic.',
    special: [5, 8, 4, 4, 5, 9, 5],
    gender: 'male',
    age: 32,
    tags: [8, 9, 10],
    traits: [14, 2],
  },
  {
    id: 'diplomat',
    name: 'Chitsa',
    bio: 'Chitsa rozwiązuje spory słowem i urokiem. Zna ceny wszystkiego i wartość ludzi.',
    special: [4, 5, 4, 10, 7, 6, 4],
    gender: 'female',
    age: 19,
    tags: [14, 15, 6],
    traits: [3, 13],
  },
];

interface State {
  name: string;
  age: number;
  gender: 'male' | 'female';
  presetId: string | null;
  special: number[];
  tags: number[];
  traits: number[];
}

const initialState = (): State => ({
  name: '',
  age: 25,
  gender: 'male',
  presetId: null,
  special: [5, 5, 5, 5, 5, 5, 5],
  tags: [],
  traits: [],
});

export interface MockCreatorStore {
  getView(): CreatorView;
  subscribe(fn: () => void): () => void;
  commands: CreatorCommands;
  isFinished(): boolean;
}

function buildView(s: State): CreatorView {
  const spent = s.special.reduce((a, b) => a + b, 0) - 35;
  const pointsLeft = 5 - spent;
  const reasons: CreatorReason[] = [];
  if (pointsLeft > 0) reasons.push('statPoints');
  if (s.tags.length < TAGS_REQUIRED) reasons.push('tags');
  if (s.name.trim() === '') reasons.push('name');
  const sp = s.special;
  const at = (i: number): number => sp[i] ?? 0;
  return {
    name: s.name,
    age: s.age,
    ageMin: 16,
    ageMax: 35,
    gender: s.gender,
    presetId: s.presetId,
    presets: PRESETS.map(({ id, name, bio, special }) => ({ id, name, bio, special })),
    stats: STATS.map(([name, description], id) => ({
      id,
      name,
      description,
      value: at(id),
      min: STAT_MIN,
      max: STAT_MAX,
    })),
    pointsLeft,
    skills: SKILLS.map(([name, base, mult, st1, st2], id) => {
      const tagged = s.tags.includes(id);
      const value = base + mult * (at(st1) + (st2 >= 0 ? at(st2) : 0)) + (tagged ? 20 : 0);
      return { id, name, description: `${name}: ${base} + ${mult} x atrybuty.`, value, tagged };
    }),
    tagsUsed: s.tags.length,
    traits: TRAITS.map(([name, description], id) => ({
      id,
      name,
      description,
      selected: s.traits.includes(id),
    })),
    traitsUsed: s.traits.length,
    derived: [
      { id: 'hp', value: 15 + at(0) + 2 * at(2) },
      { id: 'ap', value: 5 + Math.floor(at(5) / 2) },
      { id: 'ac', value: at(5) },
      { id: 'carry', value: 25 + 25 * at(0) },
    ],
    reasons,
    canFinish: reasons.length === 0,
  };
}

/** Atrapa magazynu kreatora (playground i e2e); prawdziwy adapter przyjdzie z GameView w Zadaniu 14. */
export function createMockCreatorStore(): MockCreatorStore {
  let state = initialState();
  let view = buildView(state);
  let finished = false;
  const listeners = new Set<() => void>();
  const ok: CreatorResult = { ok: true };
  const set = (next: State): CreatorResult => {
    state = next;
    view = buildView(state);
    listeners.forEach((fn) => fn());
    return ok;
  };
  const fail = (reason: string): CreatorResult => ({ ok: false, reason });

  const commands: CreatorCommands = {
    setName: (name) => set({ ...state, name: name.slice(0, 11) }),
    setAge: (age) => set({ ...state, age: Math.min(35, Math.max(16, Math.round(age))) }),
    setGender: (gender) => set({ ...state, gender }),
    applyPreset: (id) => {
      const p = PRESETS.find((x) => x.id === id);
      if (!p) return fail('unknownPreset');
      return set({
        name: p.name,
        age: p.age,
        gender: p.gender,
        presetId: p.id,
        special: [...p.special],
        tags: [...p.tags],
        traits: [...p.traits],
      });
    },
    adjustStat: (id, delta) => {
      const cur = state.special[id];
      if (cur === undefined) return fail('unknownStat');
      if (delta > 0 && view.pointsLeft <= 0) return fail('noPoints');
      if (delta > 0 && cur >= STAT_MAX) return fail('statMax');
      if (delta < 0 && cur <= STAT_MIN) return fail('statMin');
      const special = [...state.special];
      special[id] = cur + delta;
      return set({ ...state, special, presetId: null });
    },
    toggleTag: (id) => {
      if (id < 0 || id >= SKILLS.length) return fail('unknownSkill');
      if (state.tags.includes(id))
        return set({ ...state, tags: state.tags.filter((x) => x !== id) });
      if (state.tags.length >= TAGS_REQUIRED) return fail('tagsFull');
      return set({ ...state, tags: [...state.tags, id] });
    },
    toggleTrait: (id) => {
      if (id < 0 || id >= TRAITS.length) return fail('unknownTrait');
      if (state.traits.includes(id))
        return set({ ...state, traits: state.traits.filter((x) => x !== id) });
      if (state.traits.length >= TRAITS_MAX) return fail('traitsFull');
      return set({ ...state, traits: [...state.traits, id] });
    },
    finish: () => {
      if (!view.canFinish) return fail(view.reasons[0] ?? 'invalid');
      finished = true;
      listeners.forEach((fn) => fn());
      return ok;
    },
  };

  return {
    getView: () => view,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    commands,
    isFinished: () => finished,
  };
}

/** Hook: aktualny widok i flaga zakonczenia z atrapy. */
export function useMockCreator(store: MockCreatorStore): { view: CreatorView; finished: boolean } {
  const [, tick] = useState(0);
  useEffect(() => store.subscribe(() => tick((n) => n + 1)), [store]);
  return { view: store.getView(), finished: store.isFinished() };
}
