import { expForLevel } from '@f2/rules';
import { adaptQuestLog, type PipboyView } from '@f2/ui';
import type { GameSession } from './game-session';
import type { SessionExtras } from './session-extras';
import type { GameTables } from './game-tables';
import { pipboyMsgResolver } from './game-tables';

/** HP maksymalne wg wzoru bazowego 15 + ST + 2*EN (Z: bez perkow i bonusow). */
export function maxHpOf(baseStats: readonly number[]): number {
  return 15 + (baseStats[0] ?? 5) + 2 * (baseStats[2] ?? 5);
}

/** Widok Pip-Boya z sesji: status z arkusza, zadania/holodyski/karma z dziennika zadan. */
export function buildPipboyView(
  session: GameSession,
  extras: SessionExtras | undefined,
  tables: GameTables | undefined,
  name: string,
): PipboyView {
  const sh = session.state.sheet;
  const c = session.view.clock.value;
  const view: PipboyView = {
    status: {
      name,
      level: sh.progress.level,
      hp: sh.hp,
      hpMax: Math.max(sh.hp, maxHpOf(sh.baseStats)),
      ap: 8,
      apMax: 8,
      exp: sh.progress.xp,
      expNext: Math.max(sh.progress.xp, expForLevel(sh.progress.level + 1)),
      day: Math.floor(c.ticks / (10 * 60 * 60 * 24)),
    },
  };
  if (extras && tables) {
    const log = adaptQuestLog(extras.quests.current, pipboyMsgResolver(tables.msg));
    view.quests = log.quests;
    view.holodisks = log.holodisks;
    view.karma = log.karma;
  }
  return view;
}
