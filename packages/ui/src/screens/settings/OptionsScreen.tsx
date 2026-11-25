import type { CSSProperties } from 'preact';
import { useState } from 'preact/hooks';
import { Panel, Select, Slider, Tabs, Toggle } from '../../components';
import { ArtAt, ArtStage, ExtrasPanel, useLayoutMode, useUiArt } from '../../art';
import { t } from '../../i18n';
import './options.css';
import type { ProfileSetting } from './ControlsTab';

export type GameSpeedSetting = 'slow' | 'normal' | 'fast';
export type TextLanguageSetting = 'auto' | 'english' | 'polish';

export interface OptionsValues {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  speechVolume: number;
  language: 'pl' | 'en';
  gameTextLanguage: TextLanguageSetting;
  gameDifficulty: 0 | 1 | 2;
  combatDifficulty: 0 | 1 | 2;
  gameSpeed: GameSpeedSetting;
  profile: ProfileSetting;
  classicMode: boolean;
}

/** Jedna poprawka z rejestru `rules.fixes` (tytul i opis juz przetlumaczone przez host). */
export interface OptionsFixItem {
  id: string;
  title: string;
  desc: string;
  status: 'active' | 'pending' | 'external';
  confidence: 'D' | 'P' | 'Z';
  enabled: boolean;
}

export interface OptionsScreenProps {
  values: OptionsValues;
  fixes: OptionsFixItem[];
  detected: 'desktop' | 'touch' | 'hybrid';
  /** Czy pakiet tlumaczen PL jest dostepny w folderze gry. */
  langPackAvailable?: boolean;
  onChange: <K extends keyof OptionsValues>(key: K, value: OptionsValues[K]) => void;
  onFixChange: (id: string, enabled: boolean) => void;
}

type TabId = 'sound' | 'language' | 'game' | 'controls' | 'fixes';
/** Prefiks id zakladek ekranu opcji: odmienny od `f2-tab-` z Tabs/Pipboy, ze dwa moduly
 *  w jednym DOM nigdy nie generowaly duplikatu id (aria-labelledby musi wskazywac unikalnie). */
const TAB_ID = (id: string): string => `f2-opts-tab-${id}`;

const diff = (v: string): 0 | 1 | 2 => (v === '0' ? 0 : v === '2' ? 2 : 1);

