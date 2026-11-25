import { WORLD_H, WORLD_W } from './worldmap-data';

/** Okno widoku mapy swiata jak w oryginale: 450 x 443 px (0x1c2 x 0x1bb) w ramce WMAPBOX 640 x 480. */
export const VIEW_W = 450;
export const VIEW_H = 443;
/** Lewy gorny rog okna w ramce WMAPBOX (D wg obrazu ramki: otwor 22,21 .. 472,464). */
export const VIEW_X = 22;
export const VIEW_Y = 21;
/** Rozmiar calego ekranu (ramka WMAPBOX). */
export const SCREEN_W = 640;
export const SCREEN_H = 480;
/** Przesuniecie wskaznika (px ekranu logicznego), od ktorego dotyk/klik staje sie przeciaganiem. */
export const DRAG_THRESHOLD = 6;

export interface Scroll {
  x: number;
  y: number;
}

export const maxScroll = (): Scroll => ({
  x: Math.max(0, WORLD_W - VIEW_W),
  y: Math.max(0, WORLD_H - VIEW_H),
});

export function clampScroll(s: Scroll): Scroll {
  const m = maxScroll();
  return {
    x: Math.round(Math.max(0, Math.min(m.x, s.x))),
    y: Math.round(Math.max(0, Math.min(m.y, s.y))),
  };
}

/** Przewiniecie tak, by punkt swiata byl w srodku okna (z przycieciem do krawedzi swiata). */
export const centerOn = (x: number, y: number): Scroll =>
  clampScroll({ x: x - VIEW_W / 2, y: y - VIEW_H / 2 });

/** Punkt okna widoku (px wzgledem lewego gornego rogu okna) -> wspolrzedne swiata, przyciete do swiata. */
export function viewToWorld(vx: number, vy: number, s: Scroll): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(WORLD_W - 1, Math.round(vx + s.x))),
    y: Math.max(0, Math.min(WORLD_H - 1, Math.round(vy + s.y))),
  };
}

export const worldToView = (x: number, y: number, s: Scroll): { x: number; y: number } => ({
  x: x - s.x,
  y: y - s.y,
});

/** Czy punkt swiata (z marginesem) miesci sie w oknie. */
export function inView(x: number, y: number, s: Scroll, margin = 0): boolean {
  const v = worldToView(x, y, s);
  return v.x >= -margin && v.y >= -margin && v.x < VIEW_W + margin && v.y < VIEW_H + margin;
}

/**
 * Punkt na elemencie canvas (px CSS, canvas skalowany do szerokosci kontenera) -> piksel logiczny ekranu 640x480.
 * Zwraca null poza okienkiem widoku (ramka i panel nie wyznaczaja celu).
 */
export function clientToView(
  px: number,
  py: number,
  box: { width: number; height: number },
): { x: number; y: number } | null {
  const lx = (px / Math.max(1, box.width)) * SCREEN_W - VIEW_X;
  const ly = (py / Math.max(1, box.height)) * SCREEN_H - VIEW_Y;
  if (lx < 0 || ly < 0 || lx >= VIEW_W || ly >= VIEW_H) return null;
  return { x: lx, y: ly };
}

/** Skala calosci ekranu do szerokosci kontenera (bez poziomego scrolla); nie powiekszamy ponad maxScale. */
export const fitScale = (containerWidth: number, maxScale = 1.5): number =>
  Math.max(0.1, Math.min(maxScale, containerWidth / SCREEN_W));

/**
 * Rozroznienie tap (cel) od drag (przewijanie): do przekroczenia progu to jeszcze tap, potem przewijanie
 * o przyrost wzgledem poprzedniego ruchu (w px logicznych).
 */
export class DragTracker {
  private sx = 0;
  private sy = 0;
  private lx = 0;
  private ly = 0;
  private active = false;
  dragging = false;

  constructor(private readonly threshold = DRAG_THRESHOLD) {}

  start(x: number, y: number): void {
    this.sx = this.lx = x;
    this.sy = this.ly = y;
    this.active = true;
    this.dragging = false;
  }

