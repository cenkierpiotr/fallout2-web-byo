/** Czysta logika menu akcji (long press / PPM) na mapie: wpisy, klucze i18n, uklad radialny. */

export type SkillMenuAction = `skill:${number}`;
export type ItemMenuAction = `item:${number}`;
export type MenuAction =
  | 'walk'
  | 'run'
  | 'talk'
  | 'look'
  | 'use'
  | 'pickup'
  | 'push'
  | 'useItem'
  | 'cancel'
  | 'skills'
  | 'back'
  | SkillMenuAction
  | ItemMenuAction;

export interface MenuEntry {
  action: MenuAction;
  labelKey: string;
  /** Gotowa etykieta (np. nazwa przedmiotu); ma pierwszenstwo przed `labelKey`. */
  label?: string;
  /** Szansa skilla (0..95) do pokazania przy wpisie `skill:N` (ustawienie showSkillCheckPercent). */
  chance?: number;
}

export interface MenuTarget {
  /** Krytyk ze skryptem rozmowy na heksie. */
  npc: boolean;
  /** Typ pierwszego widocznego obiektu na heksie (0 przedmiot ... 5 inne); null = pusty heks. */
  objectType: number | null;
  /** Skille mozliwe do uzycia na obiekcie (wpis `skills` otwiera ich podmenu). */
  skills?: number[];
  /** Skrypt obiektu ma use_p_proc albo obiekt jest sceneria do uzycia. */
  use?: boolean;
  /** Obiekt jest przedmiotem do podniesienia (lub pojemnikiem do otwarcia). */
  pickup?: boolean;
  /** Krytyk ze skryptem push_p_proc. */
  push?: boolean;
  /** Gracz ma przedmiot, ktory mozna uzyc na obiekcie (skrypt ma use_obj_on_p_proc). */
  useItem?: boolean;
}

type FixedAction = Exclude<MenuAction, SkillMenuAction | ItemMenuAction>;
const ENTRY: Record<FixedAction, MenuEntry> = {
  use: { action: 'use', labelKey: 'menu.use' },
  pickup: { action: 'pickup', labelKey: 'menu.pickup' },
  push: { action: 'push', labelKey: 'menu.push' },
  useItem: { action: 'useItem', labelKey: 'menu.useItem' },
  walk: { action: 'walk', labelKey: 'menu.walk' },
  run: { action: 'run', labelKey: 'menu.run' },
  talk: { action: 'talk', labelKey: 'menu.talk' },
  look: { action: 'look', labelKey: 'menu.look' },
  cancel: { action: 'cancel', labelKey: 'menu.cancel' },
  skills: { action: 'skills', labelKey: 'menu.skills' },
  back: { action: 'back', labelKey: 'menu.back' },
};

export function menuEntries(target: MenuTarget): MenuEntry[] {
  const out: MenuEntry[] = [];
  if (target.npc) out.push(ENTRY.talk);
  if (target.pickup) out.push(ENTRY.pickup);
  if (target.use) out.push(ENTRY.use);
  if (target.useItem) out.push(ENTRY.useItem);
  if (target.objectType !== null) out.push(ENTRY.look);
  if (target.push) out.push(ENTRY.push);
  if (target.skills && target.skills.length > 0) out.push(ENTRY.skills);
  out.push(ENTRY.walk, ENTRY.run, ENTRY.cancel);
  return out;
}

/** Rozbija akcje `skill:N` na numer skilla; inne akcje daja null. */
export function skillOfAction(a: MenuAction): number | null {
  const m = /^skill:(\d+)$/.exec(a);
  return m ? Number(m[1]) : null;
}

/** Podmenu skilli z kursora: jeden wpis na skill (z szansa, gdy podana) + Wroc. */
export function skillMenuEntries(
  skills: number[],
  chance?: (skill: number) => number,
): MenuEntry[] {
  const out: MenuEntry[] = skills.map((s) => {
    const e: MenuEntry = { action: `skill:${s}`, labelKey: `skill.${s}` };
    if (chance) e.chance = chance(s);
    return e;
  });
  out.push(ENTRY.back);
  return out;
}

/** Podmenu przedmiotow gracza do uzycia na obiekcie + Wroc. */
export function itemMenuEntries(items: Array<{ id: number; name: string }>): MenuEntry[] {
  const out: MenuEntry[] = items.map((i) => ({
    action: `item:${i.id}`,
    labelKey: 'menu.useItem',
    label: i.name,
  }));
  out.push(ENTRY.back);
  return out;
}

/** Rozbija akcje `item:ID` na id przedmiotu; inne akcje daja null. */
export function itemOfAction(a: MenuAction): number | null {
  const m = /^item:(\d+)$/.exec(a);
  return m ? Number(m[1]) : null;
}

const LOOK_KEYS = [
  'look.item',
  'look.critter',
  'look.scenery',
  'look.wall',
  'look.other',
  'look.other',
];

export function lookKey(objectType: number | null): string {
  if (objectType === null) return 'look.nothing';
  return LOOK_KEYS[objectType] ?? 'look.other';
}