/** Ekran opcji: dzwiek, jezyk, gra, sterowanie, poprawki. Komponent bezstanowy (poza aktywna zakladka). */
export function OptionsScreen({
  values,
  fixes,
  detected,
  langPackAvailable = true,
  onChange,
  onFixChange,
}: OptionsScreenProps) {
  const [tab, setTab] = useState<TabId>('sound');
  const bg = useUiArt('opts.bg');
  const tabUp = useUiArt('opts.tab.up');
  const tabDn = useUiArt('opts.tab.dn');
  const layout = useLayoutMode();
  const vol = (
    key: 'masterVolume' | 'musicVolume' | 'sfxVolume' | 'speechVolume',
    label: string,
  ) => (
    <Slider
      min={0}
      max={100}
      step={5}
      value={values[key]}
      label={label}
      onChange={(v) => onChange(key, v)}
    />
  );
  const profile = (p: 'desktop' | 'touch' | 'hybrid') => t(`options.controls.profile.${p}`);

  const soundTab = (
    <div data-testid="options-sound">
      <Panel title={t('options.sound.title')}>
        {vol('masterVolume', t('options.sound.master'))}
        {vol('musicVolume', t('options.sound.music'))}
        {vol('sfxVolume', t('options.sound.sfx'))}
        {vol('speechVolume', t('options.sound.speech'))}
      </Panel>
    </div>
  );
  const languageTab = (
    <Panel title={t('options.language.title')}>
      <Select
        label={t('options.language.ui')}
        value={values.language}
        onChange={(v) => onChange('language', v === 'en' ? 'en' : 'pl')}
        options={[
          { value: 'pl', label: t('options.language.ui.pl') },
          { value: 'en', label: t('options.language.ui.en') },
        ]}
      />
      <Select
        label={t('options.language.text')}
        value={values.gameTextLanguage}
        onChange={(v) =>
          onChange(
            'gameTextLanguage',
            v === 'polish' ? 'polish' : v === 'english' ? 'english' : 'auto',
          )
        }
        options={[
          { value: 'auto', label: t('options.language.text.auto') },
          { value: 'english', label: t('options.language.text.english') },
          {
            value: 'polish',
            label: langPackAvailable
              ? t('options.language.text.polish')
              : `${t('options.language.text.polish')} (${t('options.language.text.unavailable')})`,
            disabled: !langPackAvailable,
          },
        ]}
      />
    </Panel>
  );
  const gameTab = (
    <Panel title={t('options.game.title')}>
      <Select
        label={t('options.game.difficulty')}
        value={String(values.gameDifficulty)}
        onChange={(v) => onChange('gameDifficulty', diff(v))}
        options={[0, 1, 2].map((d) => ({
          value: String(d),
          label: t(`options.game.difficulty.${d}`),
        }))}
      />
      <Select
        label={t('options.game.combatDifficulty')}
        value={String(values.combatDifficulty)}
        onChange={(v) => onChange('combatDifficulty', diff(v))}
        options={[0, 1, 2].map((d) => ({
          value: String(d),
          label: t(`options.game.difficulty.${d}`),
        }))}
      />
      <Select
        label={t('options.game.speed')}
        value={values.gameSpeed}
        onChange={(v) =>
          onChange('gameSpeed', v === 'slow' ? 'slow' : v === 'fast' ? 'fast' : 'normal')
        }
        options={(['slow', 'normal', 'fast'] as const).map((s) => ({
          value: s,
          label: t(`options.game.speed.${s}`),
        }))}
      />
    </Panel>
  );
  const controlsTab = (
    <Panel title={t('options.controls.title')}>
      <Select
        label={t('options.controls.profile')}
        value={values.profile}
        onChange={(v) => onChange('profile', v as ProfileSetting)}
        options={[
          {
            value: 'auto',
            label: t('options.controls.profile.auto', { detected: profile(detected) }),
          },
          { value: 'desktop', label: profile('desktop') },
          { value: 'touch', label: profile('touch') },
          { value: 'hybrid', label: profile('hybrid') },
        ]}
      />
    </Panel>
  );
  const fixesTab = (
    <Panel title={t('options.fixes.title')}>
      <Toggle
        label={t('options.fixes.classic')}
        checked={values.classicMode}
        onChange={(c) => onChange('classicMode', c)}
      />
      <p class="f2-options__hint">{t('options.fixes.classic.hint')}</p>
      <ul class="f2-options__fixes">
        {fixes.map((f) => (
          <li key={f.id} class={`f2-options__fix f2-options__fix--${f.status}`}>
            <Toggle
              label={f.title}
              checked={f.enabled && !values.classicMode}
              disabled={f.status !== 'active' || values.classicMode}
              onChange={(c) => onFixChange(f.id, c)}
            />
            <p class="f2-options__desc">{f.desc}</p>
            <span class="f2-options__badges">
              {f.status === 'pending' && <em>{t('options.fixes.pending')}</em>}
              {f.status === 'external' && <em>{t('options.fixes.external')}</em>}
              <em>{t(`options.fixes.confidence.${f.confidence}`)}</em>
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );

  // Fallback: brak tla opts.bg (bez danych gry, w trakcie ladowania lub bez providera)
  // = dokladnie dotychczasowy uklad CSS.
  if (!bg) {
    return (
      <div class="f2-options" data-testid="options-screen">
        <Tabs
          placement="top"
          value={tab}
          onChange={(id) => setTab(id as TabId)}
          idPrefix="f2-opts"
          items={[
            { id: 'sound', label: t('options.tab.sound') },
            { id: 'language', label: t('options.tab.language') },
            { id: 'game', label: t('options.tab.game') },
            { id: 'controls', label: t('options.tab.controls') },
            { id: 'fixes', label: t('options.tab.fixes') },
          ]}
        />
        {tab === 'sound' && soundTab}
        {tab === 'language' && languageTab}
        {tab === 'game' && gameTab}
        {tab === 'controls' && controlsTab}
        {tab === 'fixes' && fixesTab}
      </div>
    );
  }

  /* Skorka FRM: tlo opbase.frm jako scena ArtStage (164x217) z kolumna zakladek opbtnon.frm
   * (rola tab i nazwa z aria-label zostaja). Oryginalny ekran opcji ma sloty tylko dla
   * dzwieku, gry i poprawek, ale scena jest za mala na ich kontrolki (slidery, selecty, lista
   * poprawek), wiec ich tresc stoi tuz obok sceny w panelu .f2-options__stagetab (przewijalny).
   * Jezyk i sterowanie istnieja tylko w naszej wersji: trafiaja do ExtrasPanel w stylu dodatkow. */
  const touch = layout === 'touch';
  const touchStyle: CSSProperties | undefined = touch
    ? { minWidth: '44px', minHeight: '44px' }
    : undefined;
  const stageTabs = [
    { id: 'sound', label: t('options.tab.sound') },
    { id: 'language', label: t('options.tab.language') },
    { id: 'game', label: t('options.tab.game') },
    { id: 'controls', label: t('options.tab.controls') },
    { id: 'fixes', label: t('options.tab.fixes') },
  ];
  const onTabKey = (e: KeyboardEvent, index: number) => {
    const n = stageTabs.length;
    let next: number;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (index + 1) % n;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (index - 1 + n) % n;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    else return;
    e.preventDefault();
    const target = stageTabs[next];
    if (!target) return;
    setTab(target.id as TabId);
    document.getElementById(TAB_ID(target.id))?.focus();
  };
  const tabW = tabUp?.width ?? 137;
  const tabH = tabUp?.height ?? 34;
  const active = stageTabs.find((x) => x.id === tab);
  return (
    <div
      class="f2-options f2-options--skin"
      data-testid="options-screen"
      data-touch={touch ? '1' : undefined}
    >
      <div class="f2-options__layout">
        <ArtStage background="opts.bg" minTouch={touch}>
          <ArtAt x={14} y={8} w={tabW} h={tabH * stageTabs.length}>
            <div
              class="f2-options__tabs"
              role="tablist"
              aria-orientation="vertical"
              data-testid="options-skin-tabs"
            >
              {stageTabs.map(({ id, label }, index) => {
                const img = tab === id ? (tabDn ?? tabUp) : tabUp;
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    id={TAB_ID(id)}
                    aria-selected={tab === id}
                    aria-controls="f2-options-panel"
                    tabIndex={tab === id ? 0 : -1}
                    class="f2-options__tabart"
                    data-testid={`options-tab-${id}`}
                    aria-label={label}
                    style={touchStyle}
                    onClick={() => setTab(id as TabId)}
                    onKeyDown={(e) => onTabKey(e, index)}
                  >
                    {img && <img src={img.url} alt="" draggable={false} />}
                    <span class="f2-options__tablabel" aria-hidden="true">
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>
          </ArtAt>
        </ArtStage>
        <div
          class="f2-options__stagetab"
          id="f2-options-panel"
          role="tabpanel"
          aria-labelledby={TAB_ID(active?.id ?? 'sound')}
          data-testid="options-stage-tab"
        >
          {tab === 'sound' && soundTab}
          {tab === 'game' && gameTab}
          {tab === 'fixes' && fixesTab}
          {tab === 'language' && (
            <ExtrasPanel title={t('options.extras.title')}>{languageTab}</ExtrasPanel>
          )}
          {tab === 'controls' && (
            <ExtrasPanel title={t('options.extras.title')}>{controlsTab}</ExtrasPanel>
          )}
        </div>
      </div>
    </div>
  );
}
