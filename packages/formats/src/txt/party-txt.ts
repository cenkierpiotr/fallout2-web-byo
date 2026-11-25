/** Parser party.txt: dozwolone rozkazy i awanse towarzyszy. */
import { parseIni } from './ini.js';

export interface PartyMemberDef {
  index: number;
  pid: number;
  areaAttackMode: string[];
  attackWho: string[];
  bestWeapon: string[];
  chemUse: string[];
  distance: string[];
  runAwayMode: string[];
  disposition: string[];
  levelMinimum: number;
  levelUpEvery: number;
  levelPids: number[];
}

function list(v: string | undefined): string[] {
  if (v === undefined) return [];
  return v
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

function int(section: string, key: string, v: string): number {
  const n = Number(v);
  if (v === '' || !Number.isInteger(n))
    throw new Error(`party.txt [${section}] ${key}: nieprawidlowa liczba '${v}'`);
  return n;
}

export function parsePartyTxt(text: string): PartyMemberDef[] {
  const out: PartyMemberDef[] = [];
  for (const sec of parseIni(text)) {
    const m = /^Party Member (\d+)$/i.exec(sec.name);
    if (!m) continue;
    const e = sec.entries;
    const num = (key: string): number => {
      const v = e.get(key);
      return v === undefined ? 0 : int(sec.name, key, v);
    };
    out.push({
      index: Number(m[1]),
      pid: num('party_member_pid'),
      areaAttackMode: list(e.get('area_attack_mode')),
      attackWho: list(e.get('attack_who')),
      bestWeapon: list(e.get('best_weapon')),
      chemUse: list(e.get('chem_use')),
      distance: list(e.get('distance')),
      runAwayMode: list(e.get('run_away_mode')),
      disposition: list(e.get('disposition')),
      levelMinimum: num('level_minimum'),
      levelUpEvery: num('level_up_every'),
      levelPids: list(e.get('level_pids')).map((s) => int(sec.name, 'level_pids', s)),
    });
  }
  return out;
}