  /** Zwraca przyrost przewiniecia (przeciagniecie w prawo = widok w lewo), albo null gdy tap/nieaktywny. */
  move(x: number, y: number): { dx: number; dy: number } | null {
    if (!this.active) return null;
    if (!this.dragging && Math.hypot(x - this.sx, y - this.sy) < this.threshold) return null;
    this.dragging = true;
    const dx = this.lx - x;
    const dy = this.ly - y;
    this.lx = x;
    this.ly = y;
    return { dx, dy };
  }

  /** Koniec gestu: 'tap' gdy nie przekroczono progu, inaczej 'drag'. */
  end(): 'tap' | 'drag' | 'none' {
    if (!this.active) return 'none';
    this.active = false;
    return this.dragging ? 'drag' : 'tap';
  }

  cancel(): void {
    this.active = false;
    this.dragging = false;
  }
}

/**
 * Panel po prawej (D, specyfikacja formatu: 0x4c5734 tarcza, 0x4c50f4 glob, 0x4c52b0 lista miast, 0x4c219c przewijanie).
 * Okno interfejsu 640x480 od (0,0), wiec wspolrzedne sa bezwzgledne.
 */
export const PANEL = {
  /** WMGLOBE (134x89) w prawym dolnym rogu ramki (D, 0x4c50f4). */
  globe: { x: 495, y: 330 },
  /** Tarcza czasu WMDIAL (58x29, 24 klatki) pod data (D, 0x4c5734). */
  dial: { x: 532, y: 48 },
  /**
   * Lista etykiet miast WM_* (82x18): pierwsza etykieta y = 138 - (przewiniecie % 27), skok 27 px, 7 przyciskow
   * (6 pelnych i 1 czesciowa), wycinek tla (501,135) 119x178; cel przewiniecia klampowany do 0..250 (D, 0x4c52b0).
   */
  labels: { x: 530, y: 138, w: 82, h: 18, step: 27, slots: 7, top: 137, bottom: 313, maxPx: 250 },
  /** Przyciski strzalek gora/dol listy (UPARWON/DNARWON), pozycje z D 0x4c50f4; rozmiar 11x14 (wymiary FRM z gry). */
  arrowUp: { x: 480, y: 137, w: 11, h: 14 },
  arrowDown: { x: 480, y: 152, w: 11, h: 14 },
  /** Panel samochodu (D 0x4c3c10): WMCARMVE 93x73 na (514,336) pod WMSCREEN 117x95 na (499,330), miernik od (500,339), 70 wierszy. */
  carAnim: { x: 514, y: 336 },
  carScreen: { x: 499, y: 330 },
  gauge: { x: 500, y: 339, rows: 70 },
} as const;

/** Najwieksze przewiniecie listy (px): nie dalej niz ostatnia etykieta; nigdy ponad 250 jak w oryginale. */
export const labelScrollMax = (count: number): number =>
  Math.max(0, Math.min(PANEL.labels.maxPx, (count - PANEL.labels.slots) * PANEL.labels.step));

export const clampLabelScroll = (px: number, count: number): number =>
  Math.round(Math.max(0, Math.min(labelScrollMax(count), px)));

/** Czy punkt ekranu logicznego jest w obrebie listy etykiet (z pasem przyciskow strzalek): kolko i przeciaganie. */
export const inLabelPanel = (sx: number, sy: number): boolean =>
  sx >= PANEL.arrowUp.x &&
  sx < PANEL.labels.x + PANEL.labels.w &&
  sy >= PANEL.labels.top &&
  sy < PANEL.labels.bottom;

/** Strzalka listy pod punktem: -1 gora, 1 dol, 0 brak. */
export function arrowHit(sx: number, sy: number): -1 | 0 | 1 {
  const hit = (a: { x: number; y: number; w: number; h: number }): boolean =>
    sx >= a.x && sx < a.x + a.w && sy >= a.y && sy < a.y + a.h;
  return hit(PANEL.arrowUp) ? -1 : hit(PANEL.arrowDown) ? 1 : 0;
}

