import type { PlayerCritter } from '@f2/app/src/character-binding';
import type { PlayerSheet } from './save-world';

/**
 * Rekord krytera gracza (@f2/rules) zywo oparty na arkuszu sesji (`PlayerSheet`).
 * Arkusz moze byc podmieniony przy wczytaniu zapisu, dlatego kazdy dostep czyta go przez `getSheet`.
 * `perkPending` zyje w `progress` arkusza (zapis v4).
 */
export function createSheetCritter(getSheet: () => PlayerSheet): PlayerCritter {
  const tags4: number[] = [-1, -1, -1, -1];
  const syncTags = (): number[] => {
    const src = getSheet().taggedSkills;
    for (let i = 0; i < 4; i++) tags4[i] = src[i] ?? -1;
    return tags4;
  };
  const isIndex = (p: string | symbol): boolean => typeof p === 'string' && /^\d+$/.test(p);
  const tags = new Proxy(tags4, {
    get(target, prop, recv) {
      if (isIndex(prop) || prop === 'slice' || prop === 'indexOf' || prop === 'includes')
        syncTags();
      return Reflect.get(target, prop, recv) as unknown;
    },
    set(target, prop, value, recv) {
      const ok = Reflect.set(target, prop, value, recv);
      if (isIndex(prop)) getSheet().taggedSkills = target.filter((t) => t >= 0);
      return ok;
    },
  });
  const c = {
    isPlayer: true,
    blinded: false,
    carriedWeight: 0,
    heldItemPids: [] as number[],
    hasRealWeaponInHand: false,
    apLeft: 0,
    tags,
  } as unknown as PlayerCritter;
  const def = (name: string, get: () => unknown, set?: (v: never) => void): void => {
    Object.defineProperty(c, name, { get, ...(set ? { set } : {}), enumerable: true });
  };
  def('baseStats', () => getSheet().baseStats);
  def('bonusStats', () => getSheet().statBonuses);
  def('skillRaw', () => getSheet().skills);
  def('perkRanks', () => getSheet().perks);
  def('traits', () => getSheet().traits);
  def(
    'curHP',
    () => getSheet().hp,
    (v: number) => void (getSheet().hp = v),
  );
  def(
    'curRad',
    () => getSheet().radiation,
    (v: number) => void (getSheet().radiation = v),
  );
  def(
    'curPoison',
    () => getSheet().poison,
    (v: number) => void (getSheet().poison = v),
  );
  def(
    'level',
    () => getSheet().progress.level,
    (v: number) => void (getSheet().progress.level = v),
  );
  def(
    'xp',
    () => getSheet().progress.xp,
    (v: number) => void (getSheet().progress.xp = v),
  );
  def(
    'skillPoints',
    () => getSheet().progress.freeSkillPoints,
    (v: number) => void (getSheet().progress.freeSkillPoints = v),
  );
  def(
    'perkPending',
    () => getSheet().progress.perkPending,
    (v: boolean) => void (getSheet().progress.perkPending = v),
  );
  return c;
}
