import { describe, expect, it } from 'vitest';
import {
  itemMenuEntries,
  itemOfAction,
  lookKey,
  MENU_ICON_PATH,
  menuEntries,
  menuIcon,
  radialLayout,
  radialScale,
  skillMenuEntries,
  skillOfAction,
} from './touch-menu';

describe('menuEntries', () => {
  it('pusty heks: tylko ruch i anuluj', () => {
    expect(menuEntries({ npc: false, objectType: null }).map((e) => e.action)).toEqual([
      'walk',
      'run',
      'cancel',
    ]);
  });
  it('NPC: dochodzi rozmowa i patrz', () => {
    expect(menuEntries({ npc: true, objectType: 1 }).map((e) => e.action)).toEqual([
      'talk',
      'look',
      'walk',
      'run',
      'cancel',
    ]);
  });
  it('obiekt bez NPC: patrz, bez rozmowy', () => {
    const a = menuEntries({ npc: false, objectType: 2 }).map((e) => e.action);
    expect(a).toContain('look');
    expect(a).not.toContain('talk');
  });
});

describe('menuEntries: akcje obiektu', () => {
  it('przedmiot na ziemi: Podnies + Patrz', () => {
    const a = menuEntries({ npc: false, objectType: 0, pickup: true }).map((e) => e.action);
    expect(a.slice(0, 2)).toEqual(['pickup', 'look']);
  });
  it('kolejnosc: talk, pickup, use, useItem, look, push', () => {
    const a = menuEntries({
      npc: true,
      objectType: 1,
      pickup: true,
      use: true,
      useItem: true,
      push: true,
    }).map((e) => e.action);
    expect(a.slice(0, 6)).toEqual(['talk', 'pickup', 'use', 'useItem', 'look', 'push']);
  });
  it('podmenu przedmiotow i rozbior akcji item:N', () => {
    const e = itemMenuEntries([{ id: 7, name: 'Stimpak' }]);
    expect(e.map((x) => x.action)).toEqual(['item:7', 'back']);
    expect(e[0]!.label).toBe('Stimpak');
    expect(itemOfAction('item:7')).toBe(7);
    expect(itemOfAction('use')).toBeNull();
  });
});

describe('lookKey', () => {
  it('mapuje typ obiektu na klucz i18n', () => {
    expect(lookKey(null)).toBe('look.nothing');
    expect(lookKey(1)).toBe('look.critter');
    expect(lookKey(0)).toBe('look.item');
    expect(lookKey(99)).toBe('look.other');
  });
});

describe('radialLayout', () => {
  const view = { w: 390, h: 700 };
  it('wszystkie przyciski mieszcza sie w widoku i maja min. 48 px', () => {
    for (const c of [
      { x: 5, y: 5 },
      { x: 385, y: 695 },
      { x: 195, y: 350 },
    ]) {
      const l = radialLayout(c, 5, view);
      expect(l.size).toBeGreaterThanOrEqual(48);
      expect(l.items).toHaveLength(5);
      for (const p of l.items) {
        expect(p.x - l.size / 2).toBeGreaterThanOrEqual(0);
        expect(p.y - l.size / 2).toBeGreaterThanOrEqual(0);
        expect(p.x + l.size / 2).toBeLessThanOrEqual(view.w);
        expect(p.y + l.size / 2).toBeLessThanOrEqual(view.h);
      }
    }
  });
  it('przyciski sie nie nakladaja', () => {
    const l = radialLayout({ x: 195, y: 350 }, 5, view);
    for (let i = 0; i < l.items.length; i++)
      for (let j = i + 1; j < l.items.length; j++) {
        const a = l.items[i]!;
        const b = l.items[j]!;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(l.size);
      }
  });
});

