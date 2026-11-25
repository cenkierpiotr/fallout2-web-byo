import { effect, signal } from '@preact/signals';
import { detectInputProfile, readInputEnv } from '@f2/input';
import { ThemeProvider, ToastProvider, setLocale as setUiLocale } from '@f2/ui';
import { locale, setLocale, t } from './i18n';
import { error, indexedEntries, progress, status, verification } from './state/game-folder';
import { FolderPicker } from './screens/asset-browser/FolderPicker';
import { MovieShelf } from './screens/movie/MovieShelf';
import { getTelemetry } from './telemetry/singleton';
import { BackupPanel } from './screens/BackupPanel';
import { Onboarding } from './screens/Onboarding';
import {
  backupOpen,
  fullscreen,
  inGame,
  startPanelHidden,
  startPanelOpen,
  toggleDocumentFullscreen,
} from './state/shell-ui';
import { requestPersistence } from './state/storage-persistence';
import { releaseLabel } from './state/onboarding';
import { applyUiScale, settings } from './settings';
import { ProfileSelect } from './screens/profiles/ProfileSelect';
import { AutosaveIndicator } from './screens/profiles/AutosaveIndicator';
import {
  activeProfileId,
  initProfiles,
  openProfileSwitcher,
  profileGate,
  profiles,
} from './state/profiles';

import { lazyScreen } from './lazy-screen';
import { GameSelect, activeGame, setGame, type GameId } from './screens/GameSelect';
import { GameUiArt } from './art/GameUiArt';
import { TopbarVersion } from './components/TopbarVersion';

// Ciezkie ekrany ladowane leniwie (osobne chunki), poza sciezka startu.
const AssetBrowser = lazyScreen(() =>
  import('./screens/asset-browser/AssetBrowser').then((m) => m.AssetBrowser),
);
const SoundBrowser = lazyScreen(() =>
  import('./screens/sound/SoundBrowser').then((m) => m.SoundBrowser),
);
const GameShell = lazyScreen(() => import('./screens/GameShell').then((m) => m.GameShell));
const MapView = lazyScreen(() => import('./screens/map/MapView').then((m) => m.MapView));
const MovieScreen = lazyScreen(() =>
  import('./screens/movie/MovieScreen').then((m) => m.MovieScreen),
);
const DiagnosticsScreen = lazyScreen(() =>
  import('./screens/DiagnosticsScreen').then((m) => m.DiagnosticsScreen),
);
// Fallout 1 CE (WASM): ciezki silnik, ladowany dopiero przy pierwszym wybraniu gry F1.
const Fo1Screen = lazyScreen(() => import('./screens/Fo1Screen').then((m) => m.Fo1Screen));

type ProfileChoice = 'auto' | 'desktop' | 'touch';

/** Czy user juz wybral gre (F2/FO1); wybor pamietany, przycisk zmiany w topbarze. */
function loadGameChosen(): boolean {
  try {
    const v = localStorage.getItem('f2.game');
    return v === 'f2' || v === 'fo1';
  } catch {
    return false;
  }
}

function savedProfile(): ProfileChoice {
  try {
    const s = localStorage.getItem('profile');
    if (s === 'desktop' || s === 'touch') return s;
  } catch {
    /* ignoruj */
  }
  return 'auto';
}

void initProfiles(t('profiles.defaultName'));

type TabId = 'play' | 'maps' | 'browser' | 'sound' | 'diagnostics';
const TABS: readonly TabId[] = ['play', 'maps', 'browser', 'sound', 'diagnostics'];
const START_TAB: TabId = 'play';
const tab = signal<TabId>(START_TAB);
// Wybor gry (F2/FO1) jest pamietany; pierwszy start pokazuje GameSelect.
const gameChosen = signal<boolean>(loadGameChosen());

// Telemetria tylko lokalna (IndexedDB, bez wysylania); singleton, bledy globalne zapisywane do dziennika.
void getTelemetry();

