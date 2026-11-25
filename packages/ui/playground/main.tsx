import { render } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { resolveProfile, toUiProfile, type ProfileEnv } from '../../input/src/input-profile';
import { bindProfile } from '../../app/src/profile-binding';
import { MemoryBackend, SettingsStore, type Settings } from '../../app/src/settings-store';
import { InventoryDemo } from './inventory-demo';
import { BarterDemo } from './barter-demo';
import { DialogDemo } from './dialog-demo';
import { A11yDemo } from './a11y-demo';
import { PipboyDemo } from './pipboy-demo';
import { SavesDemo } from './saves-demo';
import { MsgBrowserDemo } from './msg-browser';
import { RestDemo } from './rest-demo';
import { EndgameDemo } from './endgame-demo';
import '../src/styles/tokens.css';
import '../src/styles/base.css';
import '../src/theme/retro-fonts.css';
import {
  Badge,
  Button,
  CharacterScreen,
  ContextMenu,
  createMockCharacterStore,
  createMockPlayer,
  ControlsTab,
  CreatorScreen,
  createMockCreatorStore,
  useMockCreator,
  Dialog,
  Grid,
  ICON_NAMES,
  Icon,
  IconButton,
  List,
  Modal,
  Panel,
  ProgressBar,
  RadialMenu,
  Select,
  Sheet,
  Slider,
  Tabs,
  ThemeProvider,
  ToastProvider,
  Toggle,
  Tooltip,
  VirtualList,
  useTheme,
  useToast,
  type MenuItem,
  type ProfileName,
  type ThemeName,
} from '../src';

const params = new URLSearchParams(location.search);
const THEMES: ThemeName[] = ['modern', 'retro', 'high-contrast'];
const PROFILES: ProfileName[] = ['desktop', 'touch'];
const initialTheme = THEMES.find((t) => t === params.get('theme')) ?? 'modern';
const initialProfile = PROFILES.find((p) => p === params.get('profile')) ?? 'desktop';
const initialScale = Number(params.get('scale') ?? '1') || 1;

const MENU: MenuItem[] = [
  { id: 'use', label: 'Uzyj', icon: 'use' },
  { id: 'look', label: 'Obejrzyj', icon: 'inventory' },
  { id: 'nope', label: 'Niedostepne', disabled: true },
];

const ROWS = Array.from({ length: 500 }, (_, i) => i + 1);

function Controls() {
  const t = useTheme();
  return (
    <Panel title="Ustawienia podgladu">
      <div class="pg-row">
        <Select
          label="Motyw"
          value={t.theme}
          onChange={(v) => t.setTheme(v as ThemeName)}
          options={THEMES.map((v) => ({ value: v, label: v }))}
        />
        <Select
          label="Profil"
          value={t.profile}
          onChange={(v) => t.setProfile(v as ProfileName)}
          options={PROFILES.map((v) => ({ value: v, label: v }))}
        />
        <Slider
          label="Skala czcionki"
          min={0.85}
          max={1.6}
          step={0.05}
          value={t.fontScale}
          onChange={t.setFontScale}
        />
      </div>
    </Panel>
  );
}

function ToastDemo() {
  const toast = useToast();
  return (
    <Button variant="secondary" onPress={() => toast.show('Zapisano grę', 'ok')}>
      Pokaz toast
    </Button>
  );
}

