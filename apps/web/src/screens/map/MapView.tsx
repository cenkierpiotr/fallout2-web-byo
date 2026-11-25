import { computed } from '@preact/signals';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { BarterScreen, Modal, RestHost, SavesScreen, useUiArt, type BarterView } from '@f2/ui';
import { IfaceBar } from './IfaceBar';
import { client } from '../../state/game-folder';
import { settings } from '../../settings';
import { t } from '../../i18n';
import { createMapScreen, type MapScreen, type MapScreenDeps } from './map-screen';
import type { MenuAction } from './touch-menu';
import { ensureAudio } from '../../audio/audio-state';
import { MapList } from './MapList';
import { DialogScreen } from '../dialog/DialogScreen';
import { MENU_ICON_PATH, menuIcon, radialLayout, radialScale } from './touch-menu';

export interface MapViewProps {
  /** Dodatkowe zaleznosci ekranu mapy (przeplyw gry: stan z kreatora, druzyna, zadania). */
  screenOptions?: Partial<Omit<MapScreenDeps, 'client' | 'canvas' | 'wrap'>>;
  /** Mapa otwierana od razu po utworzeniu ekranu (pomija liste map). */
  autoOpen?: string;
  /** Wolane po utworzeniu ekranu mapy. */
  onScreen?: (s: MapScreen) => void;
  /** Wolane po wczytaniu mapy z `autoOpen` (sesja gry istnieje): np. wczytanie zapisu z menu. */
  onOpened?: (s: MapScreen) => void;
}