describe('menu skilli z kursora', () => {
  it('wpis skills tylko gdy cel ma uzywalne skille', () => {
    expect(
      menuEntries({ npc: false, objectType: 2, skills: [] }).map((e) => e.action),
    ).not.toContain('skills');
    expect(menuEntries({ npc: false, objectType: 2, skills: [9] }).map((e) => e.action)).toEqual([
      'look',
      'skills',
      'walk',
      'run',
      'cancel',
    ]);
  });
  it('podmenu: skille z szansa + wroc', () => {
    const e = skillMenuEntries([9, 11], (s) => (s === 9 ? 70 : 35));
    expect(e).toEqual([
      { action: 'skill:9', labelKey: 'skill.9', chance: 70 },
      { action: 'skill:11', labelKey: 'skill.11', chance: 35 },
      { action: 'back', labelKey: 'menu.back' },
    ]);
  });
  it('bez funkcji szansy brak pola chance', () => {
    expect(skillMenuEntries([6])[0]).toEqual({ action: 'skill:6', labelKey: 'skill.6' });
  });
  it('skillOfAction', () => {
    expect(skillOfAction('skill:10')).toBe(10);
    expect(skillOfAction('walk')).toBeNull();
  });
});

describe('skalowanie menu radialnego (duze ekrany / HD)', () => {
  it('radialScale: 1 na telefonie, 1.25 od 900 px, mnozy ui-scale i font-scale, clamp', () => {
    expect(radialScale({ w: 390, h: 844 })).toBe(1);
    expect(radialScale({ w: 1920, h: 1080 })).toBe(1.25);
    expect(radialScale({ w: 390, h: 844 }, 1.5, 1.2)).toBeCloseTo(1.8);
    expect(radialScale({ w: 3840, h: 2160 }, 2, 2)).toBe(2.5);
    expect(radialScale({ w: 390, h: 844 }, 0.1, NaN)).toBe(0.75);
  });
  it('wieksza skala = wieksze przyciski i promien, nadal w widoku', () => {
    const view = { w: 1920, h: 1080 };
    const a = radialLayout({ x: 960, y: 540 }, 6, view, 1);
    const b = radialLayout({ x: 960, y: 540 }, 6, view, 1.5);
    expect(b.size).toBeGreaterThan(a.size);
    expect(b.radius).toBeGreaterThan(a.radius);
    for (const p of b.items) {
      expect(p.x - b.size / 2).toBeGreaterThanOrEqual(0);
      expect(p.x + b.size / 2).toBeLessThanOrEqual(view.w);
    }
    // narozniki
    const c = radialLayout({ x: 1915, y: 1075 }, 6, view, 2);
    for (const p of c.items) {
      expect(p.x + c.size / 2).toBeLessThanOrEqual(view.w);
      expect(p.y + c.size / 2).toBeLessThanOrEqual(view.h);
    }
  });
  it('za duza skala na waskim widoku jest zmniejszana, by menu sie zmiescilo', () => {
    const view = { w: 390, h: 700 };
    const l = radialLayout({ x: 195, y: 350 }, 7, view, 2.5);
    expect(l.scale).toBeLessThan(2.5);
    for (const p of l.items) {
      expect(p.x - l.size / 2).toBeGreaterThanOrEqual(0);
      expect(p.x + l.size / 2).toBeLessThanOrEqual(view.w);
    }
  });
  it('promien rosnie z liczba wpisow tak, ze przyciski sie nie nakladaja przy skali', () => {
    const l = radialLayout({ x: 960, y: 540 }, 9, { w: 1920, h: 1080 }, 1.25);
    for (let i = 0; i < l.items.length; i++)
      for (let j = i + 1; j < l.items.length; j++)
        expect(
          Math.hypot(l.items[i]!.x - l.items[j]!.x, l.items[i]!.y - l.items[j]!.y),
        ).toBeGreaterThanOrEqual(l.size);
  });
});

describe('ikony menu radialnego', () => {
  it('kazda akcja ma ikone z niepusta sciezka', () => {
    for (const a of [
      'walk',
      'run',
      'talk',
      'look',
      'use',
      'pickup',
      'push',
      'useItem',
      'cancel',
      'skills',
      'back',
      'skill:9',
      'item:3',
    ] as const) {
      expect(MENU_ICON_PATH[menuIcon(a)].length).toBeGreaterThan(5);
    }
    expect(menuIcon('skill:9')).toBe('skill');
    expect(menuIcon('item:3')).toBe('item');
  });
});
