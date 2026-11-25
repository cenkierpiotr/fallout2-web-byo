import { t } from '../../i18n';

/** Kolejnosc angielskich nazw skilli zgodna z indeksem `Skill` (nazwy w wymaganiach perkow). */
export const SKILL_EN_NAMES = [
  'Small Guns',
  'Big Guns',
  'Energy Weapons',
  'Unarmed',
  'Melee Weapons',
  'Throwing',
  'First Aid',
  'Doctor',
  'Sneak',
  'Lockpick',
  'Steal',
  'Traps',
  'Science',
  'Repair',
  'Speech',
  'Barter',
  'Gambling',
  'Outdoorsman',
];

export const SPECIAL_CODES = ['ST', 'PE', 'EN', 'CH', 'IN', 'AG', 'LK'];

function skillLabel(name: string): string {
  const i = SKILL_EN_NAMES.findIndex((n) => n.toLowerCase() === name.toLowerCase());
  return i >= 0 ? t(`character.skill.${i}`) : name;
}

/** Zamienia kod niespelnionego wymagania z regul na czytelny tekst UI. */
export function formatUnmet(code: string): string {
  let m = /^(ST|PE|EN|CH|IN|AG|LK)<(\d+)$/.exec(code);
  if (m) {
    const i = SPECIAL_CODES.indexOf(m[1] as string);
    return t('character.unmet.statMin', {
      stat: t(`character.special.${i}`),
      value: m[2] as string,
    });
  }
  m = /^(ST|PE|EN|CH|IN|AG|LK)>=(\d+)$/.exec(code);
  if (m) {
    const i = SPECIAL_CODES.indexOf(m[1] as string);
    return t('character.unmet.statMax', {
      stat: t(`character.special.${i}`),
      value: m[2] as string,
    });
  }
  m = /^level<(\d+)$/.exec(code);
  if (m) return t('character.unmet.level', { value: m[1] as string });
  m = /^skill:(.*)<(\d+)$/.exec(code);
  if (m)
    return t('character.unmet.skill', { skill: skillLabel(m[1] as string), value: m[2] as string });
  m = /^perk:(.+)$/.exec(code);
  if (m) return t('character.unmet.perk', { perk: m[1] as string });
  m = /^gvar:(\d+)<(\d+)$/.exec(code);
  if (m) return t('character.unmet.quest');
  if (code === 'max-rank') return t('character.unmet.maxRank');
  if (code === 'not-selectable') return t('character.unmet.notSelectable');
  return t('character.unmet.other', { code });
}
