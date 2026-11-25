import { useState } from 'preact/hooks';
import { Toggle } from '../../components';
import { t } from '../../i18n';
import type { PipboyCommands, PipboyQuestGroup } from './types';

export interface QuestsTabProps {
  groups: PipboyQuestGroup[] | undefined;
  commands?: PipboyCommands | undefined;
}

/** Dziennik zadan: grupy per lokacja, filtr "tylko aktywne", skok do obszaru mapy swiata. */
export function QuestsTab({ groups, commands }: QuestsTabProps) {
  const [activeOnly, setActiveOnly] = useState(false);
  const visible = (groups ?? [])
    .map((g) => ({ ...g, quests: g.quests.filter((q) => !activeOnly || q.status === 'active') }))
    .filter((g) => g.quests.length > 0);

  if (!groups || groups.length === 0) {
    return (
      <p class="f2-pipboy__placeholder" data-testid="pipboy-quests-empty">
        {t('pipboy.quests.empty')}
      </p>
    );
  }
  return (
    <div class="f2-pipboy__quests" data-testid="pipboy-quests">
      <Toggle checked={activeOnly} onChange={setActiveOnly} label={t('pipboy.quests.activeOnly')} />
      {visible.map((g) => (
        <section key={g.location} class="f2-pipboy__group">
          <h3 class="f2-pipboy__heading">{g.location}</h3>
          <ol class="f2-pipboy__list">
            {g.quests.map((q, i) => (
              <li
                key={i}
                data-status={q.status}
                class={`f2-pipboy__quest f2-pipboy__quest--${q.status}`}
              >
                <span>{q.description}</span>
                <span class="f2-pipboy__tag">{t(`pipboy.quests.${q.status}`)}</span>
                {q.areaId !== undefined && commands?.focusArea ? (
                  <button
                    type="button"
                    class="f2-pipboy__link"
                    onClick={() => commands.focusArea?.(q.areaId!)}
                  >
                    {t('pipboy.quests.showOnMap')}
                  </button>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
