import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../../i18n';
import type { WorldmapController } from '../../game/worldmap/worldmap-controller';
import type { TrunkBridge } from '../../game/trunk-bridge';
import { CarPanel } from './CarPanel';
import type { WorldmapArt } from '../../game/worldmap/worldmap-art';
import type { TravelEvent, EncounterEvent } from '../../game/worldmap/worldmap-model';
import { drawWorldmapScreen, panelAreas } from '../../game/worldmap/worldmap-view';
import type { ArtImage } from '../../game/worldmap/worldmap-art';
import {
  DragTracker,
  SCREEN_H,
  SCREEN_W,
  VIEW_X,
  VIEW_Y,
  PANEL,
  arrowHit,
  centerOn,
  clampLabelScroll,
  clampScroll,
  inLabelPanel,
  labelScrollMax,
  clientToScreen,
  clientToView,
  entranceHit,
  inView,
  labelHit,
  keyScroll,
  encounterIconIndex,
  viewToWorld,
  type Scroll,
} from '../../game/worldmap/worldmap-viewport';

/** Mala ikona z grafiki gry (np. znacznik spotkania WMRNDEN) na wlasnym canvas; bez grafiki nic nie rysuje. */
function ArtIcon({ img, testId }: { img: ArtImage | undefined; testId: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (ctx && img) ctx.drawImage(img.source, 0, 0);
  });
  if (!img) return null;
  return (
    <canvas
      ref={ref}
      width={img.width}
      height={img.height}
      data-testid={testId}
      aria-hidden="true"
    />
  );
}

export interface WorldmapScreenProps {
  controller: WorldmapController;
  /** Wejscie do mapy lokalnej (lokacja albo spotkanie losowe). */
  onEnterMap(mapName: string, encounter?: EncounterEvent): void;
  /** Wyjscie z mapy swiata do gry (pozostanie na biezacej mapie). */
  onClose(): void;
  /** Grafika FRM z gry (kafle, miasta, auto); brak = kolory. */
  art?: WorldmapArt | null;
  /** Interwal symulacji podrozy w ms. */
  tickMs?: number;
  /** Most bagaznika samochodu z ekwipunkiem gracza (brak = bagaznik tylko do podgladu). */
  trunk?: TrunkBridge | undefined;
}

