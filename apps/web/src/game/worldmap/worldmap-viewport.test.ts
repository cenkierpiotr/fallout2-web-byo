import { describe, expect, it } from 'vitest';
import {
  DragTracker,
  SCREEN_H,
  SCREEN_W,
  VIEW_H,
  VIEW_W,
  VIEW_X,
  VIEW_Y,
  centerOn,
  clampScroll,
  clientToView,
  fitScale,
  inView,
  maxScroll,
  viewToWorld,
  worldToView,
} from './worldmap-viewport';
import { WORLD_H, WORLD_W } from './worldmap-data';

describe('worldmap-viewport', () => {
  it('clamp: do granic swiata minus okno', () => {
    expect(clampScroll({ x: -50, y: -1 })).toEqual({ x: 0, y: 0 });
    expect(clampScroll({ x: 99999, y: 99999 })).toEqual(maxScroll());
    expect(maxScroll()).toEqual({ x: WORLD_W - VIEW_W, y: WORLD_H - VIEW_H });
    expect(clampScroll({ x: 10.6, y: 20.4 })).toEqual({ x: 11, y: 20 });
  });
  it('centerOn: srodek okna na punkcie, przyciety przy krawedziach', () => {
    expect(centerOn(700, 750)).toEqual({ x: 700 - VIEW_W / 2, y: Math.round(750 - VIEW_H / 2) });
    expect(centerOn(0, 0)).toEqual({ x: 0, y: 0 });
    expect(centerOn(WORLD_W, WORLD_H)).toEqual(maxScroll());
  });
  it('view <-> world sa odwrotne', () => {
    const s = { x: 120, y: 300 };
    const w = viewToWorld(10, 20, s);
    expect(w).toEqual({ x: 130, y: 320 });
    expect(worldToView(w.x, w.y, s)).toEqual({ x: 10, y: 20 });
    expect(viewToWorld(-5000, 99999, s)).toEqual({ x: 0, y: WORLD_H - 1 });
  });
  it('inView z marginesem', () => {
    const s = { x: 0, y: 0 };
    expect(inView(10, 10, s)).toBe(true);
    expect(inView(VIEW_W + 5, 10, s)).toBe(false);
    expect(inView(VIEW_W + 5, 10, s, 10)).toBe(true);
  });
  it('clientToView: skalowanie ekranu, poza oknem = null', () => {
    const box = { width: 320, height: 240 }; // polowa skali
    expect(clientToView(0, 0, box)).toBeNull();
    const p = clientToView((VIEW_X + 100) / 2, (VIEW_Y + 50) / 2, box)!;
    expect(p.x).toBeCloseTo(100);
    expect(p.y).toBeCloseTo(50);
    expect(clientToView(320 - 1, 240 - 1, box)).toBeNull();
    expect(SCREEN_W / SCREEN_H).toBeCloseTo(4 / 3);
  });
  it('fitScale: dopasowanie do szerokosci i limit', () => {
    expect(fitScale(320)).toBeCloseTo(0.5);
    expect(fitScale(640)).toBe(1);
    expect(fitScale(5000)).toBe(1.5);
  });
  it('DragTracker: maly ruch = tap, duzy = drag z przyrostami', () => {
    const d = new DragTracker(6);
    d.start(100, 100);
    expect(d.move(102, 101)).toBeNull();
    expect(d.end()).toBe('tap');
    d.start(100, 100);
    expect(d.move(90, 100)).toEqual({ dx: 10, dy: 0 });
    expect(d.move(85, 110)).toEqual({ dx: 5, dy: -10 });
    expect(d.end()).toBe('drag');
    expect(d.end()).toBe('none');
    expect(d.move(1, 1)).toBeNull();
  });
});

import {
  KEY_SCROLL_STEP,
  PANEL,
  arrowHit,
  encounterIconIndex,
  gaugeFill,
  homeScroll,
  keyScroll,
  clampLabelScroll,
  clientToScreen,
  inLabelPanel,
  labelRowY,
  labelScrollMax,
  dialFrame,
  entranceHit,
  labelHit,
} from './worldmap-viewport';

