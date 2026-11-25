import { SUB_COLS, SUB_ROWS, WORLD_H, WORLD_W } from './worldmap-data';
import type { WorldmapArt } from './worldmap-art';
import type { WorldmapModel } from './worldmap-model';
import {
  PANEL,
  SCREEN_H,
  SCREEN_W,
  VIEW_H,
  VIEW_W,
  VIEW_X,
  VIEW_Y,
  dialFrame,
  encounterIconIndex,
  gaugeFill,
  labelRowY,
  type Scroll,
} from './worldmap-viewport';
import type { ArtImage } from './worldmap-art';

const TILE_W = 350;
const TILE_H = 300;
const SUB = 50;
const TILES_PER_ROW = SUB_COLS / (TILE_W / SUB);

/** Kolory terenu z worldmap.txt (Desert/Mountain/City/Ocean); nieznany teren = pustynia. */
export const TERRAIN_COLORS: Record<string, string> = {
  Desert: '#b89b5e',
  Mountain: '#7a6a55',
  City: '#8c8c7a',
  Ocean: '#2f5f8a',
};
export const terrainColor = (terrain: string): string =>
  TERRAIN_COLORS[terrain] ?? TERRAIN_COLORS['Desert']!;

/** Przeliczenie punktu na elemencie canvas (px CSS) na wspolrzedne swiata (px). */
export function clientToWorld(
  px: number,
  py: number,
  box: { width: number; height: number },
): { x: number; y: number } {
  const x = Math.round((px / Math.max(1, box.width)) * WORLD_W);
  const y = Math.round((py / Math.max(1, box.height)) * WORLD_H);
  return { x: Math.max(0, Math.min(WORLD_W - 1, x)), y: Math.max(0, Math.min(WORLD_H - 1, y)) };
}

export const worldToCanvas = (
  x: number,
  y: number,
  box: { width: number; height: number },
): { x: number; y: number } => ({ x: (x / WORLD_W) * box.width, y: (y / WORLD_H) * box.height });

