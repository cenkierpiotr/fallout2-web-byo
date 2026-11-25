// partyMemberIncLevels 0x495b60 (R17-U1, D). Rzut: 0x495d19 wola 0x4a30c0 z (min=0, max=100), wynik
// inclusive w [0,100]; awans gdy rzut <= m*100/level_up_every (skok JG 0x495d22 pomija awans). Reset
// flagi (0x495cda..0x495ce0) i indeks level_pids[applied przed zwiekszeniem] (0x495d3f) tez D.
import type { Rng } from '../types.js';
import { NEW_PARTY_COUNTERS, type PartyLevelCounters, type PartyLevelDef } from './types.js';

export interface PartyLevelUpResult {
  levelUp: boolean;
  /** pid protosa po awansie; null gdy brak awansu albo brak kolejnego pid */
  newPid: number | null;
  counters: PartyLevelCounters;
}

/** Czyste sprawdzenie awansu jednego towarzysza po awansie gracza. Nie mutuje wejscia. */
export function partyLevelUpCheck(
  def: PartyLevelDef,
  counters: PartyLevelCounters,
  playerLevel: number,
  rng: Rng,
): PartyLevelUpResult {
  const c: PartyLevelCounters = { ...NEW_PARTY_COUNTERS, ...counters };
  const none = { levelUp: false, newPid: null, counters: c };
  if (def.levelUpEvery === 0) return none;
  // Brak kolejnego pid: towarzysz zostaje na ostatnim, bez wyjatku (Review Focus 5).
  if (playerLevel < def.levelMinimum || c.applied >= def.levelPids.length) return none;
  const checks = c.checks + 1;
  const m = checks % def.levelUpEvery;
  let roll = c.roll;
  // D: 0x495cd6: m == 0 i flaga ustawiona -> tylko zerowanie flagi, bez awansu.
  if (m === 0 && roll) roll = false;
  else if (!roll && (m === 0 || rng.int(0, 100) <= Math.floor((m * 100) / def.levelUpEvery))) {
    const newPid = def.levelPids[c.applied] ?? null;
    return {
      levelUp: true,
      newPid,
      counters: { applied: c.applied + 1, checks, roll: m !== 0 },
    };
  }
  return { levelUp: false, newPid: null, counters: { applied: c.applied, checks, roll } };
}