export function MapView({ screenOptions, autoOpen, onScreen, onOpened }: MapViewProps = {}) {
  const c = client.value;
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [screen, setScreen] = useState<MapScreen | null>(null);
  const [openName, setOpenName] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!c || !canvas || !wrap) return;
    let disposed = false;
    let created: MapScreen | null = null;
    createMapScreen({ client: c, canvas, wrap, ...screenOptions }).then(
      (s) => {
        if (disposed) s.dispose();
        else {
          created = s;
          setScreen(s);
          onScreen?.(s);
        }
      },
      (e: unknown) => {
        if (!disposed) setProblem(e instanceof Error ? e.message : String(e));
      },
    );
    return () => {
      disposed = true;
      created?.dispose();
      setScreen(null);
    };
  }, [c]);

  const open = (name: string): void => {
    if (!screen) return;
    setProblem(null);
    setOpenName(name);
    if (c) {
      const entry = screen.maps.find((m) => m.name === name);
      const music = entry?.music;
      ensureAudio(c).then(
        (a) => {
          void a.system.resume();
          a.ambient.onMap(entry?.ambientSfx);
          return a.music.onMap(music);
        },
        () => undefined, // brak Web Audio: gra dziala bez dzwieku
      );
    }
    screen
      .open(name)
      .then(() => onOpened?.(screen))
      .catch((e: unknown) => {
        setProblem(
          t('map.loadFailed', { name }) + ` (${e instanceof Error ? e.message : String(e)})`,
        );
        setOpenName(null);
      });
  };
  const autoOpened = useRef(false);
  useEffect(() => {
    if (autoOpen && screen && !autoOpened.current) {
      autoOpened.current = true;
      open(autoOpen);
    }
  });
  const back = (): void => {
    screen?.stop();
    if (c)
      void ensureAudio(c).then(
        (a) => {
          a.ambient.onMap(undefined);
          return a.music.onMap(undefined);
        },
        () => undefined,
      );
    setOpenName(null);
  };

  const [savesOpen, setSavesOpen] = useState(false);
  const ui = screen?.ui.value ?? null;
  const barterOpen = ui?.barter.value != null;
  const barterView = useMemo(() => {
    if (!ui) return null;
    let last: BarterView | null = null;
    return computed(() => {
      last = ui.barter.value ?? last;
      return last as BarterView;
    });
  }, [ui]);

  const notes = screen?.notes.value ?? [];
  const logLines = screen?.logLines.value ?? [];
  const [logOpen, setLogOpen] = useState(false);
  const logListRef = useRef<HTMLUListElement | null>(null);
  useEffect(() => {
    const el = logListRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logLines.length, logOpen]);
  const elevation = screen?.elevation.value ?? 0;
  /** Oryginalny pasek IFACE (skorka FRM); bez grafik zostaje dotychczasowy HUD. */
  const skin = !!useUiArt('iface.bar');
  const key = (type: string, init: KeyboardEventInit): void => {
    void type;
    wrapRef.current?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }));
  };

  const restNow = ui?.rest.value;
  const toolButtons = {
    saves: (
      <button type="button" data-testid="open-saves" onClick={() => setSavesOpen(true)}>
        {t('map.saves')}
      </button>
    ),
    trade: (
      <button type="button" data-testid="open-trade" onClick={() => screen?.trade()}>
        {t('map.trade')}
      </button>
    ),
    zoom: (
      <>
        <button
          type="button"
          data-testid="zoom-in"
          aria-label={t('map.zoomIn')}
          onClick={() => key('zoom', { key: '+' })}
        >
          +
        </button>
        <button
          type="button"
          data-testid="zoom-out"
          aria-label={t('map.zoomOut')}
          onClick={() => key('zoom', { key: '-' })}
        >
          -
        </button>
        <button
          type="button"
          data-testid="elevation-up"
          aria-label={t('map.elevationUp')}
          onClick={() => key('elevation', { key: 'PageUp' })}
        >
          ▲
        </button>
        <button
          type="button"
          data-testid="elevation-down"
          aria-label={t('map.elevationDown')}
          onClick={() => key('elevation', { key: 'PageDown' })}
        >
          ▼
        </button>
        <span data-testid="elevation-label">{t('map.elevation', { level: elevation })}</span>
      </>
    ),
  };

  return (
    <div class="map-view">
      {!openName && screen && <MapList maps={screen.maps} onOpen={open} />}
      {!openName && !screen && !problem && <p class="muted">{t('map.loading')}</p>}
      {problem && (
        <p class="error" data-testid="map-error">
          {problem}
        </p>
      )}
      <div
        ref={wrapRef}
        class="canvas-wrap map-stage"
        data-testid="map-stage"
        data-skin={skin ? '' : undefined}
        style={{ display: openName ? 'block' : 'none' }}
      >
        <canvas ref={canvasRef} data-testid="map-canvas" />
        {openName && screen && (
          <DialogScreen
            view={screen.view}
            commands={screen.dialog}
            profile={document.documentElement.dataset['profile'] === 'touch' ? 'touch' : 'desktop'}
            showSkillChecks={settings.value.showSkillChecks}
          />
        )}
        {openName && screen && (
          <>
            <div
              class="overlay map-hud"
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              onPointerMove={(e) => e.stopPropagation()}
            >
              <button type="button" onClick={back} data-testid="map-back">
                {t('map.back')}
              </button>
              <span data-testid="map-name">{screen.mapName.value}</span>
              {settings.value.debugOverlay && (
                <span data-testid="map-fps">{t('map.fps', { fps: screen.fps.value })}</span>
              )}
              {screen.loading.value && <span>{t('map.loading')}</span>}
              {!skin && toolButtons.saves}
              {!skin && toolButtons.trade}
              {ui && <RestHost view={ui.rest} clock={ui.clock} commands={ui.restCommands} />}
            </div>
            {!skin && <div class="map-buttons">{toolButtons.zoom}</div>}
            {skin && (
              <IfaceBar
                {...(restNow ? { hp: restNow.hp, hpMax: restNow.hpMax } : {})}
                onOptions={() => setSavesOpen(true)}
                optionsLabel={t('map.saves')}
                optionsTestId="open-saves"
                messages={logLines}
                extras={
                  <>
                    {toolButtons.trade}
                    {toolButtons.zoom}
                  </>
                }
              />
            )}
            {screen.menu.value && (
              <RadialMenu
                menu={screen.menu.value}
                view={{
                  w: wrapRef.current?.clientWidth ?? 0,
                  h: wrapRef.current?.clientHeight ?? 0,
                }}
                onChoose={(a) => screen.menuChoose(a)}
              />
            )}
            <div
              class={`msg-log${logOpen ? ' msg-log--open' : ''}`}
              data-testid="msg-log"
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              onPointerMove={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                class="msg-log__toggle"
                data-testid="msg-log-toggle"
                aria-expanded={logOpen}
                aria-label={t(logOpen ? 'log.close' : 'log.open')}
                onClick={() => setLogOpen((v) => !v)}
              >
                {t('log.title')}
                {logLines.length > 0 && <span class="msg-log__count">{logLines.length}</span>}
              </button>
              <ul
                ref={logListRef}
                class="msg-log__list"
                data-testid="msg-log-list"
                aria-live="polite"
                aria-label={t('log.title')}
              >
                {logLines.length === 0 && <li class="muted">{t('log.empty')}</li>}
                {logLines.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </div>
            <ul class="map-notes" data-testid="notifications" aria-live="polite">
              {notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </>
        )}
      </div>
      {ui && (
        <>
          <Modal
            open={savesOpen}
            title={t('map.saves')}
            onClose={() => setSavesOpen(false)}
            artBackground="save.bg"
          >
            <SavesScreen
              view={ui.saves}
              commands={ui.savesCommands}
              onLoaded={() => setSavesOpen(false)}
            />
          </Modal>
          <Modal
            open={barterOpen}
            title={t('map.trade')}
            onClose={() => ui.barterCommands.cancel()}
            artBackground="barter.bg"
          >
            {barterOpen && barterView && (
              <BarterScreen
                view={barterView}
                commands={ui.barterCommands}
                sprite={() => undefined}
              />
            )}
          </Modal>
          {(() => {
            const stealView = screen?.steal.value ?? null;
            return (
              <Modal
                open={!!stealView}
                title={t('steal.title', { name: stealView?.name ?? '' })}
                onClose={() => screen!.stealClose()}
              >
                {stealView && (
                  <div data-testid="steal-view">
                    {stealView.message && <p data-testid="steal-message">{stealView.message}</p>}
                    {stealView.items.length === 0 && <p>{t('steal.empty')}</p>}
                    <ul>
                      {stealView.items.map((it) => (
                        <li key={it.id}>
                          <button
                            type="button"
                            data-testid={`steal-item-${it.id}`}
                            onClick={() => screen!.stealPick(it.id)}
                          >
                            {t('steal.chance', { name: it.name, chance: it.chance })}
                          </button>
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      data-testid="steal-close"
                      onClick={() => screen!.stealClose()}
                    >
                      {t('steal.close')}
                    </button>
                  </div>
                )}
              </Modal>
            );
          })()}
        </>
      )}
    </div>
  );
}

function RadialMenu(props: {
  menu: NonNullable<MapScreen['menu']['value']>;
  view: { w: number; h: number };
  onChoose: (a: MenuAction) => void;
}) {
  const { menu, view } = props;
  const css = typeof document !== 'undefined' ? getComputedStyle(document.documentElement) : null;
  const num = (name: string): number => {
    const v = css ? parseFloat(css.getPropertyValue(name)) : NaN;
    return Number.isFinite(v) ? v : 1;
  };
  const scale = radialScale(view, num('--ui-scale'), num('--font-scale'));
  const layout = radialLayout({ x: menu.x, y: menu.y }, menu.entries.length, view, scale);
  const stop = (e: Event): void => e.stopPropagation();
  return (
    <div
      class="map-menu"
      role="menu"
      aria-label={t('menu.title')}
      data-testid="map-menu"
      onPointerDown={stop}
      onPointerUp={stop}
      onPointerMove={stop}
    >
      {menu.entries.map((e, i) => (
        <button
          key={e.action}
          type="button"
          role="menuitem"
          class="map-menu__item"
          data-testid={`menu-${e.action}`}
          style={{
            left: `${layout.items[i]!.x - layout.size / 2}px`,
            top: `${layout.items[i]!.y - layout.size / 2}px`,
            width: `${layout.size}px`,
            height: `${layout.size}px`,
          }}
          onClick={() => props.onChoose(e.action)}
        >
          <svg
            class="map-menu__icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
            width={Math.round(layout.size * 0.42)}
            height={Math.round(layout.size * 0.42)}
          >
            <path
              d={MENU_ICON_PATH[menuIcon(e.action)]}
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <span class="map-menu__label" style={{ fontSize: `${Math.round(11 * layout.scale)}px` }}>
            {e.chance !== undefined
              ? t('skill.pct', { name: t(e.labelKey), chance: e.chance })
              : (e.label ?? t(e.labelKey))}
          </span>
        </button>
      ))}
    </div>
  );
}