/** Rysuje swiat: kafle terenu (podkafle 50 px), mgle, miasta, cel i pozycje gracza. */
export function drawWorldmap(
  ctx: CanvasRenderingContext2D,
  model: WorldmapModel,
  size: { width: number; height: number },
  art?: WorldmapArt | null,
): void {
  const { width: w, height: h } = size;
  ctx.fillStyle = '#10130f';
  ctx.fillRect(0, 0, w, h);
  const cw = w / SUB_COLS;
  const ch = h / SUB_ROWS;
  for (let r = 0; r < SUB_ROWS; r++) {
    for (let c = 0; c < SUB_COLS; c++) {
      if (model.fog[r * SUB_COLS + c] !== 1) continue;
      const tile =
        art?.tiles[Math.floor(r / (TILE_H / SUB)) * TILES_PER_ROW + Math.floor(c / (TILE_W / SUB))];
      if (tile) {
        // podkafel 50x50 z grafiki WRLDMPxx (kafel 350x300: 7 x 6 podkafli), tylko odkryta czesc
        const sx = (c % (TILE_W / SUB)) * SUB;
        const sy = (r % (TILE_H / SUB)) * SUB;
        ctx.drawImage(
          tile.source,
          sx,
          sy,
          SUB,
          SUB,
          Math.floor(c * cw),
          Math.floor(r * ch),
          Math.ceil(cw),
          Math.ceil(ch),
        );
        continue;
      }
      ctx.fillStyle = terrainColor(model.terrainAt(c * 50 + 25, r * 50 + 25));
      ctx.fillRect(Math.floor(c * cw), Math.floor(r * ch), Math.ceil(cw), Math.ceil(ch));
    }
  }
  model.data.areas.forEach((a, i) => {
    if (!model.areaVisible(i)) return;
    const p = worldToCanvas(a.worldPos.x, a.worldPos.y, size);
    const spr = art?.city[a.size];
    if (spr) {
      const sc = w / WORLD_W;
      ctx.drawImage(
        spr.source,
        p.x - (spr.width * sc) / 2,
        p.y - (spr.height * sc) / 2,
        spr.width * sc,
        spr.height * sc,
      );
      return;
    }
    const rad = (model.radiusOf(a) / WORLD_W) * w;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(4, rad), 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(190, 40, 30, 0.55)';
    ctx.fill();
    ctx.strokeStyle = '#ffd9a0';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });
  if (model.target) {
    const t = worldToCanvas(model.target.x, model.target.y, size);
    const p = worldToCanvas(model.x, model.y, size);
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#ffe36b';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(t.x, t.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = '#ffe36b';
    if (art?.target) {
      const sc = w / WORLD_W;
      ctx.drawImage(
        art.target.source,
        t.x - (art.target.width * sc) / 2,
        t.y - (art.target.height * sc) / 2,
        art.target.width * sc,
        art.target.height * sc,
      );
    } else ctx.strokeRect(t.x - 4, t.y - 4, 8, 8);
  }
  const me = worldToCanvas(model.x, model.y, size);
  if (art?.loc) {
    const sc = w / WORLD_W;
    ctx.drawImage(
      art.loc.source,
      me.x - (art.loc.width * sc) / 2,
      me.y - (art.loc.height * sc) / 2,
      art.loc.width * sc,
      art.loc.height * sc,
    );
    return;
  }
  ctx.beginPath();
  ctx.arc(me.x, me.y, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#7dff7d';
  ctx.fill();
  ctx.strokeStyle = '#0b300b';
  ctx.lineWidth = 2;
  ctx.stroke();
}

export interface ScreenOptions {
  /** Godzina doby jako hhmm (tarcza WMDIAL). */
  hhmm?: number;
  /** Migotanie ikon spotkania (numer klatki); undefined = brak aktywnego spotkania. */
  encounterBlink?: number;
  /** Walka (spotkanie zwykle): migaja WMAPFGT0/1; inaczej (sceny specjalne) WMRNDEN2/3 (D 0x4c41ec, Z: tabela ikon). */
  fight?: boolean;
  /** Panel samochodu (zamiast globu): numer klatki WMCARMVE i miernik paliwa 0..70. */
  car?: { frame: number; gauge: number };
  /** Przewiniecie listy etykiet miast w panelu (px, 0..250; D 0x4c52b0). */
  labelScroll?: number;
  /** Tryb mapy miasta: obraz TWN i znaczniki wejsc (wspolrzedne na obrazie). */
  town?: { image: ArtImage | null; entrances: { x: number; y: number }[]; title: string } | null;
}

/**
 * Caly ekran 640x480 jak w oryginale: swiat w przewijanym oknie 450x443 (skala 1:1), ramka WMAPBOX, tarcza czasu
 * WMDIAL, glob WMGLOBE i etykiety miast WM_* w panelu. Bez grafik: kolorowe tlo i teksty.
 */
export function drawWorldmapScreen(
  ctx: CanvasRenderingContext2D,
  model: WorldmapModel,
  scroll: Scroll,
  art?: WorldmapArt | null,
  opts: ScreenOptions = {},
): void {
  ctx.fillStyle = '#1b1812';
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  ctx.save();
  ctx.beginPath();
  ctx.rect(VIEW_X, VIEW_Y, VIEW_W, VIEW_H);
  ctx.clip();
  if (opts.town) {
    ctx.fillStyle = '#10130f';
    ctx.fillRect(VIEW_X, VIEW_Y, VIEW_W, VIEW_H);
    const img = opts.town.image;
    if (img) ctx.drawImage(img.source, VIEW_X, VIEW_Y);
    else {
      ctx.fillStyle = '#d8c9a0';
      ctx.font = '16px sans-serif';
      ctx.fillText(opts.town.title, VIEW_X + 12, VIEW_Y + 28);
    }
    for (const e of opts.town.entrances) {
      const x = VIEW_X + e.x;
      const y = VIEW_Y + e.y;
      if (art?.target)
        ctx.drawImage(art.target.source, x - art.target.width / 2, y - art.target.height / 2);
      else {
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#ffe36b';
        ctx.fill();
      }
    }
  } else {
    ctx.translate(VIEW_X - scroll.x, VIEW_Y - scroll.y);
    drawWorldmap(ctx, model, { width: WORLD_W, height: WORLD_H }, art);
    if (opts.encounterBlink !== undefined && art?.encounter) {
      // ikona wysrodkowana na graczu (D, 0x4c41ec): zwykle spotkanie = WMAPFGT0/1, specjalne = WMRNDEN2/3
      const enc = art.encounter;
      const icon = enc.icons
        ? enc.icons[encounterIconIndex(opts.encounterBlink, opts.fight !== false)]
        : (opts.fight === false ? enc.rnd : enc.fgt.length > 0 ? enc.fgt : enc.rnd)[
            opts.encounterBlink % 2
          ];
      if (icon) ctx.drawImage(icon.source, model.x - icon.width / 2, model.y - icon.height / 2);
    } else if (opts.encounterBlink !== undefined) {
      ctx.beginPath();
      ctx.arc(model.x, model.y - 14, 8, 0, Math.PI * 2);
      ctx.fillStyle = opts.encounterBlink % 2 ? '#ff5533' : '#ffd24a';
      ctx.fill();
    }
  }
  ctx.restore();
  if (art?.frame) ctx.drawImage(art.frame.source, 0, 0);
  else {
    ctx.strokeStyle = '#6b5d3d';
    ctx.lineWidth = 3;
    ctx.strokeRect(VIEW_X - 1.5, VIEW_Y - 1.5, VIEW_W + 3, VIEW_H + 3);
  }
  const frames = art?.dial ?? [];
  const df = frames[dialFrame(opts.hhmm ?? 0, frames.length)];
  if (df) ctx.drawImage(df.source, PANEL.dial.x, PANEL.dial.y);
  if (opts.car && art && art.car.length > 0) {
    // panel samochodu zamiast globu (D 0x4c3c10): WMCARMVE nieprzezroczyste, WMSCREEN przezroczyste, miernik 70 wierszy
    const fr = art.car[opts.car.frame % art.car.length]!;
    ctx.drawImage(fr.source, PANEL.carAnim.x, PANEL.carAnim.y);
    if (art.screen) ctx.drawImage(art.screen.source, PANEL.carScreen.x, PANEL.carScreen.y);
    const G = PANEL.gauge;
    const fill = gaugeFill(opts.car.gauge);
    const empty = art.gaugeColors?.empty ?? '#282828';
    const full = art.gaugeColors?.full ?? '#64e464';
    for (let r = 0; r < G.rows; r++) {
      const filled = r >= G.rows - fill;
      ctx.fillStyle = filled && (r - (G.rows - fill)) % 2 === 0 ? full : empty;
      ctx.fillRect(G.x, G.y + r, 1, 1);
    }
  } else if (art?.globe) ctx.drawImage(art.globe.source, PANEL.globe.x, PANEL.globe.y);
  const L = PANEL.labels;
  const list = panelAreas(model);
  const sc = opts.labelScroll ?? 0;
  ctx.save();
  ctx.beginPath();
  ctx.rect(L.x, L.top, L.w, L.bottom - L.top);
  ctx.clip();
  for (let k = 0; k < L.slots; k++) {
    const i = list[Math.floor(sc / L.step) + k];
    if (i === undefined) break;
    const y = labelRowY(k, sc);
    const lab = art?.labels?.get(i);
    if (lab) ctx.drawImage(lab.source, L.x, y);
    else {
      ctx.fillStyle = '#2a251a';
      ctx.fillRect(L.x, y, L.w, L.h);
      ctx.fillStyle = '#d8c9a0';
      ctx.font = '12px sans-serif';
      ctx.fillText((model.data.areas[i]?.name ?? '').slice(0, 12), L.x + 4, y + 13);
    }
  }
  ctx.restore();
}

/** Indeksy wszystkich znanych obszarow w kolejnosci listy etykiet panelu (przewijanej). */
export const panelAreas = (model: WorldmapModel): number[] =>
  model.data.areas.map((_, i) => i).filter((i) => model.areaVisible(i));
