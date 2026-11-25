import type { ReadonlySignal } from '@preact/signals';
import { useState } from 'preact/hooks';
import { ArtAt, ArtStage, useLayoutMode, useUiArt } from '../../art';
import { Panel, ProgressBar, Tabs } from '../../components';
import { useTheme } from '../../theme/ThemeProvider';
import { t } from '../../i18n';
import { PIPBOY_TABS, type PipboyCommands, type PipboyTabId, type PipboyView } from './types';
import { QuestsTab } from './Quests';
import { ArchivesTab } from './Archives';
import { AutomapTab } from './Automap';
import { AlarmTab } from './Alarm';
import './pipboy.css';

export interface PipboyScreenProps {
  view: ReadonlySignal<PipboyView>;
  /** Poczatkowa zakladka. */
  initialTab?: PipboyTabId;
  /** Gdzie leza zakladki; domyslnie wg profilu (dotyk: na dole). */
  tabsPlacement?: 'top' | 'bottom';
  /** Polecenia do silnika (odpoczynek, skok do obszaru). */
  commands?: PipboyCommands;
}

const TAB_ICON = {
  status: 'character',
  quests: 'skills',
  archives: 'look',
  map: 'map',
  clock: 'end-turn',
} as const;

function StatusTab({ view }: { view: PipboyView['status'] }) {
  return (
    <div class="f2-pipboy__status" data-testid="pipboy-status">
      <h3 class="f2-pipboy__name">{view.name}</h3>
      <p>{t('pipboy.status.level', { level: view.level })}</p>
      <div class="f2-pipboy__bar">
        <span>{t('pipboy.status.hp')}</span>
        <ProgressBar value={view.hp} max={view.hpMax} label={t('pipboy.status.hp')} tone="hp" />
      </div>
      <p>
        {t('pipboy.status.ap')}: {view.ap} / {view.apMax}
      </p>
      <p>{t('pipboy.status.exp', { exp: view.exp, next: view.expNext })}</p>
    </div>
  );
}

/* Wspolrzedne na pip.frm (640x480), zweryfikowane na zrzucie porownawczym (pip-cmp.png):
 * ciemny ekran LCD zaczyna sie w (254,46) i ma 374x410 (zrodlo: fallout1-ce pipboy.cc).
 * CLOSE (y~455) zostaje poza tym prostokatem, czyli odsloniete. */
const LCD = { x: 254, y: 46, w: 374, h: 410 };
/* Przezroczyste hotspoty nad wypalonymi napisami STATUS/AUTOMAPS/ARCHIVES (pip.bg 640x480);
   CLOSE (y~455) zostaje odsloniete. */
const STRIP = { x: 40, y: 330, w: 130, h: 118 };

export function PipboyScreen({
  view,
  initialTab = 'status',
  tabsPlacement,
  commands,
}: PipboyScreenProps) {
  const { profile } = useTheme();
  const placement = tabsPlacement ?? (profile === 'touch' ? 'bottom' : 'top');
  const [tab, setTab] = useState<PipboyTabId>(initialTab);

  // Skorka FRM: tlo pip.frm (640x480) z paskiem zakladek po lewej i ciemnym LCD na srodku.
  // Brak tla (brak danych gry) => fallback 1:1 jak przed skorka. Grafika zczytywana zawsze,
  // zeby kolejnosc hookow byla stabilna rowniez w fallbacku.
  const pipArt = useUiArt('pip.bg');
  const mode = useLayoutMode();

  const tabs = (
    <Tabs
      placement={placement}
      value={tab}
      onChange={(id) => setTab(id as PipboyTabId)}
      items={PIPBOY_TABS.map((id) => ({ id, label: t(`pipboy.tab.${id}`), icon: TAB_ICON[id] }))}
    />
  );

  const panel = (
    <div
      role="tabpanel"
      aria-labelledby={`f2-tab-${tab}`}
      class="f2-pipboy__panel"
      data-testid="pipboy-panel"
    >
      {tab === 'status' && <StatusTab view={view.value.status} />}
      {tab === 'quests' && <QuestsTab groups={view.value.quests} commands={commands} />}
      {tab === 'archives' && (
        <ArchivesTab holodisks={view.value.holodisks} karma={view.value.karma} />
      )}
      {tab === 'map' && <AutomapTab automap={view.value.automap} />}
      {tab === 'clock' && (
        <AlarmTab clock={view.value.clock} blocked={view.value.restBlocked} commands={commands} />
      )}
    </div>
  );

  if (!pipArt) {
    return (
      <Panel class={`f2-pipboy f2-pipboy--tabs-${placement}`}>
        <div data-testid="pipboy-screen" class="f2-pipboy__root" data-tabs={placement}>
          {placement === 'top' && tabs}
          {panel}
          {placement === 'bottom' && tabs}
        </div>
      </Panel>
    );
  }

  // Uklad oryginalu (pip.frm 640x480): ciemny ekran LCD po prawej, przyciski zakladek po lewej.
  // Wspolrzedne potwierdzone na zrzucie tla (pip-cmp.png) i w fallout1-ce pipboy.cc: 254,46 374x410.
  const touch = mode === 'touch';
  return (
    <div class="f2-pipboy f2-pipboy--art" data-tabs={placement}>
      <div class="f2-pipboy__scene">
        <ArtStage background="pip.bg" minTouch={touch}>
          <div
            data-testid="pipboy-screen"
            class="f2-pipboy__root f2-pipboy__root--art"
            data-tabs={placement}
          >
            {touch ? (
              <div class="f2-pipboy__touch">
                <div class="f2-pipboy__lcd">{panel}</div>
                <div class="f2-pipboy__tabs-at f2-pipboy__tabs-at--bottom">{tabs}</div>
              </div>
            ) : (
              <>
                <ArtAt x={LCD.x} y={LCD.y} w={LCD.w} h={LCD.h}>
                  <div class="f2-pipboy__lcd">{panel}</div>
                </ArtAt>
                <ArtAt x={STRIP.x} y={STRIP.y} w={STRIP.w} h={STRIP.h}>
                  <div class="f2-pipboy__tabs-at f2-pipboy__tabs-at--strip">{tabs}</div>
                </ArtAt>
              </>
            )}
          </div>
        </ArtStage>
      </div>
    </div>
  );
}