export interface RadialLayout {
  size: number;
  radius: number;
  /** Mnoznik uzyty do rozmiaru przyciskow i promienia. */
  scale: number;
  items: Array<{ x: number; y: number }>;
}

/** Min. cel dotykowy (px) z docs/design sekcja 8; menu radialne uzywa duzych ikon. */
export const RADIAL_BUTTON = 56;

/**
 * Mnoznik menu radialnego: ustawienia `--ui-scale` i `--font-scale` (clamp 0.75..2) oraz
 * dodatkowy ~1.25x na duzych ekranach (krotszy bok widoku >= 900 px, np. tablet/HD),
 * gdzie 56 px jest za male wzgledem reszty UI. Wynik w 0.75..2.5.
 */
export function radialScale(view: { w: number; h: number }, uiScale = 1, fontScale = 1): number {
  const clamp = (v: number): number => (Number.isFinite(v) ? Math.min(2, Math.max(0.75, v)) : 1);
  const big = Math.min(view.w, view.h) >= 900 ? 1.25 : 1;
  return Math.min(2.5, clamp(uiScale) * clamp(fontScale) * big);
}

/**
 * Srodki przyciskow rozlozone rownomiernie na okregu wokol `center` (start u gory).
 * Srodek okregu jest przesuwany tak, by kazdy przycisk zmiescil sie w widoku.
 * Gdy skalowane menu nie miesci sie w widoku, skala jest zmniejszana (nigdy ponizej 0.5),
 * a cel dotykowy zostaje jak najwiekszy.
 */
export function radialLayout(
  center: { x: number; y: number },
  count: number,
  view: { w: number; h: number },
  scale = 1,
): RadialLayout {
  const build = (sc: number): { size: number; radius: number; m: number } => {
    const size = Math.round(RADIAL_BUTTON * sc);
    // promien: przyciski sasiednie dotykaja sie najwyzej bokiem (odleglosc >= size), min 72 px * skala
    const chord = count > 1 ? size / (2 * Math.sin(Math.PI / count)) : 0;
    const radius = Math.max(Math.round(72 * sc), Math.ceil(chord) + 4);
    return { size, radius, m: radius + size / 2 };
  };
  let sc = scale;
  let g = build(sc);
  // skurcz, gdy srednica menu przekracza krotszy bok widoku
  const limit = Math.min(view.w, view.h);
  while (sc > 0.5 && 2 * g.m > limit) {
    sc = Math.max(0.5, sc - 0.05);
    g = build(sc);
  }
  const { size, radius, m } = g;
  const cx = Math.min(Math.max(center.x, m), Math.max(m, view.w - m));
  const cy = Math.min(Math.max(center.y, m), Math.max(m, view.h - m));
  const items = Array.from({ length: count }, (_, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / count;
    return { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) };
  });
  return { size, radius, scale: sc, items };
}

/** Identyfikatory ikon menu radialnego (rysowane jako inline SVG w MapView). */
export type MenuIcon =
  | 'talk'
  | 'look'
  | 'use'
  | 'pickup'
  | 'push'
  | 'useItem'
  | 'walk'
  | 'run'
  | 'cancel'
  | 'skills'
  | 'back'
  | 'skill'
  | 'item';

export function menuIcon(a: MenuAction): MenuIcon {
  if (a.startsWith('skill:')) return 'skill';
  if (a.startsWith('item:')) return 'item';
  return a as MenuIcon;
}

/** Sciezki SVG (viewBox 24x24, obrys, bez wypelnienia) dla kazdej ikony. */
export const MENU_ICON_PATH: Record<MenuIcon, string> = {
  talk: 'M4 5h16v10H9l-5 4z',
  look: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 100 6 3 3 0 000-6z',
  use: 'M7 11V6a2 2 0 014 0v5m0-1a2 2 0 014 0v1m0-1a2 2 0 014 0v4a6 6 0 01-6 6h-1a6 6 0 01-5-3l-3-5a2 2 0 013-2l1 1',
  pickup: 'M12 3v12m-5-5l5 5 5-5M5 20h14',
  push: 'M4 12h14m-5-5l5 5-5 5M20 5v14',
  useItem: 'M5 9h14v11H5zM9 9V6a3 3 0 016 0v3',
  walk: 'M12 4a2 2 0 100 4 2 2 0 000-4zM12 9v6l-3 6m3-6l3 6M8 11l4-2 4 2',
  run: 'M13 4a2 2 0 100 4 2 2 0 000-4zM10 20l2-6-3-2 2-4 4 2 3 1M7 11l2-1',
  cancel: 'M6 6l12 12M18 6L6 18',
  skills: 'M12 3l2.5 6 6.5.5-5 4.2 1.6 6.3L12 16.5 6.4 20l1.6-6.3-5-4.2L9.5 9z',
  back: 'M10 6l-6 6 6 6M4 12h16',
  skill: 'M12 3l2.5 6 6.5.5-5 4.2 1.6 6.3L12 16.5 6.4 20l1.6-6.3-5-4.2L9.5 9z',
  item: 'M5 9h14v11H5zM9 9V6a3 3 0 016 0v3',
};
