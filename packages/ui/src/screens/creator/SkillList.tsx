import { Tooltip } from '../../components';
import { t } from '../../i18n';
import { TAGS_REQUIRED, type SkillItem } from './types';

export interface SkillListProps {
  skills: SkillItem[];
  tagsUsed: number;
  onToggleTag: (id: number) => void;
}

/** Lista umiejetnosci z wartoscia i przelacznikiem taga (3 tagi). */
export function SkillList({ skills, tagsUsed, onToggleTag }: SkillListProps) {
  return (
    <div class="f2-creator__skills" data-testid="skill-list">
      <p class="f2-creator__counter" data-testid="tags-counter">
        {t('creator.skills.tags', { used: tagsUsed, max: TAGS_REQUIRED })}
      </p>
      <ul class="f2-creator__list">
        {skills.map((s) => {
          const blocked = !s.tagged && tagsUsed >= TAGS_REQUIRED;
          return (
            <li key={s.id} class="f2-creator__skill" data-tagged={String(s.tagged)}>
              <Tooltip content={s.description}>
                <span class="f2-creator__skill-name">{s.name}</span>
              </Tooltip>
              <span class="f2-creator__skill-value">{s.value}%</span>
              <button
                type="button"
                class={`f2-button f2-button--${s.tagged ? 'primary' : 'secondary'} f2-button--md`}
                aria-pressed={s.tagged}
                aria-label={t('creator.skills.tag', { name: s.name })}
                disabled={blocked}
                onClick={() => onToggleTag(s.id)}
              >
                {s.tagged ? t('creator.skills.tagged') : t('creator.skills.untagged')}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
