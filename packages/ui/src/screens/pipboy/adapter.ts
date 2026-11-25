import type { PipboyHolodisk, PipboyKarmaTitle, PipboyQuestGroup } from './types';

/**
 * Ksztalt zgodny strukturalnie z `QuestLogView` z engine-core (galaz m6, `@f2/rules` questStatus):
 * UI nie importuje engine-core ani rules, tylko ten interfejs.
 */
export interface QuestLogLike {
  locations: {
    locationMsg: number;
    quests: { descriptionMsg: number; gvar: number; status: 'active' | 'completed' }[];
  }[];
  holodisks: { gvar: number; titleMsg: number; textMsg: number }[];
  karma: number;
  titles: { pic: number; nameMsg: number; descriptionMsg: number }[];
}

/** Rozwiazanie numeru wiersza MSG na tekst (quests.msg / map.msg / pipboy.msg / editor.msg). */
export interface PipboyMsgResolver {
  location(msg: number): string;
  quest(msg: number): string;
  holodiskTitle(msg: number): string;
  holodiskText(msg: number): string;
  karma(msg: number): string;
}

export interface PipboyLogData {
  quests: PipboyQuestGroup[];
  holodisks: PipboyHolodisk[];
  karma: { value: number; titles: PipboyKarmaTitle[] };
}

/** Zamienia model dziennika (numery MSG) na dane ekranow Pip-Boya (gotowe teksty). */
export function adaptQuestLog(log: QuestLogLike, msg: PipboyMsgResolver): PipboyLogData {
  return {
    quests: log.locations.map((l) => ({
      location: msg.location(l.locationMsg),
      quests: l.quests.map((q) => ({ description: msg.quest(q.descriptionMsg), status: q.status })),
    })),
    holodisks: log.holodisks.map((h) => ({
      id: h.gvar,
      title: msg.holodiskTitle(h.titleMsg),
      text: msg.holodiskText(h.textMsg),
    })),
    karma: {
      value: log.karma,
      titles: log.titles.map((t) => ({
        name: msg.karma(t.nameMsg),
        description: msg.karma(t.descriptionMsg),
      })),
    },
  };
}

/** Dzieli tekst holodysku na strony po `linesPerPage` wierszy (35 wg spec screens.md, Z: zawijanie). */
export function paginateHolodisk(text: string, linesPerPage = 35): string[] {
  const lines = text.split(/\r?\n/);
  const pages: string[] = [];
  for (let i = 0; i < lines.length; i += linesPerPage)
    pages.push(lines.slice(i, i + linesPerPage).join('\n'));
  return pages.length > 0 ? pages : [''];
}

/** Liczba odkrytych kafli w bitmapie automapy. */
export function countRevealed(bits: Uint8Array): number {
  let n = 0;
  for (const b of bits) {
    let v = b;
    while (v) {
      n += v & 1;
      v >>= 1;
    }
  }
  return n;
}

export function isTileRevealed(bits: Uint8Array, width: number, x: number, y: number): boolean {
  const i = y * width + x;
  return ((bits[i >> 3] ?? 0) & (1 << (i & 7))) !== 0;
}