describe('worldmap-viewport: panel', () => {
  it('labelHit: wiersze, przerwy, limit', () => {
    const L = PANEL.labels;
    expect(labelHit(L.x + 5, L.y + 2, 3)).toBe(0);
    expect(labelHit(L.x + 5, L.y + L.step + 2, 3)).toBe(1);
    expect(labelHit(L.x + 5, L.y + L.h + 0.5, 3)).toBe(-1);
    expect(labelHit(L.x + 5, L.y + 2 * L.step + 1, 2)).toBe(-1);
    expect(labelHit(L.x - 1, L.y + 2, 3)).toBe(-1);
    expect(labelHit(L.x + 5, L.y + 100 * L.step, 99)).toBe(-1);
  });
  it('labelHit przy przewinieciu: pelny skok i przesuniecie czesciowe', () => {
    const L = PANEL.labels;
    expect(labelHit(L.x + 5, L.y + 2, 20, L.step)).toBe(1);
    // przewiniecie o 10 px: pierwsza etykieta zaczyna sie 10 px wyzej, w gornym wierszu 137 jest jeszcze jej dol
    expect(labelRowY(0, 10)).toBe(L.y - 10);
    expect(labelHit(L.x + 5, L.top + 1, 20, 10)).toBe(0);
    expect(labelHit(L.x + 5, L.y - 10 + L.step + 2, 20, 10)).toBe(1);
  });
  it('limity przewijania i strzalki', () => {
    expect(labelScrollMax(5)).toBe(0);
    expect(labelScrollMax(9)).toBe(54);
    expect(labelScrollMax(99)).toBe(PANEL.labels.maxPx);
    expect(clampLabelScroll(-30, 9)).toBe(0);
    expect(clampLabelScroll(999, 9)).toBe(54);
    expect(arrowHit(PANEL.arrowUp.x + 1, PANEL.arrowUp.y + 1)).toBe(-1);
    expect(arrowHit(PANEL.arrowDown.x + 1, PANEL.arrowDown.y + 1)).toBe(1);
    expect(arrowHit(0, 0)).toBe(0);
    expect(inLabelPanel(PANEL.labels.x + 3, PANEL.labels.y + 3)).toBe(true);
    expect(inLabelPanel(100, 100)).toBe(false);
  });
  it('entranceHit: najblizszy w promieniu', () => {
    const pts = [
      { x: 100, y: 100 },
      { x: 110, y: 100 },
    ];
    expect(entranceHit(108, 100, pts)).toBe(1);
    expect(entranceHit(300, 300, pts)).toBe(-1);
  });
  it('clientToScreen i dialFrame', () => {
    expect(clientToScreen(160, 120, { width: 320, height: 240 })).toEqual({ x: 320, y: 240 });
    expect(dialFrame(1200, 24)).toBe(0);
    expect(dialFrame(1230, 24)).toBe(0);
    expect(dialFrame(0, 24)).toBe(12);
    expect(dialFrame(2359, 24)).toBe(11);
    expect(dialFrame(500, 0)).toBe(0);
  });
});

describe('klawisze i panel samochodu', () => {
  it('strzalki przewijaja o 20 px z przycieciem, Home centruje z przesunieciem 203/200', () => {
    expect(KEY_SCROLL_STEP).toBe(20);
    expect(keyScroll('ArrowRight', { x: 0, y: 0 }, { x: 0, y: 0 })).toEqual({ x: 20, y: 0 });
    expect(keyScroll('ArrowLeft', { x: 0, y: 0 }, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    expect(keyScroll('ArrowDown', { x: 0, y: 5 }, { x: 0, y: 0 })).toEqual({ x: 0, y: 25 });
    expect(keyScroll('Home', { x: 0, y: 0 }, { x: 1000, y: 900 })).toEqual(homeScroll(1000, 900));
    expect(homeScroll(1000, 900)).toEqual({ x: 797, y: 700 });
    expect(keyScroll('a', { x: 0, y: 0 }, { x: 0, y: 0 })).toBeNull();
  });
  it('ikony spotkan: zwykle FGT1,FGT0; specjalne FGT1,RNDEN2', () => {
    expect([0, 1, 2, 3].map((b) => encounterIconIndex(b, true))).toEqual([0, 1, 0, 1]);
    expect([0, 1, 2, 3].map((b) => encounterIconIndex(b, false))).toEqual([0, 2, 0, 2]);
  });
  it('miernik paliwa zaokragla w dol do parzystej, 0..70; strzalki maja rozmiar FRM 11x14', () => {
    expect([0, 1, 35, 69, 70, 99].map(gaugeFill)).toEqual([0, 0, 34, 68, 70, 70]);
    expect([PANEL.arrowUp.w, PANEL.arrowUp.h]).toEqual([11, 14]);
  });
});