function Gallery() {
  const [tab, setTab] = useState('a');
  const [on, setOn] = useState(true);
  const [vol, setVol] = useState(40);
  const [lang, setLang] = useState('pl');
  const [modal, setModal] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null);
  const [radial, setRadial] = useState<{ x: number; y: number } | null>(null);
  const [picked, setPicked] = useState('');

  return (
    <main class="pg">
      <h1>Komponenty UI</h1>
      <Controls />

      <Panel title="Przyciski">
        <div class="pg-row">
          <Button variant="primary" onPress={() => {}}>
            Glowny
          </Button>
          <Button variant="secondary" onPress={() => {}}>
            Dodatkowy
          </Button>
          <Button variant="danger" onPress={() => {}}>
            Usun
          </Button>
          <Button variant="primary" disabled onPress={() => {}}>
            Wylaczony
          </Button>
          <Badge tone="ok">OK</Badge>
          <Badge tone="warning">Uwaga</Badge>
          <Badge tone="danger">Blad</Badge>
          <Badge tone="info">Info</Badge>
        </div>
        <div class="pg-row">
          {ICON_NAMES.map((n) => (
            <IconButton key={n} icon={n} label={`Ikona ${n}`} onPress={() => {}} />
          ))}
        </div>
        <p>
          <Icon name="close" /> ikona dekoracyjna
        </p>
      </Panel>

      <Panel title="Paski i kontrolki">
        <ProgressBar value={72} max={100} label="Punkty zycia" tone="hp" />
        <ProgressBar value={6} max={10} label="Punkty akcji" tone="ap" />
        <ProgressBar value={90} max={150} label="Udzwig" tone="weight" />
        <Toggle checked={on} onChange={setOn} label="Dzwiek" />
        <Slider label="Glosnosc" min={0} max={100} step={5} value={vol} onChange={setVol} />
        <Select
          label="Jezyk"
          value={lang}
          onChange={setLang}
          options={[
            { value: 'pl', label: 'Polski' },
            { value: 'en', label: 'English' },
          ]}
        />
        <Tooltip content="Podpowiedz" trigger="info">
          <span>Pole z podpowiedzia</span>
        </Tooltip>
      </Panel>

      <Panel title="Zakladki">
        <Tabs
          items={[
            { id: 'a', label: 'Statystyki' },
            { id: 'b', label: 'Perki' },
            { id: 'c', label: 'Dziennik' },
          ]}
          value={tab}
          placement="top"
          onChange={setTab}
        />
        <p>Aktywna zakladka: {tab}</p>
      </Panel>

      <Panel title="Listy">
        <List
          items={['Pistolet 10mm', 'Stimpak', 'Skorzana kurtka']}
          label="Ekwipunek"
          render={(x) => <span>{x}</span>}
          onSelect={(x) => setPicked(x)}
        />
        <p>Wybrano: {picked || 'nic'}</p>
        <Grid
          items={ROWS.slice(0, 12)}
          minCell={72}
          label="Siatka slotow"
          render={(n) => <span class="pg-cell">{n}</span>}
        />
        <VirtualList
          items={ROWS}
          rowHeight={36}
          height={180}
          label="Dluga lista"
          render={(n) => <span>Wiersz {n}</span>}
        />
      </Panel>

      <Panel title="Dialog gry">
        <Dialog
          speaker="Vic"
          text="Czego szukasz w tych stronach?"
          options={[
            { id: 'a', label: 'Handel' },
            { id: 'b', label: 'Nic', disabled: true },
            { id: 'c', label: 'Do widzenia' },
          ]}
          onChoose={() => {}}
        />
      </Panel>

      <Panel title="Nakladki">
        <div class="pg-row">
          <Button variant="secondary" onPress={() => setModal(true)}>
            Modal
          </Button>
          <Button variant="secondary" onPress={() => setSheet(true)}>
            Sheet
          </Button>
          <Button variant="secondary" onPress={() => setCtx({ x: 40, y: 120 })}>
            Menu kontekstowe
          </Button>
          <Button variant="secondary" onPress={() => setRadial({ x: 200, y: 300 })}>
            Menu radialne
          </Button>
          <ToastDemo />
        </div>
      </Panel>

      <Modal open={modal} title="Potwierdzenie" onClose={() => setModal(false)}>
        <p>Czy na pewno?</p>
        <Button variant="primary" onPress={() => setModal(false)}>
          Tak
        </Button>
      </Modal>
      <Sheet open={sheet} snap="half" onClose={() => setSheet(false)}>
        <p>Zawartosc panelu dolnego.</p>
        <Button variant="secondary" onPress={() => setSheet(false)}>
          Zamknij panel
        </Button>
      </Sheet>
      {ctx && (
        <ContextMenu
          items={MENU}
          anchor={ctx}
          onSelect={() => setCtx(null)}
          onClose={() => setCtx(null)}
        />
      )}
      {radial && (
        <RadialMenu
          items={MENU}
          center={radial}
          onSelect={() => setRadial(null)}
          onClose={() => setRadial(null)}
        />
      )}
    </main>
  );
}