const profileChoice = signal<ProfileChoice>(savedProfile());

effect(() => setUiLocale(locale.value));

// Skala UI z ustawien -> zmienna CSS --ui-scale na <html>.
effect(() => applyUiScale(document.documentElement, settings.value.uiScale));

// Po udanym otwarciu gry prosimy o trwaly magazyn (iOS/Safari czyszcza dane witryny po okresie bezczynnosci).
effect(() => {
  if (status.value === 'ready') void requestPersistence();
});

function effectiveProfile(choice: ProfileChoice): 'desktop' | 'touch' {
  const detected = detectInputProfile(readInputEnv(window));
  return choice === 'auto' ? (detected === 'touch' ? 'touch' : 'desktop') : choice;
}

effect(() => {
  const choice = profileChoice.value;
  const effective = effectiveProfile(choice);
  document.documentElement.dataset['profile'] = effective;
});

function cycleProfile(): void {
  const order: ProfileChoice[] = ['auto', 'desktop', 'touch'];
  const next = order[(order.indexOf(profileChoice.value) + 1) % order.length] ?? 'auto';
  profileChoice.value = next;
  try {
    localStorage.setItem('profile', next);
  } catch {
    /* ignoruj */
  }
}

function statusText(): string {
  const st = status.value;
  const p = progress.value;
  if (st === 'copying') return t('folder.copying', { done: p?.done ?? 0, total: p?.total ?? 0 });
  if (st === 'indexing') return t('folder.indexing');
  if (st === 'ready') {
    const v = verification.value;
    const base = t('folder.indexed', { entries: indexedEntries.value });
    if (v.phase === 'running')
      return `${base} | ${t('firstrun.verify.running', { name: v.name.toUpperCase(), pct: v.pct })}`;
    if (v.phase === 'done') {
      const r = v.result;
      const msg =
        r.status === 'verified'
          ? t('firstrun.verify.verified', { edition: r.edition ?? '' })
          : t(`firstrun.verify.${r.status}`);
      return `${base} | ${msg}`;
    }
    return base;
  }
  if (st === 'error') return error.value ?? '';
  return '';
}

/** Wysokosc paska gornego -> --topbar-h, zeby pelnoekranowe menu glowne nie zakrywalo przycisku profilu i jezyka. */
function trackTopbar(el: HTMLElement | null): void {
  if (!el) return;
  const set = (): void =>
    document.documentElement.style.setProperty('--topbar-h', `${el.offsetHeight}px`);
  set();
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(set).observe(el);
}

