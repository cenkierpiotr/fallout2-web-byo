import type { ReadonlySignal } from '@preact/signals';
import { ArtAt, ArtStage, useLayoutMode, useUiArt } from '../../art';
import { Button } from '../../components';
import { t } from '../../i18n';
import type { EndgameCommands, EndgameView } from './types';
import './endgame.css';

export interface MainMenuScreenProps {
  view: ReadonlySignal<EndgameView>;
  commands: EndgameCommands;
  /** Wersja aplikacji (version.ts). */
  version?: string;
  /** false w PWA: zamkniecie okna niedostepne, przycisk ukryty. */
  canQuit?: boolean;
}

/** Pozycje wpisow menu na tle mainmenu.frm (640x480): 6 wypalonych plytek w lewej kolumnie
 *  (zmierzone ze zrzutu: x 16, szer. 191, wys. 35, y 15 + 41*i). Teksty rysujemy sami na plytkach. */
const MENU_ENTRY_X = 16;
const MENU_ENTRY_W = 191;
const MENU_ENTRY_H = 35;
const MENU_ENTRY_Y0 = 15;
const MENU_ENTRY_PITCH = 41;

interface MenuEntryDef {
  testid: string;
  labelKey: string;
  run: (v: EndgameView, commands: EndgameCommands, canQuit: boolean) => boolean;
  action: (commands: EndgameCommands) => void;
  variant: (v: EndgameView) => 'primary' | 'secondary';
}

const MENU_ENTRIES: MenuEntryDef[] = [
  {
    testid: 'menu-load-last',
    labelKey: 'mainMenu.loadLast',
    run: (v) => v.lastSave !== null,
    action: (c) => c.loadLast(),
    variant: () => 'primary',
  },
  {
    testid: 'menu-new',
    labelKey: 'mainMenu.new',
    run: () => true,
    action: (c) => c.newGame(),
    variant: (v) => (v.lastSave === null ? 'primary' : 'secondary'),
  },
  {
    testid: 'menu-load',
    labelKey: 'mainMenu.load',
    run: () => true,
    action: (c) => c.load(),
    variant: () => 'secondary',
  },
  {
    testid: 'menu-settings',
    labelKey: 'mainMenu.settings',
    run: () => true,
    action: (c) => c.openSettings(),
    variant: () => 'secondary',
  },
  {
    testid: 'menu-credits',
    labelKey: 'mainMenu.credits',
    run: () => true,
    action: (c) => c.showCredits(),
    variant: () => 'secondary',
  },
  {
    testid: 'menu-quit',
    labelKey: 'mainMenu.quit',
    run: (v, commands, canQuit) => canQuit && !!commands.quit,
    action: (c) => c.quit?.(),
    variant: () => 'secondary',
  },
];

/** Menu glowne: nowa gra, wczytaj, ustawienia, napisy, wyjscie; po smierci propozycja ostatniego zapisu. */
export function MainMenuScreen({ view, commands, version, canQuit = true }: MainMenuScreenProps) {
  const v = view.value;
  const bg = useUiArt('menu.bg');
  const mode = useLayoutMode();

  if (!bg) {
    return (
      <main class="f2-mainmenu" data-testid="main-menu-screen">
        <h1 class="f2-mainmenu__title">{t('mainMenu.title')}</h1>
        <nav class="f2-mainmenu__nav" aria-label={t('mainMenu.nav')}>
          {v.lastSave !== null && (
            <Button variant="primary" onPress={() => commands.loadLast()}>
              <span data-testid="menu-load-last">{t('mainMenu.loadLast')}</span>
            </Button>
          )}
          <Button
            variant={v.lastSave === null ? 'primary' : 'secondary'}
            onPress={() => commands.newGame()}
          >
            <span data-testid="menu-new">{t('mainMenu.new')}</span>
          </Button>
          <Button variant="secondary" onPress={() => commands.load()}>
            <span data-testid="menu-load">{t('mainMenu.load')}</span>
          </Button>
          <Button variant="secondary" onPress={() => commands.openSettings()}>
            <span data-testid="menu-settings">{t('mainMenu.settings')}</span>
          </Button>
          <Button variant="secondary" onPress={() => commands.showCredits()}>
            <span data-testid="menu-credits">{t('mainMenu.credits')}</span>
          </Button>
          {canQuit && commands.quit && (
            <Button variant="secondary" onPress={() => commands.quit?.()}>
              <span data-testid="menu-quit">{t('mainMenu.quit')}</span>
            </Button>
          )}
        </nav>
        {version && (
          <p class="f2-mainmenu__version" data-testid="menu-version">
            {t('mainMenu.version', { version })}
          </p>
        )}
      </main>
    );
  }

  const entries = MENU_ENTRIES.filter((e) => e.run(v, commands, canQuit));
  return (
    <main class="f2-mainmenu f2-mainmenu--art" data-testid="main-menu-screen">
      <h1 class="f2-sr-only">{t('mainMenu.title')}</h1>
      <ArtStage background="menu.bg" minTouch>
        <nav class="f2-mainmenu__nav f2-mainmenu__nav--art" aria-label={t('mainMenu.nav')}>
          {mode === 'touch' ? (
            <div class="f2-mainmenu__list">
              {entries.map((e) => (
                <button
                  key={e.testid}
                  type="button"
                  class="f2-mainmenu__entry"
                  data-variant={e.variant(v)}
                  style={{ minHeight: '44px', minWidth: '44px' }}
                  onClick={() => e.action(commands)}
                >
                  <span data-testid={e.testid}>{t(e.labelKey)}</span>
                </button>
              ))}
            </div>
          ) : (
            entries.map((e, i) => (
              <ArtAt
                key={e.testid}
                x={MENU_ENTRY_X}
                y={MENU_ENTRY_Y0 + i * MENU_ENTRY_PITCH}
                w={MENU_ENTRY_W}
                h={MENU_ENTRY_H}
              >
                <button
                  type="button"
                  class="f2-mainmenu__entry"
                  data-variant={e.variant(v)}
                  onClick={() => e.action(commands)}
                >
                  <span data-testid={e.testid}>{t(e.labelKey)}</span>
                </button>
              </ArtAt>
            ))
          )}
        </nav>
        {version && (
          <ArtAt x={190} y={440} w={260} h={20}>
            <p class="f2-mainmenu__version f2-mainmenu__version--art" data-testid="menu-version">
              {t('mainMenu.version', { version })}
            </p>
          </ArtAt>
        )}
      </ArtStage>
    </main>
  );
}
