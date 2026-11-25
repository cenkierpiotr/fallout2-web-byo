import {
  parseAiTxt,
  parseEndgameTable,
  parseEnddeathTable,
  parseHolodiskTxt,
  parseKarmavarTxt,
  parsePartyTxt,
  parseQuestsTxt,
  type DeathSlide,
  type EndgameSlide,
  type HolodiskDef,
  type KarmaVarDef,
  type PartyMemberDef,
  type QuestDef,
} from '@f2/formats';
import { AiPacketTable } from '@f2/rules';
import type { VirtualFs } from '@f2/vfs';
import type { PipboyMsgResolver } from '@f2/ui';
import { setCombatAiData } from './combat-ai-data';
import { readGameMsg, type GameMsgOptions } from './msg-read';

export interface GameTables {
  quests: QuestDef[];
  holodisks: HolodiskDef[];
  karmavar: KarmaVarDef[];
  partyDefs: PartyMemberDef[];
  endgame: EndgameSlide[];
  enddeath: DeathSlide[];
  /** Pakiety AI walki z AI.TXT (puste gdy brak pliku). */
  ai: AiPacketTable;
  msg: {
    quests: Map<number, string>;
    pipboy: Map<number, string>;
    map: Map<number, string>;
    combatai: Map<number, string>;
  };
}

const latin1 = (b: Uint8Array): string => new TextDecoder('windows-1252').decode(b);

async function readText(vfs: Pick<VirtualFs, 'open'>, path: string): Promise<string> {
  try {
    return latin1(await vfs.open(path));
  } catch {
    return '';
  }
}

/** Tabele danych gry potrzebne dla zadan, druzyny, Pip-Boya i zakonczenia (brak pliku = pusta tabela). */
export async function loadGameTables(
  vfs: Pick<VirtualFs, 'open'>,
  msgOpts: GameMsgOptions = {},
): Promise<GameTables> {
  const [q, h, k, p, e, d, ai, mq, mp, mm, mc] = await Promise.all([
    readText(vfs, 'data/quests.txt'),
    readText(vfs, 'data/holodisk.txt'),
    readText(vfs, 'data/karmavar.txt'),
    readText(vfs, 'data/party.txt'),
    readText(vfs, 'data/endgame.txt'),
    readText(vfs, 'data/enddeath.txt'),
    readText(vfs, 'data/ai.txt'),
    readGameMsg(vfs, 'quests', msgOpts),
    readGameMsg(vfs, 'pipboy', msgOpts),
    readGameMsg(vfs, 'map', msgOpts),
    readGameMsg(vfs, 'combatai', msgOpts),
  ]);
  const aiTable = new AiPacketTable(parseAiTxt(ai));
  setCombatAiData({ ai: aiTable, combatMsg: mc });
  return {
    quests: parseQuestsTxt(q),
    holodisks: parseHolodiskTxt(h),
    karmavar: parseKarmavarTxt(k),
    partyDefs: parsePartyTxt(p),
    endgame: parseEndgameTable(e).items,
    enddeath: parseEnddeathTable(d).items,
    ai: aiTable,
    msg: { quests: mq, pipboy: mp, map: mm, combatai: mc },
  };
}

/** Resolver numerow MSG dla Pip-Boya (Z: zrodla pliku dla karmy i holodyskow wg adaptera). */
export function pipboyMsgResolver(t: GameTables['msg']): PipboyMsgResolver {
  const get = (m: Map<number, string>, i: number): string => m.get(i) ?? '';
  return {
    location: (i) => get(t.map, i),
    quest: (i) => get(t.quests, i),
    holodiskTitle: (i) => get(t.pipboy, i),
    holodiskText: (i) => get(t.pipboy, i),
    karma: (i) => get(t.pipboy, i),
  };
}