function readEnv(): ProfileEnv {
  return {
    pointerCoarse: matchMedia('(pointer: coarse)').matches,
    maxTouchPoints: navigator.maxTouchPoints,
    width: innerWidth,
  };
}

/** Widok ?view=controls: zakladka sterowania podpieta do SettingsStore i profilu. */
function ControlsDemo() {
  const theme = useTheme();
  const store = useMemo(() => new SettingsStore(new MemoryBackend()), []);
  const [values, setValues] = useState<Settings>(store.snapshot());
  const [gestures, setGestures] = useState(false);
  useEffect(() => {
    const off = store.subscribe(() => setValues(store.snapshot()));
    const offProfile = bindProfile(store, {
      readEnv,
      resolve: resolveProfile,
      toUi: toUiProfile,
      setUiProfile: theme.setProfile,
      setGestures: (on) => {
        document.documentElement.dataset['gestures'] = String(on);
        setGestures(on);
      },
    });
    return () => {
      off();
      offProfile();
    };
  }, [store]);
  return (
    <main class="pg" data-gestures={String(gestures)}>
      <ControlsTab
        values={values}
        detected={resolveProfile('auto', readEnv())}
        onChange={(k, v) => {
          void store.set(k, v as never);
          if (k === 'theme') theme.setTheme(v as ThemeName);
          if (k === 'fontScale') theme.setFontScale(v as number);
        }}
      />
    </main>
  );
}

/** Widok ?view=creator: kreator postaci na atrapie magazynu (adapter GameView w Zadaniu 14). */
function CreatorDemo() {
  const store = useMemo(() => createMockCreatorStore(), []);
  const { view, finished } = useMockCreator(store);
  if (finished) {
    return (
      <main class="pg" data-testid="game-screen">
        <h1>Gra: {view.name}</h1>
      </main>
    );
  }
  return <CreatorScreen view={view} commands={store.commands} />;
}

/** Widok ?view=character: panel postaci na atrapie magazynu (adapter GameView w Zadaniu 14). */
function CharacterDemo() {
  const store = useMemo(
    () =>
      createMockCharacterStore(createMockPlayer({ levelUpPending: params.get('levelup') === '1' })),
    [],
  );
  (window as unknown as { __charCalls: unknown }).__charCalls = store.calls;
  return (
    <main class="pg">
      <CharacterScreen view={store.view} commands={store.commands} />
    </main>
  );
}

const style = document.createElement('style');
style.textContent = `
.pg { max-width: 960px; margin: 0 auto; padding: var(--space-4); display: flex; flex-direction: column; gap: var(--space-4); }
.pg-row { display: flex; flex-wrap: wrap; gap: var(--space-3); align-items: flex-end; }
.msg-table { width: 100%; border-collapse: collapse; }
.msg-table th, .msg-table td { text-align: left; padding: var(--space-2); border-bottom: 1px solid var(--color-border); vertical-align: top; }
.msg-ph { background: var(--color-state-info); color: var(--color-bg-panel); border-radius: var(--radius-sm); padding: 0 2px; }
.pg-cell { display: flex; align-items: center; justify-content: center; min-height: 56px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); }
`;
document.head.append(style);

render(
  <ThemeProvider theme={initialTheme} profile={initialProfile} fontScale={initialScale}>
    <ToastProvider>
      {params.get('view') === 'controls' ? (
        <ControlsDemo />
      ) : params.get('view') === 'creator' ? (
        <CreatorDemo />
      ) : params.get('view') === 'character' ? (
        <CharacterDemo />
      ) : params.get('view') === 'inventory' ? (
        <InventoryDemo />
      ) : params.get('view') === 'barter' ? (
        <BarterDemo />
      ) : params.get('view') === 'dialog' ? (
        <DialogDemo />
      ) : params.get('view') === 'a11y' ? (
        <A11yDemo />
      ) : params.get('view') === 'msg' ? (
        <MsgBrowserDemo />
      ) : params.get('view') === 'rest' ? (
        <RestDemo />
      ) : params.get('view') === 'pipboy' ? (
        <PipboyDemo />
      ) : params.get('view') === 'endgame' ? (
        <EndgameDemo />
      ) : params.get('view') === 'saves' ? (
        <SavesDemo />
      ) : (
        <Gallery />
      )}
    </ToastProvider>
  </ThemeProvider>,
  document.getElementById('app')!,
);