export function App() {
  const ready = status.value === 'ready';
  const isF2 = activeGame.value === 'f2';
  return (
    <ThemeProvider profile={effectiveProfile(profileChoice.value)}>
      <ToastProvider>
        <GameUiArt>
          <div
            class={[
              'app',
              startPanelHidden() ? 'app--ingame' : '',
              backupOpen.value ? 'app--backup-open' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            data-ingame={inGame.value}
          >
            <header class="topbar" ref={trackTopbar}>
              <h1>{t('app.title')}</h1>
              {gameChosen.value && (
                <div
                  class="game-switch"
                  data-testid="game-switch"
                  role="group"
                  aria-label={t('app.gameSwitch')}
                >
                  {(['f2', 'fo1'] as const).map((g) => (
                    <button
                      type="button"
                      key={g}
                      data-testid={`game-switch-${g}`}
                      aria-pressed={activeGame.value === g}
                      class={
                        activeGame.value === g ? 'game-switch__btn is-active' : 'game-switch__btn'
                      }
                      onClick={(): void => {
                        if (activeGame.value === g) return;
                        if (g === 'fo1') backupOpen.value = false;
                        setGame(g);
                        if (g === 'f2') tab.value = START_TAB;
                      }}
                    >
                      {t(g === 'f2' ? 'app.gameSwitchF2' : 'app.gameSwitchF1')}
                    </button>
                  ))}
                </div>
              )}
              <button type="button" aria-label={t('profile.aria')} onClick={cycleProfile}>
                {t(`profile.${profileChoice.value}`)}
              </button>
              <button type="button" data-testid="profile-switch" onClick={openProfileSwitcher}>
                {t('profiles.switch', {
                  name: profiles.value.find((p) => p.id === activeProfileId.value)?.name ?? '-',
                })}
              </button>
              {gameChosen.value && isF2 && (
                <button
                  type="button"
                  data-testid="topbar-fullscreen"
                  aria-pressed={fullscreen.value}
                  onClick={toggleDocumentFullscreen}
                >
                  {fullscreen.value ? t('fo1.windowed') : t('fo1.fullscreen')}
                </button>
              )}
              {gameChosen.value && isF2 && (
                <button
                  type="button"
                  data-testid="backup-toggle"
                  aria-expanded={backupOpen.value}
                  aria-pressed={backupOpen.value}
                  onClick={() => (backupOpen.value = !backupOpen.value)}
                >
                  {t('app.backup')}
                </button>
              )}
              {inGame.value && (
                <button
                  type="button"
                  data-testid="start-panel-toggle"
                  aria-expanded={startPanelOpen.value}
                  onClick={() => (startPanelOpen.value = !startPanelOpen.value)}
                >
                  {t('app.startPanel')}
                </button>
              )}
              {(['pl', 'en'] as const).map((l) => (
                <button
                  type="button"
                  key={l}
                  data-testid={`lang-${l}`}
                  aria-pressed={locale.value === l}
                  onClick={() => setLocale(l)}
                >
                  {t(`lang.${l}`)}
                </button>
              ))}
              <TopbarVersion
                version={(import.meta.env.BUNDLE_VERSION as string | undefined) ?? 'dev'}
              />
            </header>
            <Onboarding
              label={releaseLabel(verification.value, t('onboarding.detect.pending'))}
            />
            {gameChosen.value && isF2 && <MovieShelf />}
            {gameChosen.value && isF2 && (
              <p
                class={status.value === 'error' ? 'status error' : 'status muted'}
                data-testid="status-text"
                role="status"
              >
                {statusText()}
              </p>
            )}
            {ready && isF2 && (
              <nav class="tabs">
                {TABS.map((id) => (
                  <button
                    type="button"
                    key={id}
                    data-testid={`tab-${id}`}
                    aria-pressed={tab.value === id}
                    onClick={() => (tab.value = id)}
                  >
                    {id === 'play' ? (locale.value === 'pl' ? 'Graj' : 'Play') : t(`tab.${id}`)}
                  </button>
                ))}
              </nav>
            )}
            <AutosaveIndicator />
            <main class="main">
              {!gameChosen.value ? (
                <GameSelect
                  onChoose={(g: GameId): void => {
                    setGame(g);
                    gameChosen.value = true;
                    if (g === 'f2') tab.value = START_TAB;
                  }}
                />
              ) : !isF2 ? (
                // Fallout 1 CE (WASM) zyje poza bramkami F2: profile i folder gry F2 nie dotycza Fo1.
                <Fo1Screen />
              ) : profileGate.value ? (
                <ProfileSelect />
              ) : !ready ? (
                <FolderPicker />
              ) : tab.value === 'play' ? (
                <GameShell />
              ) : tab.value === 'maps' ? (
                <MapView />
              ) : tab.value === 'sound' ? (
                <SoundBrowser />
              ) : tab.value === 'diagnostics' ? (
                <DiagnosticsScreen telemetry={getTelemetry()} />
              ) : (
                <AssetBrowser />
              )}
            </main>
            {gameChosen.value && isF2 && (backupOpen.value || startPanelOpen.value || !inGame.value) && (
              <BackupPanel onClose={() => (backupOpen.value = false)} />
            )}
            <MovieScreen />
          </div>
        </GameUiArt>
      </ToastProvider>
    </ThemeProvider>
  );
}
