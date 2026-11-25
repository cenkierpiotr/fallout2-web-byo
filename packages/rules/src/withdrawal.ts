import data from '../data/items.json' with { type: 'json' };
import { DRUG_TABLE, ITEM_PARAMS, type GameObject } from './items.js';
import { Perk, perkRemove } from './perks.js';
import { Trait } from './traits.js';
import type { CritterData } from './types.js';

const W = data.withdrawal;

/**
 * GVAR flagi uzaleznienia (tablica 0x5186c0, R12-U2): Nuka-Cola 21, Buffout 22, Mentats 23, Psycho 24,
 * RadAway 25, Piwo/Booze 26, Jet 296, Deck of Tragic Cards 295. Zwraca undefined dla leku bez uzaleznienia.
 */
export function addictionGvar(drugPid: number): number | undefined {
  return DRUG_TABLE.find((d) => d.drugPid === drugPid)?.addictionIndex;
}

/** Tick startu odstawienia: drug_queue_withdrawal 0x47a290 liczy ebx * 600 (onset w minutach gry). */
export function withdrawalStartTick(nowTicks: number, onsetMinutes: number): number {
  return nowTicks + onsetMinutes * ITEM_PARAMS.ticksPerMinute;
}

/**
 * Czas trwania odstawienia w minutach gry: stale 0x2760 = 10080 (7 dni); trait Chem Reliant (0xb)
 * 0x13b0 = 5040; perk Flower Child (0x2a) polowa. Trait i perk dotycza tylko gracza.
 *
 * TODO(R12-U2): spec nie rozstrzyga, czy Flower Child liczy polowe z 10080 czy z juz skroconego
 * 5040, gdy gracz ma OBA (kolejnosc/laczenie w 0x47a290). Tu: kolejne skracanie (10080 -> 5040 -> 2520);
 * wymaga weryfikacji testem referencyjnym.
 */
export function withdrawalDurationMinutes(c: CritterData | undefined): number {
  let minutes: number = W.durationMinutes;
  if (c?.isPlayer) {
    if (c.traits.includes(Trait.ChemReliant)) minutes = W.chemReliantMinutes;
    if ((c.perkRanks[Perk.FlowerChild] ?? 0) > 0) minutes = Math.trunc(minutes / 2);
  }
  return minutes;
}

/** Tick konca odstawienia (zdarzenie typu 0 planowane z poczatku odstawienia, 0x47a290 z edx = 0). */
export function withdrawalEndTick(startTick: number, c: CritterData | undefined): number {
  return startTick + withdrawalDurationMinutes(c) * ITEM_PARAMS.ticksPerMinute;
}

/**
 * Koniec odstawienia (typ 0, 0x47a558): zdjecie efektu odstawienia (0x496ce0), tu perku nadanego przez
 * zdarzenie start dla danego indeksu GVAR.
 *
 * TODO(R12-U2): spec nie mowi, czy koniec czyści tez flage uzaleznienia (GVAR) i pozostale skutki;
 * flaga `addictions[idx]` zostaje nietknieta. Zdarzenie konca (typ 0) jest kolejkowane w engine-core
 * jako 'withdrawal-end'.
 */
export function endWithdrawal(target: GameObject, addictionIndex: number): void {
  const perk = target.withdrawalPerks?.[addictionIndex];
  if (perk === undefined) return;
  if (target.critter) perkRemove(target.critter, perk as Perk);
  delete target.withdrawalPerks![addictionIndex];
}