/** Ekran mapy swiata: mysz i dotyk (klik = cel), lista znanych miejsc, spotkania, wejscie do lokacji. */
export function WorldmapScreen({
  controller,
  onEnterMap,
  onClose,
  art = null,
  tickMs = 80,
  trunk,
}: WorldmapScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [, bump] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [area, setArea] = useState<number | null>(null);
  const [encounter, setEncounter] = useState<EncounterEvent | null>(null);
  const [townOn, setTownOn] = useState(false);
  const [townImg, setTownImg] = useState<ArtImage | null>(null);
  const m = controller.model;
  const scroll = useRef<Scroll>(centerOn(m.x, m.y));
  const tracker = useRef(new DragTracker());
  const panelTracker = useRef(new DragTracker());
  const panelDown = useRef<{ x: number; y: number } | null>(null);
  /** Przewiniecie listy etykiet miast w panelu (px; D: 27 px na etykiete, 0..250). */
  const labelScroll = useRef(0);
  const blink = useRef(0);
  const townMode = townOn && area !== null && !!art?.townmap;

  /** Klatka WMCARMVE: +1 raz na krok podrozy, tylko w ruchu (D 0x4bfe0c); rysowana w canvas ekranu. */
  const carFrame = useRef(0);

  const redraw = (): void => {
    const cv = canvasRef.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const entr = area !== null ? m.entrancesOf(area) : [];
    const ci = controller.carInfo();
    drawWorldmapScreen(ctx, m, scroll.current, art, {
      hhmm: controller.clockHhmm(),
      ...(ci.active && !townMode ? { car: { frame: carFrame.current, gauge: ci.gauge } } : {}),
      labelScroll: labelScroll.current,
      ...(encounter ? { encounterBlink: blink.current, fight: !encounter.special } : {}),
      town: townMode
        ? {
            image: townImg,
            entrances: entr.map((e) => ({ x: e.def.x, y: e.def.y })),
            title: m.data.areas[area!]?.name ?? '',
          }
        : null,
    });
    cv.dataset['scrollX'] = String(scroll.current.x);
    cv.dataset['scrollY'] = String(scroll.current.y);
    cv.dataset['labelOffset'] = String(labelScroll.current);
  };

  const handle = (ev: TravelEvent): void => {
    if (ev.kind === 'city') {
      setArea(ev.area);
      setMessage(null);
    } else if (ev.kind === 'arrived') setMessage(t('worldmap.arrived'));
    else if (ev.kind === 'no-fuel') setMessage(t('worldmap.noFuel'));
    else if (ev.kind === 'encounter') {
      if (ev.mapName === undefined) setMessage(t('worldmap.noMap'));
      else if (ev.prompt) setEncounter(ev);
      else onEnterMap(ev.mapName, ev);
    }
  };

  useEffect(() => {
    redraw();
    const id = setInterval(() => {
      if (encounter) {
        blink.current++;
        redraw();
        return;
      }
      if (m.target) {
        if (art && art.car.length > 0 && controller.carInfo().active)
          carFrame.current = (carFrame.current + 1) % art.car.length;
        for (const ev of controller.step()) handle(ev);
        // widok podaza za graczem, gdy ten wyjdzie poza okno
        if (!inView(m.x, m.y, scroll.current, -24)) scroll.current = centerOn(m.x, m.y);
        bump((n) => n + 1);
      }
      redraw();
    }, tickMs);
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (encounter) return;
      const ns = townMode ? null : keyScroll(e.key, scroll.current, m);
      if (ns) {
        e.preventDefault();
        scroll.current = ns;
        redraw();
        return;
      }
      // T/t: przelaczenie mapy miasta, tylko poza podroza i gdy obszar ma wejscia (D)
      if ((e.key === 't' || e.key === 'T') && !m.target && area !== null && !!art?.townmap)
        setTownOn((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearInterval(id);
      window.removeEventListener('keydown', onKey);
    };
  });

  useEffect(() => {
    let alive = true;
    setTownImg(null);
    if (area !== null && art?.townmap) void art.townmap(area).then((i) => alive && setTownImg(i));
    return () => {
      alive = false;
    };
  }, [area, art]);

  const selectArea = (i: number): void => {
    m.setTargetArea(i);
    setArea(null);
    setTownOn(false);
    setMessage(null);
    bump((n) => n + 1);
  };

  /** Gesty: przeciagniecie przewija okno (mysz i dotyk), tap ustawia cel albo wybiera wejscie / etykiete. */
  const gesture = useRef<
    Record<'down' | 'move' | 'up', (e: PointerEvent) => void> & { wheel: (e: WheelEvent) => void }
  >({
    wheel: () => undefined,
    down: () => undefined,
    move: () => undefined,
    up: () => undefined,
  });
  const logical = (e: PointerEvent | WheelEvent): { x: number; y: number } | null => {
    const cv = canvasRef.current;
    if (!cv) return null;
    const r = cv.getBoundingClientRect();
    return clientToScreen(e.clientX - r.left, e.clientY - r.top, r);
  };
  const areaCount = (): number => panelAreas(m).length;
  const scrollLabels = (to: number): void => {
    labelScroll.current = clampLabelScroll(to, areaCount());
    redraw();
  };
  gesture.current.down = (e) => {
    const p = logical(e);
    if (!p || encounter) return;
    if (inLabelPanel(p.x, p.y)) {
      // lista etykiet: tap wybiera miasto lub strzalke, przeciagniecie w pionie przewija (jak kolko myszy)
      panelDown.current = { x: p.x, y: p.y };
      panelTracker.current.start(p.x, p.y);
    } else if (p.x >= VIEW_X && p.y >= VIEW_Y) tracker.current.start(p.x, p.y);
    try {
      canvasRef.current?.setPointerCapture?.(e.pointerId);
    } catch {
      /* brak przechwytywania wskaznika (np. jsdom) */
    }
  };
  gesture.current.move = (e) => {
    const p = logical(e);
    if (!p) return;
    if (panelDown.current) {
      const d = panelTracker.current.move(p.x, p.y);
      if (d) scrollLabels(labelScroll.current + d.dy);
      return;
    }
    if (townMode) return;
    const d = tracker.current.move(p.x, p.y);
    if (!d) return;
    scroll.current = clampScroll({ x: scroll.current.x + d.dx, y: scroll.current.y + d.dy });
    redraw();
  };
  gesture.current.up = (e) => {
    if (panelDown.current) {
      const start = panelDown.current;
      panelDown.current = null;
      if (panelTracker.current.end() !== 'tap' || encounter) return;
      const arrow = arrowHit(start.x, start.y);
      if (arrow !== 0) {
        scrollLabels(labelScroll.current + arrow * PANEL.labels.step * 7);
        return;
      }
      const li = labelHit(start.x, start.y, areaCount(), labelScroll.current);
      const target = panelAreas(m)[li];
      if (target !== undefined) selectArea(target);
      return;
    }
    if (tracker.current.end() !== 'tap' || encounter) return;
    const cv = canvasRef.current;
    if (!cv) return;
    const r = cv.getBoundingClientRect();
    const v = clientToView(e.clientX - r.left, e.clientY - r.top, r);
    if (!v) return;
    if (townMode && area !== null) {
      const ents = m.entrancesOf(area);
      const hit = entranceHit(
        v.x,
        v.y,
        ents.map((x) => ({ x: x.def.x, y: x.def.y })),
      );
      const ent = ents[hit];
      if (ent?.map) onEnterMap(ent.map);
      return;
    }
    const w = viewToWorld(v.x, v.y, scroll.current);
    controller.clickWorld(w.x, w.y);
    setArea(null);
    setTownOn(false);
    setMessage(null);
    redraw();
    bump((n) => n + 1);
  };
  gesture.current.wheel = (e) => {
    const p = logical(e);
    if (!p || !inLabelPanel(p.x, p.y) || labelScrollMax(areaCount()) === 0) return;
    e.preventDefault();
    // jedna "kratka" kolka = jedna etykieta (27 px), jak krok przewijania w oryginale
    scrollLabels(labelScroll.current + Math.sign(e.deltaY) * PANEL.labels.step);
  };
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const down = (e: Event): void => gesture.current.down(e as PointerEvent);
    const move = (e: Event): void => gesture.current.move(e as PointerEvent);
    const up = (e: Event): void => gesture.current.up(e as PointerEvent);
    const cancel = (): void => {
      tracker.current.cancel();
      panelTracker.current.cancel();
      panelDown.current = null;
    };
    const wheel = (e: Event): void => gesture.current.wheel(e as WheelEvent);
    cv.addEventListener('wheel', wheel, { passive: false });
    cv.addEventListener('pointerdown', down);
    cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', cancel);
    return () => {
      cv.removeEventListener('pointerdown', down);
      cv.removeEventListener('pointermove', move);
      cv.removeEventListener('pointerup', up);
      cv.removeEventListener('pointercancel', cancel);
      cv.removeEventListener('wheel', wheel);
    };
  }, []);

  const car = controller.carInfo();
  const known = m.data.areas.map((a, i) => ({ a, i })).filter(({ i }) => m.areaVisible(i));
  const entrances = area !== null ? m.entrancesOf(area) : [];
  const areaName = area !== null ? (m.data.areas[area]?.name ?? '') : '';

  return (
    <div
      class="worldmap"
      data-testid="worldmap-screen"
      role="dialog"
      aria-label={t('worldmap.title')}
    >
      <div class="worldmap__main">
        <canvas
          ref={canvasRef}
          width={SCREEN_W}
          height={SCREEN_H}
          data-testid="worldmap-canvas"
          aria-label={t('worldmap.canvas')}
          style={{
            display: 'block',
            width: '100%',
            maxWidth: 960,
            height: 'auto',
            aspectRatio: '640 / 480',
            touchAction: 'none',
            cursor: 'crosshair',
          }}
        />
        <div class="worldmap__status" data-testid="worldmap-status" style={{ maxWidth: 960 }}>
          {t('worldmap.position')}: {m.x},{m.y}
          {message ? ` | ${message}` : ''}
        </div>
      </div>
      <aside class="worldmap__side">
        <h3>{t('worldmap.title')}</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            data-testid="worldmap-exit"
            style={{ minHeight: 44 }}
            onClick={onClose}
          >
            {t('worldmap.exit')}
          </button>
          <button
            type="button"
            data-testid="worldmap-stop"
            style={{ minHeight: 44 }}
            disabled={!m.target}
            onClick={() => {
              controller.stop();
              bump((n) => n + 1);
            }}
          >
            {t('worldmap.stop')}
          </button>
        </div>
        {car.active && (
          <div data-testid="worldmap-car">
            <h4>{t('worldmap.car')}</h4>
            <div
              data-testid="worldmap-fuel"
              role="meter"
              aria-label={t('worldmap.fuel')}
              aria-valuemin={0}
              aria-valuemax={car.fuelMax}
              aria-valuenow={car.fuel}
              style={{ height: 10, background: '#222', border: '1px solid #888' }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${(car.gauge / 70) * 100}%`,
                  background: car.gauge < 10 ? '#c33' : '#3c3',
                }}
              />
            </div>
            <div data-testid="worldmap-fuel-text">
              {t('worldmap.fuel')}: {Math.round((car.fuel / car.fuelMax) * 100)}% |{' '}
              {t('worldmap.speed')}: x{car.speed}
            </div>
          </div>
        )}
        <CarPanel controller={controller} trunk={trunk} onChange={() => bump((n) => n + 1)} />
        <h4>{t('worldmap.cities')}</h4>
        <ul data-testid="worldmap-cities" style={{ listStyle: 'none', padding: 0 }}>
          {known.map(({ a, i }) => (
            <li key={i}>
              <button
                type="button"
                data-testid={`worldmap-city-${i}`}
                style={{ minHeight: 44, width: '100%' }}
                onClick={() => selectArea(i)}
              >
                {a.name}
              </button>
            </li>
          ))}
        </ul>
        {area !== null && art?.townmap && (
          <button
            type="button"
            data-testid="worldmap-town-toggle"
            style={{ minHeight: 44, width: '100%' }}
            onClick={() => setTownOn((v) => !v)}
          >
            {townMode ? t('worldmap.worldView') : t('worldmap.townView')}
          </button>
        )}
        {area !== null && (
          <div data-testid="worldmap-locations">
            <h4>{t('worldmap.locations', { name: areaName })}</h4>
            {entrances.map((e) => (
              <button
                key={e.index}
                type="button"
                data-testid={`worldmap-enter-${e.index}`}
                disabled={e.map === undefined}
                style={{ minHeight: 44, width: '100%' }}
                onClick={() => e.map && onEnterMap(e.map)}
              >
                {t('worldmap.enter')}: {e.def.mapLookupName}
              </button>
            ))}
            {entrances.length === 0 && <p>{t('worldmap.noEntrance')}</p>}
          </div>
        )}
        {encounter && (
          <div data-testid="worldmap-encounter" role="alertdialog">
            <ArtIcon
              img={
                art?.encounter?.icons?.[encounterIconIndex(blink.current, !encounter.special)] ??
                art?.encounter?.rnd[blink.current % Math.max(1, art.encounter.rnd.length)]
              }
              testId="worldmap-encounter-icon"
            />
            <p>{t('worldmap.encounterPrompt')}</p>
            <button
              type="button"
              data-testid="worldmap-encounter-go"
              style={{ minHeight: 44 }}
              onClick={() => {
                const e = encounter;
                setEncounter(null);
                if (e.mapName) onEnterMap(e.mapName, e);
              }}
            >
              {t('worldmap.encounterGo')}
            </button>
            <button
              type="button"
              data-testid="worldmap-encounter-avoid"
              style={{ minHeight: 44 }}
              onClick={() => setEncounter(null)}
            >
              {t('worldmap.encounterAvoid')}
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
