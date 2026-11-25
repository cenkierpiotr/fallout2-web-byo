import {
  parseEnddeathTable,
  parseHolodiskTable,
  parseEndgameTable,
  parseQuestsTable,
} from '../../../packages/formats/src/index.js';
import { parseGamText as parseGam, GvarRegistry } from '../../../packages/engine-core/src/index.js';

const dec = (b: Uint8Array): string => new TextDecoder('latin1').decode(b);

/** Wszystkie gvary uzyte w tabelach, ktore nie istnieja w rejestrze (powinno byc pusto). */
export function missingGvars(
  reg: GvarRegistry,
  tables: { endgame: string; enddeath: string; quests: string; holodisk: string },
): number[] {
  const ids = new Set<number>();
  for (const s of parseEndgameTable(tables.endgame).items) ids.add(s.gvar);
  for (const s of parseEnddeathTable(tables.enddeath).items) if (s.gvar !== -1) ids.add(s.gvar);
  for (const q of parseQuestsTable(tables.quests).items) ids.add(q.gvar);
  for (const h of parseHolodiskTable(tables.holodisk).items) ids.add(h.gvar);
  return [...ids].filter((i) => !reg.has(i)).sort((a, b) => a - b);
}

export function renderDump(gamText: string): string {
  const reg = GvarRegistry.fromGam(parseGam(gamText));
  const lines = [
    `# Globale GAM (${reg.size})`,
    '',
    '| id | nazwa | wartosc poczatkowa |',
    '| --- | --- | --- |',
  ];
  for (let i = 0; i < reg.size; i++) lines.push(`| ${i} | ${reg.nameOf(i)} | ${reg.get(i)} |`);
  return lines.join('\n') + '\n';
}

export { dec };