/** Wiersz y (ekran) etykiety o numerze slotu k (0..slots-1) przy przewinieciu scroll px. */
export const labelRowY = (k: number, scroll: number): number =>
  PANEL.labels.y - (scroll % PANEL.labels.step) + k * PANEL.labels.step;

/** Punkt na canvas (px CSS) -> piksel logiczny ekranu 640x480. */
export const clientToScreen = (
  px: number,
  py: number,
  box: { width: number; height: number },
): { x: number; y: number } => ({
  x: (px / Math.max(1, box.width)) * SCREEN_W,
  y: (py / Math.max(1, box.height)) * SCREEN_H,
});

/** Indeks etykiety miasta na liscie znanych (0..count-1) pod punktem ekranu logicznego przy przewinieciu scroll px, albo -1. */
export function labelHit(sx: number, sy: number, count: number, scroll = 0): number {
  const L = PANEL.labels;
  if (sx < L.x || sx >= L.x + L.w || sy < L.top || sy >= L.bottom) return -1;
  const rel = sy - (L.y - (scroll % L.step));
  if (rel < 0) return -1;
  const k = Math.floor(rel / L.step);
  if (k >= L.slots || rel - k * L.step >= L.h) return -1;
  const i = Math.floor(scroll / L.step) + k;
  return i < count ? i : -1;
}

/** Promien (px mapy miasta) trafienia w znacznik wejscia na mapie TWN. */
export const ENTRANCE_HIT = 18;

/** Najblizszy znacznik wejscia w promieniu ENTRANCE_HIT (wspolrzedne w oknie widoku), albo -1. */
export function entranceHit(
  vx: number,
  vy: number,
  pts: readonly { x: number; y: number }[],
): number {
  let best = -1;
  let bd = ENTRANCE_HIT;
  pts.forEach((p, i) => {
    const d = Math.hypot(p.x - vx, p.y - vy);
    if (d <= bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

/** Klatka tarczy czasu (24 klatki WMDIAL), D 0x4c50f4/0x4c57ba: (godzina + 12) % liczba klatek; klatka 0 = 12:00. */
export const dialFrame = (hhmm: number, frames: number): number =>
  frames <= 0 ? 0 : (Math.floor(hhmm / 100) + 12) % frames;

/** Krok przewijania klawiszami strzalek (D: 20 px). */
export const KEY_SCROLL_STEP = 20;
/** Home: srodkowanie na graczu z przesunieciem (D: x-203, y-200) przed przycieciem. */
export const homeScroll = (x: number, y: number): Scroll => clampScroll({ x: x - 203, y: y - 200 });

/** Przewiniecie klawiszem: strzalki o 20 px (z przycieciem), Home na graczu; null gdy klawisz nie dotyczy mapy. */
export function keyScroll(key: string, s: Scroll, player: { x: number; y: number }): Scroll | null {
  switch (key) {
    case 'ArrowUp':
      return clampScroll({ x: s.x, y: s.y - KEY_SCROLL_STEP });
    case 'ArrowDown':
      return clampScroll({ x: s.x, y: s.y + KEY_SCROLL_STEP });
    case 'ArrowLeft':
      return clampScroll({ x: s.x - KEY_SCROLL_STEP, y: s.y });
    case 'ArrowRight':
      return clampScroll({ x: s.x + KEY_SCROLL_STEP, y: s.y });
    case 'Home':
      return homeScroll(player.x, player.y);
    default:
      return null;
  }
}

/** Klatka migania ikony spotkania -> indeks w tablicy icons [FGT1, FGT0, RNDEN2, RNDEN3]: zwykle 1,0,1,0..., specjalne 1,2,1,2... */
export const encounterIconIndex = (blink: number, fight: boolean): number =>
  blink % 2 === 0 ? 0 : fight ? 1 : 2;

/** Wysokosc wypelnienia miernika paliwa (wiersze 0..70) zaokraglona w dol do parzystej (D 0x4c3c10). */
export const gaugeFill = (gauge: number): number =>
  Math.max(0, Math.min(70, Math.floor(gauge / 2) * 2));
