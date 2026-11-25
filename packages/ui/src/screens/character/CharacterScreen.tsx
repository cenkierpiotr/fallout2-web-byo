import type { ReadonlySignal } from '@preact/signals';
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Panel } from '../../components/Panel';
import { ProgressBar } from '../../components/ProgressBar';
import { Tooltip } from '../../components/Tooltip';
import { ArtAt, ArtStage, useLayoutMode, useUiArt } from '../../art';
import { t, tn } from '../../i18n';
import {
  canDecrease,
  canIncrease,
  draftRemaining,
  draftSteps,
  previewSkill,
  type Draft,
} from './draft';
import { LevelUpSheet } from './LevelUpSheet';
import { PerkPicker } from './PerkPicker';
import type { CharacterCommands, PlayerView, StatView } from './types';
import './character.css';

export interface CharacterScreenProps {
  /** Podzbior `GameView`: tylko gracz. */
  view: { player: ReadonlySignal<PlayerView> };
  commands: CharacterCommands;
}

/* Uklad edytora postaci (edtredt.frm 640x480; fallout1-ce editor.cc). Wspolrzedne z pamieci,
 * wspolne z kreatorem. // TODO verify na prawdziwych danych gry. */
/* Regiony tla edtredt (640x480), zmierzone na grafice: pasek nazwy, 7 okienek SPECIAL (wartosc 56..96, pasek
 * 99..160), srodkowe ramki (stan, atuty), cechy, duze okno umiejetnosci, tasma z licznikiem punktow, pergamin,
 * dolna lewa ramka (komunikaty) i trzy plytki przyciskow. */
const ART_NAME = { x: 20, y: 4, w: 300, h: 20 };
const ART_SPECIAL = { x: 55, y: 36, w: 106, h: 231 };
const ART_STATUS = { x: 180, y: 38, w: 140, h: 114 };
const ART_PERKS = { x: 180, y: 174, w: 140, h: 138 };
const ART_TRAITS = { x: 30, y: 278, w: 136, h: 36 };
const ART_SKILLS = { x: 352, y: 22, w: 266, h: 202 };
const ART_POOL = { x: 352, y: 229, w: 266, h: 24 };
const ART_PARCHMENT = { x: 352, y: 268, w: 266, h: 172 };
const ART_NOTES = { x: 30, y: 360, w: 290, h: 106 };
const ART_ACTIONS = { x: 468, y: 452, w: 162, h: 24 };

const SPECIAL_COUNT = 7;
const SKILL_COUNT = 18;

function sourceLabel(s: StatView['sources'][number]): string {
  return s.name ?? t(`character.source.${s.kind}`);
}

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

