// partyMemberAdd 0x494378 (D). Z: limit Charyzmy (partyLimit), best skill, kolejnosc rekrutacji dialogowej.
import type { PartyEntry } from './types.js';
import { NEW_PARTY_COUNTERS } from './types.js';

export const PARTY_OBJ_FLAGS = 0x404;
export const PARTY_OBJ_ID_BASE = 18000;
/** Zapas ponad liczbe wpisow party.txt (0x14, D). */
export const PARTY_EXTRA_SLOTS = 0x14;

export type PartyAddCode = -1 | 0 | 1;

export interface PartyAddResult {
  /** -1 limit, 0 duplikat lub DENIED (bez zmiany), 1 dodano */
  code: PartyAddCode;
  entries: PartyEntry[];
  /** nowe flagi obiektu (tylko gdy dodano) */
  flags?: number;
  /** nowe id obiektu (tylko gdy dodano) */
  newObjId?: number;
}

/** Id obiektu czlonka: (pid & 0xffffff) + 18000. */
export function partyObjectId(pid: number): number {
  return ((pid & 0xffffff) + PARTY_OBJ_ID_BASE) >>> 0;
}

export function partyMemberAdd(
  entries: readonly PartyEntry[],
  obj: { objId: number; pid: number; flags: number },
  opts: { defCount: number; denied?: boolean },
): PartyAddResult {
  const unchanged = (code: PartyAddCode): PartyAddResult => ({
    code,
    entries: entries.map((e) => ({ ...e })),
  });
  if (entries.length >= opts.defCount + PARTY_EXTRA_SLOTS) return unchanged(-1);
  if (entries.some((e) => e.objId === obj.objId || e.pid === obj.pid)) return unchanged(0);
  if (opts.denied) return unchanged(0); // "partyMemberAdd DENIED" (DAT_00519db4 != 0)
  const newObjId = partyObjectId(obj.pid);
  return {
    code: 1,
    entries: [
      ...entries.map((e) => ({ ...e })),
      { objId: newObjId, pid: obj.pid, counters: { ...NEW_PARTY_COUNTERS } },
    ],
    flags: (obj.flags | PARTY_OBJ_FLAGS) >>> 0,
    newObjId,
  };
}
