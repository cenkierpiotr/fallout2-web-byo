/** Parsery karmavar.txt i genrep.txt. */
import { csvRows } from './quests-txt.js';

export interface KarmaVarDef {
  gvar: number;
  pic: number;
  nameMsg: number;
  descriptionMsg: number;
}

export function parseKarmavarTxt(text: string): KarmaVarDef[] {
  return csvRows(text, 4, 'karmavar.txt').map((r) => ({
    gvar: r[0] as number,
    pic: r[1] as number,
    nameMsg: r[2] as number,
    descriptionMsg: r[3] as number,
  }));
}

export interface GenrepDef {
  threshold: number;
  nameMsg: number;
}

/** Posortowane malejaco po progu (stabilnie). */
export function parseGenrepTxt(text: string): GenrepDef[] {
  return csvRows(text, 2, 'genrep.txt')
    .map((r) => ({ threshold: r[0] as number, nameMsg: r[1] as number }))
    .sort((a, b) => b.threshold - a.threshold);
}
