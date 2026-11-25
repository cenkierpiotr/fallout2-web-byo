import { useState } from 'preact/hooks';
import { Button, Panel, Select, Slider, Tabs } from '../../components';
import { useUiArt } from '../../art';
import { ArtCreator } from './ArtCreator';
import { t } from '../../i18n';
import { useTheme } from '../../theme/ThemeProvider';
import { SkillList } from './SkillList';
import { StatRow } from './StatRow';
import { Summary } from './Summary';
import { TraitPicker } from './TraitPicker';
import type { CreatorCommands, CreatorView } from './types';
import './creator.css';

export interface CreatorScreenProps {
  view: CreatorView;
  commands: CreatorCommands;
}

const STEPS = ['character', 'special', 'skills', 'traits', 'summary'] as const;
type Step = (typeof STEPS)[number];

/** Ekran kreatora postaci: 3 kolumny (desktop) albo kroki z zakladkami na dole (touch). */
export function CreatorScreen({ view, commands }: CreatorScreenProps) {
  const { profile } = useTheme();
  const touch = profile === 'touch';
  const [step, setStep] = useState<Step>('character');
  const [selectedStat, setSelectedStat] = useState(0);
  const stat = view.stats.find((s) => s.id === selectedStat) ?? view.stats[0];
  const bg = useUiArt('creator.bg');

  // Skorka FRM: osobny komponent (wlasne hooki), gdy tlo wczytane; inaczej obecny wyglad.
  if (bg) return <ArtCreator view={view} commands={commands} />;

  const character = (
    <Panel title={t('creator.step.character')} class="f2-creator__panel">
      <label class="f2-creator__field">
        <span>{t('creator.name')}</span>
        <input
          class="f2-creator__input"
          type="text"
          maxLength={11}
          value={view.name}
          data-testid="creator-name"
          onInput={(e) => commands.setName((e.currentTarget as HTMLInputElement).value)}
        />
      </label>
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
          <li key={p.id} class="f2-creator__preset" data-active={String(view.presetId === p.id)}>
            <h4>{p.name}</h4>
            <p>{p.bio}</p>
            <Button
              variant={view.presetId === p.id ? 'primary' : 'secondary'}
              aria-label={t('creator.preset.choose', { name: p.name })}
              onPress={() => commands.applyPreset(p.id)}
            >
              {t('creator.preset.use')}
            </Button>
          </li>
        ))}
      </ul>
    </Panel>
  );

  const special = (
    <Panel title={t('creator.step.special')} class="f2-creator__panel">
      <p class="f2-creator__points" data-testid="points-left-stats">
        {t('creator.points.left', { count: view.pointsLeft })}
      </p>
      {view.stats.map((s) => (
        <StatRow
          key={s.id}
          stat={s}
          pointsLeft={view.pointsLeft}
          onAdjust={(id, d) => commands.adjustStat(id, d)}
          onSelect={setSelectedStat}
        />
      ))}
      {stat && (
        <p class="f2-creator__desc" data-testid="stat-description">
          <strong>{stat.name}</strong> {stat.description}
        </p>
      )}
    </Panel>
  );

  const skills = (
    <Panel title={t('creator.step.skills')} class="f2-creator__panel">
      <SkillList
        skills={view.skills}
        tagsUsed={view.tagsUsed}
        onToggleTag={(id) => commands.toggleTag(id)}
      />
    </Panel>
  );

  const traits = (
    <Panel title={t('creator.step.traits')} class="f2-creator__panel">
      <TraitPicker
        traits={view.traits}
        traitsUsed={view.traitsUsed}
        onToggle={(id) => commands.toggleTrait(id)}
      />
    </Panel>
  );

  const summary = (
    <Panel title={t('creator.step.summary')} class="f2-creator__panel">
      <Summary view={view} onFinish={() => commands.finish()} />
    </Panel>
  );

  if (!touch) {
    return (
      <main class="f2-creator f2-creator--desktop" data-testid="creator-screen">
        <h1 class="f2-creator__title">{t('screen.creator.title')}</h1>
        {character}
        <div class="f2-creator__columns">
          <div class="f2-creator__col">{special}</div>
          <div class="f2-creator__col">{skills}</div>
          <div class="f2-creator__col">
            {traits}
            {summary}
          </div>
        </div>
      </main>
    );
  }

  const idx = STEPS.indexOf(step);
  const next = STEPS[idx + 1];
  const body =
    step === 'character'
      ? character
      : step === 'special'
        ? special
        : step === 'skills'
          ? skills
          : step === 'traits'
            ? traits
            : summary;

  return (
    <main class="f2-creator f2-creator--touch" data-testid="creator-screen">
      <h1 class="f2-creator__title">{t('screen.creator.title')}</h1>
      <div class="f2-creator__step" role="tabpanel" aria-labelledby={`f2-tab-${step}`}>
        {body}
        {next && (
          <Button variant="primary" size="lg" onPress={() => setStep(next)}>
            {t('creator.next')}
          </Button>
        )}
      </div>
      <Tabs
        placement="bottom"
        value={step}
        onChange={(id) => setStep(id as Step)}
        items={STEPS.map((id) => ({ id, label: t(`creator.step.${id}`) }))}
      />
    </main>
  );
}
