import type { CSSProperties } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { Select, Slider } from '../../components';
import {
  ArtAt,
  ArtButton,
  ArtDigits,
  ArtStage,
  ExtrasPanel,
  useLayoutMode,
  useUiArt,
} from '../../art';
import { t } from '../../i18n';
import type { CreatorCommands, CreatorView, PresetItem, SkillItem } from './types';
import { TAGS_REQUIRED, TRAITS_MAX } from './types';

/* Uklad edytora postaci (edtrcrte.frm 640x480; fallout1-ce editor.cc; zmierzone piksele CRT). */
const ART_NAME = { x: 24, y: 5, w: 136, h: 24 };
const ART_STAT_X = 14;
const ART_STAT_Y = 38;
const ART_STAT_STEP = 33;
const ART_POINTS_PLATE = { x: 127, y: 274, w: 30, h: 26 };
const ART_TAGS_PLATE = { x: 520, y: 221, w: 30, h: 26 };
const ART_POINTS = { x: 14, y: 272, w: 108, h: 26 };
const ART_DERIVED = { x: 176, y: 42, w: 135, h: 118 };
const ART_STATUS = { x: 176, y: 177, w: 135, h: 141 };
const ART_SKILLS = { x: 374, y: 28, w: 236, h: 192 };
const ART_TRAITS = { x: 50, y: 350, w: 236, h: 103 };
const ART_DESC = { x: 352, y: 274, w: 268, h: 160 };
const ART_DONE = { x: 448, y: 448, w: 90, h: 26 };

const STEPS = ['character', 'special', 'skills', 'traits', 'summary'] as const;

export interface ArtCreatorProps {
  view: CreatorView;
  commands: CreatorCommands;
}

const TOUCH: CSSProperties = { minWidth: '44px', minHeight: '44px' };

/** Przelacznik taga: grafika wlaczona/wylaczona, a11y aria-pressed; fallback na tekst. */
function TagToggle(props: {
  skill: SkillItem;
  blocked: boolean;
  touch: boolean;
  onToggle: () => void;
}) {
  const on = useUiArt('creator.skill.tag.on');
  const off = useUiArt('creator.skill.tag.off');
  const img = props.skill.tagged ? on : off;
  return (
    <button
      type="button"
      class={`f2-creator__tag-toggle${img ? ' f2-creator__tag-toggle--art' : ' f2-button f2-button--secondary f2-button--sm'}`}
      aria-pressed={props.skill.tagged}
      aria-label={t('creator.skills.tag', { name: props.skill.name })}
      disabled={props.blocked}
      style={props.touch ? TOUCH : undefined}
      onClick={props.onToggle}
    >
      {img ? (
        <img src={img.url} alt="" draggable={false} />
      ) : props.skill.tagged ? (
        t('creator.skills.tagged')
      ) : (
        t('creator.skills.untagged')
      )}
    </button>
  );
}

/** Serwer dev (SPA fallback) zwraca index.html zamiast 404 dla brakujacego pliku pakietu PL: nie pokazuj HTML-a jako opisu. */
export function sanitizeBio(bio: string | undefined): string {
  const b = (bio ?? '').trim();
  return /^<(!doctype|html)\b/i.test(b) ? '' : b;
}

function PresetCard(props: {
  preset: PresetItem;
  active: boolean;
  touch: boolean;
  onUse: () => void;
}) {
  const portrait = useUiArt(`creator.portrait.${props.preset.id}`);
  const bio = sanitizeBio(props.preset.bio);
  return (
    <li class="f2-creator__preset" data-active={String(props.active)}>
      {portrait && <img class="f2-creator__portrait" src={portrait.url} alt="" draggable={false} />}
      <h4>{props.preset.name}</h4>
      {bio && <p>{bio}</p>}
      <button
        type="button"
        class={`f2-button f2-button--${props.active ? 'primary' : 'secondary'} f2-button--sm`}
        aria-label={t('creator.preset.choose', { name: props.preset.name })}
        style={props.touch ? TOUCH : undefined}
        onClick={props.onUse}
      >
        {t('creator.preset.use')}
      </button>
    </li>
  );
}