function StatTooltip({ stat }: { stat: StatView }) {
  return (
    <div data-testid="stat-sources">
      <div>{t('character.stat.base', { value: stat.base })}</div>
      {stat.sources.length === 0 && stat.bonus === 0 ? (
        <div>{t('character.stat.noBonus')}</div>
      ) : (
        <ul>
          {stat.sources.map((s, i) => (
            <li key={i}>
              {sourceLabel(s)}: {signed(s.amount)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export const CharacterScreen = ({ view, commands }: CharacterScreenProps) => {
  const p = view.player.value;
  const [draft, setDraft] = useState<Draft>({});
  const [error, setError] = useState<string | null>(null);
  const [perkOpen, setPerkOpen] = useState(false);
  const [levelOpen, setLevelOpen] = useState(p.levelUpPending);
  const [seenLevelUp, setSeenLevelUp] = useState(p.levelUpPending);
  const bg = useUiArt('char.bg');
  const artMode = useLayoutMode();

  // nowy awans otwiera arkusz raz
  if (p.levelUpPending && !seenLevelUp) {
    setSeenLevelUp(true);
    setLevelOpen(true);
  } else if (!p.levelUpPending && seenLevelUp) {
    setSeenLevelUp(false);
  }

  const remaining = draftRemaining(p, draft);
  const dirty = draftSteps(draft) > 0;

  const bump = (skill: number, d: 1 | -1) => {
    setDraft((cur) => {
      const n = (cur[skill] ?? 0) + d;
      const next = { ...cur };
      if (n <= 0) delete next[skill];
      else next[skill] = n;
      return next;
    });
  };

  const confirm = () => {
    for (const [k, n] of Object.entries(draft)) {
      for (let i = 0; i < n; i++) {
        const r = commands.spendSkill(Number(k), 1);
        if (!r.ok) {
          setError(r.reason);
          setDraft({});
          return;
        }
      }
    }
    setError(null);
    setDraft({});
  };

  const [note, setNote] = useState<string | null>(null);
  const useIt = (skill: number) => {
    const r = commands.useSkill?.(skill);
    if (!r) return;
    if (r.ok) {
      setError(null);
      setNote(r.message ?? null);
    } else {
      setNote(null);
      setError(r.reason);
    }
  };
  const tagIt = (skill: number) => {
    const r = commands.tagSkill?.(skill);
    if (!r) return;
    if (r.ok) setError(null);
    else setError(r.reason);
  };

  const pickPerk = (perk: number) => {
    const r = commands.choosePerk(perk);
    if (r.ok) {
      setError(null);
      setPerkOpen(false);
    } else setError(r.reason);
  };

  const art = !!bg;
  const touch = art && artMode === 'touch';

  const headContent = (
    <div class="f2-char__head">
      <span data-testid="char-level">{t('character.level', { level: p.level })}</span>
      <span>{t('character.exp', { exp: p.exp, next: p.expNext })}</span>
      <ProgressBar label={t('character.hp')} tone="hp" value={p.hp} max={p.hpMax} />
      <ProgressBar label={t('character.ap')} tone="ap" value={p.ap} max={p.apMax} />
      <span data-testid="char-karma">
        {t('character.karma', { title: p.karmaTitle, value: p.karma })}
      </span>
      <span data-testid="char-kills">{t('character.kills', { count: p.kills })}</span>
    </div>
  );

  const specialContent = (
    <ul class="f2-char__special" data-testid="special-list">
      {p.stats.slice(0, SPECIAL_COUNT).map((st, i) => (
        <li key={i}>
          <Tooltip content={<StatTooltip stat={st} />}>
            <div
              class="f2-char__stat"
              tabIndex={0}
              data-testid={`special-${i}`}
              aria-label={t('character.stat.aria', {
                name: t(`character.special.${i}`),
                value: st.level,
              })}
            >
              <span>{t(`character.special.${i}`)}</span>
              <strong>{st.level}</strong>
              {st.bonus !== 0 && <Badge tone="info">{signed(st.bonus)}</Badge>}
            </div>
          </Tooltip>
        </li>
      ))}
    </ul>
  );

  const skillRows = (
    <ul class="f2-char__skills" data-testid="skill-list">
      {p.skills.slice(0, SKILL_COUNT).map((sk, i) => {
        const steps = draft[i] ?? 0;
        const pv = previewSkill(p, i, steps);
        const name = t(`character.skill.${i}`);
        const inc = canIncrease(p, draft, i);
        return (
          <li
            key={i}
            class={`f2-char__skill${steps > 0 ? ' is-changed' : ''}`}
            title={Number.isFinite(pv.nextCost) ? t('character.skill.preview', { next: pv.nextLevel, cost: pv.nextCost }) : t('character.skill.maxed')}
            data-testid={`skill-${i}`}
          >
            <span class="f2-char__skill-name">
              {name}
              {sk.tagged && <Badge tone="ok">{t('character.tagged')}</Badge>}
            </span>
            <span class="f2-char__skill-level" data-testid={`skill-level-${i}`}>
              {pv.level}%
            </span>
            <span class="f2-char__skill-preview">
              {Number.isFinite(pv.nextCost)
                ? t('character.skill.preview', {
                    next: pv.nextLevel,
                    cost: pv.nextCost,
                  })
                : t('character.skill.maxed')}
            </span>
            <span class="f2-char__skill-actions">
              {p.usableSkills?.includes(i) && commands.useSkill && (
                <Button
                  variant="secondary"
                  data-testid={`skill-use-${i}`}
                  aria-label={t('character.skill.use', { name })}
                  onPress={() => useIt(i)}
                >
                  {t('character.skill.useShort')}
                </Button>
              )}
              {p.tagPending && !sk.tagged && commands.tagSkill && (
                <Button
                  variant="primary"
                  data-testid={`tag-pick-${i}`}
                  aria-label={t('character.tag.pick', { name })}
                  onPress={() => tagIt(i)}
                >
                  {t('character.tag.pickShort')}
                </Button>
              )}
              <span class="f2-char__btn-dec">
                <Button
                  variant="icon"
                  aria-label={t('character.skill.decrease', { name })}
                  disabled={!canDecrease(draft, i)}
                  onPress={() => bump(i, -1)}
                >
                  -
                </Button>
              </span>
              <span class="f2-char__btn-inc">
                <Button
                  variant="icon"
                  aria-label={t('character.skill.increase', { name })}
                  disabled={!inc}
                  onPress={() => bump(i, 1)}
                >
                  +
                </Button>
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
  const skillPool = (
    <div class="f2-char__pool" data-testid="skill-points">
      {tn('character.skillPoints', remaining)}
    </div>
  );
  const skillActions = (
    <div class="f2-char__actions">
      <Button variant="secondary" disabled={!dirty} onPress={() => setDraft({})}>
        {t('character.draft.cancel')}
      </Button>
      <Button variant="primary" disabled={!dirty} onPress={confirm}>
        {t('character.draft.confirm')}
      </Button>
    </div>
  );
  const skillNotes = (
    <>
      {p.tagPending && (
        <p role="status" data-testid="tag-pending">
          {t('character.tag.pending')}
        </p>
      )}
      {note && (
        <p role="status" data-testid="skill-note">
          {note}
        </p>
      )}
      {error && (
        <p role="alert" class="f2-char__error">
          {t('character.error', { reason: error })}
        </p>
      )}
    </>
  );

  const traitsContent =
    p.traits.length === 0 ? (
      <p>{t('character.traits.none')}</p>
    ) : (
      <ul class="f2-char__traits" data-testid="trait-list">
        {p.traits.map((tr) => (
          <li key={tr.id}>
            <Tooltip content={tr.description}>
              <span tabIndex={0}>{tr.name}</span>
            </Tooltip>
          </li>
        ))}
      </ul>
    );

  const perksContent = (
    <>
      {p.perks.length === 0 ? (
        <p>{t('character.perks.none')}</p>
      ) : (
        <ul class="f2-char__perks" data-testid="perk-list">
          {p.perks.map((pk) => (
            <li key={pk.id}>
              <Tooltip content={pk.description}>
                <span tabIndex={0}>
                  {pk.name}
                  {pk.maxRank > 1 ? ` (${pk.rank}/${pk.maxRank})` : ''}
                </span>
              </Tooltip>
            </li>
          ))}
        </ul>
      )}
      {p.unspentPerks > 0 && (
        <Button variant="primary" onPress={() => setPerkOpen(true)}>
          {tn('character.perk.open', p.unspentPerks)}
        </Button>
      )}
    </>
  );

  const dialogs = (
    <>
      <PerkPicker
        open={perkOpen}
        options={p.availablePerks}
        onPick={pickPerk}
        onClose={() => setPerkOpen(false)}
        art={art}
      />
      <LevelUpSheet
        open={levelOpen}
        player={p}
        onConfirm={() => {
          const r = commands.confirmLevelUp();
          if (r.ok) setLevelOpen(false);
          else setError(r.reason);
        }}
        onClose={() => setLevelOpen(false)}
        art={art}
      />
    </>
  );

  /* Skorka FRM: edtredt.frm z naszymi regionami (naglowek, SPECIAL, umiejetnosci, cechy, perki).
   * Dotyk: tlo zostaje, tresc w jednej przewijanej nakladce z celami min 44px. */
  if (art) {
    const section = (title: string, body: ComponentChildren) => (
      <section class="f2-char__art-sec">
        <h3 class="f2-char__art-title">{title}</h3>
        {body}
      </section>
    );
    const head = (
      <section class="f2-char__art-sec">
        <h2 class="f2-char__art-name">{p.name}</h2>
        {headContent}
      </section>
    );
    const name = <h2 class="f2-char__art-name">{p.name}</h2>;
    const special = section(t('character.specialTitle'), specialContent);
    const skills = section(
      t('character.skillsTitle'),
      <>
        {skillPool}
        {skillRows}
        {skillActions}
      </>,
    );
    const traits = section(t('character.traitsTitle'), traitsContent);
    const perks = section(t('character.perksTitle'), perksContent);
    return (
      <div
        class={`f2-char f2-char--art${touch ? ' f2-char--touch' : ''}`}
        data-testid="character-screen"
      >
        <div class="f2-char__scene">
          <ArtStage background="char.bg" minTouch={touch}>
            {touch ? (
              <div class="f2-char__touch-body">
                {head}
                {special}
                {skills}
                {skillNotes}
                {traits}
                {perks}
              </div>
            ) : (
              <>
                <ArtAt {...ART_NAME}>
                  <div class="f2-char__art-region f2-char__art-region--name">{name}</div>
                </ArtAt>
                <ArtAt {...ART_SPECIAL}>
                  <div class="f2-char__art-region f2-char__art-region--special">
                    {specialContent}
                  </div>
                </ArtAt>
                <ArtAt {...ART_STATUS}>
                  <div class="f2-char__art-region f2-char__art-region--status">{headContent}</div>
                </ArtAt>
                <ArtAt {...ART_PERKS}>
                  <div class="f2-char__art-region">{perks}</div>
                </ArtAt>
                <ArtAt {...ART_TRAITS}>
                  <div class="f2-char__art-region f2-char__art-region--traits">{traits}</div>
                </ArtAt>
                <ArtAt {...ART_SKILLS}>
                  <div class="f2-char__art-region f2-char__art-region--skills">{skillRows}</div>
                </ArtAt>
                <ArtAt {...ART_POOL}>
                  <div class="f2-char__art-region f2-char__art-region--pool">{skillPool}</div>
                </ArtAt>
                <ArtAt {...ART_PARCHMENT}>
                  <div class="f2-char__art-region f2-char__art-region--paper" />
                </ArtAt>
                <ArtAt {...ART_NOTES}>
                  <div class="f2-char__art-region f2-char__art-region--notes">{skillNotes}</div>
                </ArtAt>
                <ArtAt {...ART_ACTIONS}>
                  <div class="f2-char__art-region f2-char__art-region--actions">{skillActions}</div>
                </ArtAt>
              </>
            )}
          </ArtStage>
        </div>
        {dialogs}
      </div>
    );
  }

  return (
    <div class="f2-char" data-testid="character-screen">
      <Panel title={p.name}>{headContent}</Panel>
      <Panel title={t('character.specialTitle')}>{specialContent}</Panel>
      <Panel title={t('character.skillsTitle')}>
        {skillPool}
        {skillRows}
        {skillActions}
        {skillNotes}
      </Panel>
      <Panel title={t('character.traitsTitle')}>{traitsContent}</Panel>
      <Panel title={t('character.perksTitle')}>{perksContent}</Panel>
      {dialogs}
    </div>
  );
};