const reasonText = (r: CreatorView['reasons'][number], view: CreatorView): string =>
  r === 'statPoints'
    ? t('creator.reason.statPoints', { count: view.pointsLeft })
    : r === 'tags'
      ? t('creator.reason.tags', { count: TAGS_REQUIRED - view.tagsUsed })
      : t('creator.reason.name');

/** Skorka FRM kreatora: PC = scena edtrcrte, touch = kroki z zakladkami i grafikami przyciskow. */
export function ArtCreator({ view, commands }: ArtCreatorProps) {
  const mode = useLayoutMode();
  const touch = mode === 'touch';
  const [step, setStep] = useState<(typeof STEPS)[number]>('character');
  const [selectedStat, setSelectedStat] = useState(0);
  const [hint, setHint] = useState<{ name: string; description: string } | null>(null);
  const [isFs, setIsFs] = useState(
    typeof document !== 'undefined' && Boolean(document.fullscreenElement),
  );
  const [extrasOpen, setExtrasOpen] = useState(false);

  useEffect(() => {
    const onFs = () => {
      setIsFs(typeof document !== 'undefined' && Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const toggleFs = () => {
    if (typeof document === 'undefined') return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    } else {
      void document.documentElement.requestFullscreen().catch(() => undefined);
    }
  };
  /** Na PC nazwy sa wypalone w tle (angielskie), nasze polskie tylko dla czytnikow. */
  const nameCls = touch ? '' : ' f2-creator__sr';
  const pickStat = (id: number) => {
    setSelectedStat(id);
    setHint(null);
  };
  const stat = view.stats.find((s) => s.id === selectedStat) ?? view.stats[0];

  const nameInput = (
    <input
      class="f2-creator__input f2-creator__input--art"
      type="text"
      maxLength={11}
      value={view.name}
      placeholder={t('creator.name')}
      aria-label={t('creator.name')}
      data-testid="creator-name"
      onInput={(e) => commands.setName((e.currentTarget as HTMLInputElement).value)}
    />
  );

  const statRows = view.stats.map((s) => (
    <div
      key={s.id}
      class={`f2-creator__artstat${touch ? '' : ' f2-creator__artstat--scene'}`}
      data-testid={`stat-${s.id}`}
      onFocusCapture={() => pickStat(s.id)}
      onMouseEnter={() => pickStat(s.id)}
    >
      <span class={`f2-creator__stat-name${nameCls}`}>{s.name}</span>
      <ArtButton
        up="creator.stat.minus.up"
        down="creator.stat.minus.dn"
        label={t('creator.stat.decrease', { name: s.name })}
        disabled={s.value <= s.min}
        onClick={() => commands.adjustStat(s.id, -1)}
      />
      <span class="f2-creator__stat-value" aria-live="polite">
        <ArtDigits
          value={touch ? s.value : String(Math.max(0, Math.trunc(s.value))).padStart(2, '0')}
          sheet="creator.digits"
          digitWidth={14}
        />
      </span>
      <ArtButton
        up="creator.stat.plus.up"
        down="creator.stat.plus.dn"
        label={t('creator.stat.increase', { name: s.name })}
        disabled={s.value >= s.max || view.pointsLeft <= 0}
        onClick={() => commands.adjustStat(s.id, 1)}
      />
    </div>
  ));

  const pointsStats = (
    <p class={`f2-creator__points${nameCls}`} data-testid="points-left-stats">
      {t('creator.points.left', { count: view.pointsLeft })}
    </p>
  );
  const info = hint ?? stat;
  const desc = info && (
    <p class="f2-creator__desc" data-testid="stat-description">
      <strong>{info.name}</strong> {info.description}
    </p>
  );
  const skillList = (
    <div class="f2-creator__skills" data-testid="skill-list">
      <p class={`f2-creator__counter${nameCls}`} data-testid="tags-counter">
        {t('creator.skills.tags', { used: view.tagsUsed, max: TAGS_REQUIRED })}
      </p>
      <ul class="f2-creator__list">
        {view.skills.map((s) => (
          <li
            key={s.id}
            class="f2-creator__skill"
            data-tagged={String(s.tagged)}
            title={s.description}
            onMouseEnter={() => setHint(s)}
            onFocus={() => setHint(s)}
          >
            <TagToggle
              skill={s}
              blocked={!s.tagged && view.tagsUsed >= TAGS_REQUIRED}
              touch={touch}
              onToggle={() => commands.toggleTag(s.id)}
            />
            <span class="f2-creator__skill-name">{s.name}</span>
            <span class="f2-creator__skill-value">{s.value}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
  const traitPicker = (
    <div class="f2-creator__traits" data-testid="trait-picker">
      <p class="f2-creator__counter" data-testid="traits-counter">
        {t('creator.traits.count', { used: view.traitsUsed, max: TRAITS_MAX })}
      </p>
      <ul class="f2-creator__list f2-creator__list--traits">
        {view.traits.map((tr) => (
          <li key={tr.id} class="f2-creator__trait" data-selected={String(tr.selected)}>
            <button
              type="button"
              class={`f2-button f2-button--${tr.selected ? 'primary' : 'secondary'} f2-button--sm f2-creator__trait-btn`}
              aria-pressed={tr.selected}
              disabled={!tr.selected && view.traitsUsed >= TRAITS_MAX}
              style={touch ? TOUCH : undefined}
              title={tr.description}
              onMouseEnter={() => setHint(tr)}
              onFocus={() => setHint(tr)}
              onClick={() => commands.toggleTrait(tr.id)}
            >
              <span aria-hidden="true" class="f2-creator__trait-dot">{tr.selected ? '●' : '○'}</span> {tr.name}
            </button>
            {touch && <p class="f2-creator__trait-desc">{tr.description}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
  const finishBtn = (
    <div class={`f2-creator__done-wrap${!view.canFinish ? ' is-disabled' : ''}`}>
      <ArtButton
        up="creator.btn.done.up"
        down="creator.btn.done.dn"
        label={t('creator.finish')}
        disabled={!view.canFinish}
        onClick={() => commands.finish()}
      />
      <span class="f2-creator__done-label" aria-hidden="true">
        {t('creator.finish')}
      </span>
    </div>
  );
  const derivedDl = (
    <dl class="f2-creator__derived">
      {view.derived.map((d) => (
        <div key={d.id} class="f2-creator__derived-row">
          <dt>{t(`creator.derived.${d.id}`)}</dt>
          <dd>{d.value}</dd>
        </div>
      ))}
    </dl>
  );
  const statusInner = (
    <>
      <p class="f2-creator__points" data-testid="points-left">
        {t('creator.points.left', { count: view.pointsLeft })}
      </p>
      {view.reasons.length > 0 && (
        <div role="status">
          <ul class="f2-creator__reasons" data-testid="finish-reasons">
            {view.reasons.map((r) => (
              <li key={r}>{reasonText(r, view)}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
  const summary = (
    <div class="f2-creator__summary" data-testid="creator-summary">
      <div class="f2-creator__derived-box">{derivedDl}</div>
      <div class="f2-creator__status-box">{statusInner}</div>
    </div>
  );

  /** Postac: wiek, plec, gotowe postacie. Na PC to panel dodatkow (brak w oryginalnej scenie). */
  const characterExtras = (
    <>
      <Slider
        label={t('creator.age')}
        min={view.ageMin}
        max={view.ageMax}
        step={1}
        value={view.age}
        onChange={(n) => commands.setAge(n)}
      />
      <Select
        label={t('creator.gender')}
        value={view.gender}
        onChange={(v) => commands.setGender(v === 'female' ? 'female' : 'male')}
        options={[
          { value: 'male', label: t('creator.gender.male') },
          { value: 'female', label: t('creator.gender.female') },
        ]}
      />
      <h3 class="f2-creator__subtitle">{t('creator.presets')}</h3>
      <ul class="f2-creator__presets">
        {view.presets.map((p) => (
          <PresetCard
            key={p.id}
            preset={p}
            active={view.presetId === p.id}
            touch={touch}
            onUse={() => commands.applyPreset(p.id)}
          />
        ))}
      </ul>
    </>
  );

  if (!touch) {
    return (
      <main class="f2-creator f2-creator--art" data-testid="creator-screen">
        <h1 class="f2-creator__sr-title">{t('screen.creator.title')}</h1>
        <div class="f2-creator__toolbar" role="toolbar" aria-label={t('screen.creator.title')}>
          <button
            type="button"
            class="f2-creator__fs-toggle"
            data-testid="creator-fullscreen-toggle"
            onClick={toggleFs}
            title={isFs ? t('creator.windowed') : t('creator.fullscreen')}
            aria-pressed={isFs}
          >
            <span aria-hidden="true">{isFs ? '🗗' : '⛶'}</span> {isFs ? t('creator.windowed') : t('creator.fullscreen')}
          </button>
          <button
            type="button"
            class="f2-creator__extras-toggle"
            data-testid="creator-extras-toggle"
            aria-expanded={extrasOpen}
            onClick={() => setExtrasOpen((o) => !o)}
          >
            <span aria-hidden="true">👤</span> {t('creator.step.character')}
          </button>
        </div>
        <div class="f2-creator__scene">
          <ArtStage background="creator.bg">
            <ArtAt {...ART_NAME}>{nameInput}</ArtAt>
            <ArtAt x={ART_STAT_X} y={ART_STAT_Y} w={160} h={ART_STAT_STEP * view.stats.length}>
              <div class="f2-creator__artstats">{statRows}</div>
            </ArtAt>
            <ArtAt {...ART_POINTS}>{pointsStats}</ArtAt>
            <ArtAt {...ART_POINTS_PLATE}>
              <ArtDigits value={String(Math.max(0, view.pointsLeft)).padStart(2, '0')} sheet="creator.digits" digitWidth={14} />
            </ArtAt>
            <ArtAt {...ART_TAGS_PLATE}>
              <ArtDigits value={String(view.tagsUsed).padStart(2, '0')} sheet="creator.digits" digitWidth={14} />
            </ArtAt>
            <ArtAt {...ART_DERIVED}>
              <div class="f2-creator__derived-box" data-testid="creator-summary">
                {derivedDl}
              </div>
            </ArtAt>
            <ArtAt {...ART_STATUS}>
              <div class="f2-creator__status-box">{statusInner}</div>
            </ArtAt>
            <ArtAt {...ART_SKILLS}>
              <div class="f2-creator__scroll">{skillList}</div>
            </ArtAt>
            <ArtAt {...ART_TRAITS}>
              <div class="f2-creator__scroll">{traitPicker}</div>
            </ArtAt>
            <ArtAt {...ART_DESC}>{desc}</ArtAt>
            <ArtAt {...ART_DONE}>{finishBtn}</ArtAt>
          </ArtStage>
        </div>
        <div class={`f2-creator__extras-wrapper${extrasOpen ? ' is-open' : ''}`}>
          <ExtrasPanel title={t('creator.step.character')}>{characterExtras}</ExtrasPanel>
        </div>
      </main>
    );
  }

  const idx = STEPS.indexOf(step);
  const next = STEPS[idx + 1];
  const body =
    step === 'character' ? (
      <>
        <label class="f2-creator__field">
          <span>{t('creator.name')}</span>
          {nameInput}
        </label>
        {characterExtras}
      </>
    ) : step === 'special' ? (
      <>
        {pointsStats}
        <div class="f2-creator__artstats">{statRows}</div>
        {desc}
      </>
    ) : step === 'skills' ? (
      skillList
    ) : step === 'traits' ? (
      traitPicker
    ) : (
      <>
        {summary}
        {finishBtn}
      </>
    );

  return (
    <main class="f2-creator f2-creator--art f2-creator--touch" data-testid="creator-screen">
      <h1 class="f2-creator__sr-title">{t('screen.creator.title')}</h1>
      <div
        class="f2-creator__step f2-creator__step--art"
        role="tabpanel"
        aria-labelledby={`f2-tab-${step}`}
      >
        <h2 class="f2-creator__step-title">{t(`creator.step.${step}`)}</h2>
        {body}
        {next && (
          <button
            type="button"
            class="f2-button f2-button--primary f2-button--lg"
            style={TOUCH}
            onClick={() => setStep(next)}
          >
            {t('creator.next')}
          </button>
        )}
      </div>
      <div
        role="tablist"
        aria-orientation="horizontal"
        class="f2-tabs f2-tabs--bottom f2-creator__tabs-art"
      >
        {STEPS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`f2-tab-${id}`}
            aria-selected={step === id}
            tabIndex={step === id ? 0 : -1}
            class="f2-tab"
            style={TOUCH}
            onClick={() => setStep(id)}
          >
            <span>{t(`creator.step.${id}`)}</span>
          </button>
        ))}
      </div>
    </main>
  );
}
