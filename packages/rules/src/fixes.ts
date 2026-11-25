import protoFixData from '../data/proto-fixes.json' with { type: 'json' };

/**
 * Rejestr poprawek wzgledem oryginalu (ADR-0004): kazda ma przelacznik `rules.fixes.<id>`,
 * opis (PL/EN) i status wdrozenia. Domyslnie aktywne poprawki sa wlaczone; tryb klasyczny
 * (`classicMode`) wylacza wszystkie. Zrodlo roznic: patch nieoficjalny 1.02.25 vs vanilla
 * (`tools/diff-rules/src/patch-diff.ts`, `ddraw.ini`) oraz odchylenia opisane w `dokumentacja techniczna`.
 */
export type FixGroup =
  'skills' | 'worldmap' | 'pathfinding' | 'critters' | 'items' | 'dialog' | 'perks' | 'content';
/** engine: logika regul; proto: wartosci w plikach PRO; content: skrypty, mapy, dialogi. */
export type FixKind = 'engine' | 'proto' | 'content';
/** active: dziala; pending: katalog bez implementacji (przelacznik nieaktywny); external: zalezy od folderu gry. */
export type FixStatus = 'active' | 'pending' | 'external';
/** D dowiedzione, P potwierdzone dokumentacja zrodlowa, Z zalozenie. */
export type FixConfidence = 'D' | 'P' | 'Z';

export interface FixText {
  pl: string;
  en: string;
}
export interface FixDef {
  id: string;
  group: FixGroup;
  kind: FixKind;
  status: FixStatus;
  confidence: FixConfidence;
  origin: 'patch-1.02.25' | 'sfall' | 'spec';
  title: FixText;
  desc: FixText;
}

export type FixFlags = Record<string, boolean>;

const T = (pl: string, en: string): FixText => ({ pl, en });

export const FIX_REGISTRY: readonly FixDef[] = [
  {
    id: 'skillRefundTagTier',
    group: 'skills',
    kind: 'engine',
    status: 'active',
    confidence: 'D',
    origin: 'spec',
    title: T('Pelny zwrot punktow za oznaczony skill', 'Full refund for tagged skills'),
    desc: T(
      'Oryginal zwraca o 1 punkt mniej, gdy cofasz skill oznaczony (tag) przez granice progu kosztu. Poprawka zwraca pelny koszt.',
      'The original refunds 1 point less when you lower a tagged skill across a cost tier. The fix refunds the full cost.',
    ),
  },
  {
    id: 'pathNodeLimit',
    group: 'pathfinding',
    kind: 'engine',
    status: 'active',
    confidence: 'D',
    origin: 'spec',
    title: T('Brak limitu wyszukiwania sciezki', 'No pathfinding node limit'),
    desc: T(
      'Oryginal przerywa A* po 2000 wezlow, wiec daleka sciezka bywa nieznaleziona. Poprawka podnosi limit do 40000 (cala siatka).',
      'The original aborts A* after 2000 nodes, so long routes are sometimes not found. The fix raises the limit to 40000 (whole grid).',
    ),
  },
  {
    id: 'pathfinderFix',
    group: 'perks',
    kind: 'engine',
    status: 'active',
    confidence: 'Z',
    origin: 'sfall',
    title: T('Pathfinder skraca podroz o 25% / 50%', 'Pathfinder cuts travel time by 25% / 50%'),
    desc: T(
      'Perk Pathfinder skraca czas podrozy po mapie swiata o 25% na range (2 rangi: 50%). W oryginale dzialal slabiej. Dokladne zaokraglanie niezweryfikowane (Z).',
      'The Pathfinder perk cuts world map travel time by 25% per rank (2 ranks: 50%). It was weaker in the original. Exact rounding is unverified (Z).',
    ),
  },
  {
    id: 'protoCritterImmunity',
    group: 'critters',
    kind: 'proto',
    status: 'active',
    confidence: 'Z',
    origin: 'patch-1.02.25',
    title: T('Odpornosci wybranych stworzen', 'Selected creature resistances'),
    desc: T(
      'Patch podnosi odpornosci jednego stworzenia do 999 oraz dodaje odpornosc na EMP dwom maszynom/stworom (PID 29, 75, 79). Nazwy stworzen niepotwierdzone (Z).',
      'The patch raises one creature resistances to 999 and adds EMP resistance to two creatures (PIDs 29, 75, 79). Creature names are unconfirmed (Z).',
    ),
  },
  {
    id: 'protoNoBarterFlag',
    group: 'critters',
    kind: 'proto',
    status: 'active',
    confidence: 'P',
    origin: 'patch-1.02.25',
    title: T(
      'Strazniczy reaktora, mutant i parobek nie handluja',
      'Reactor Guard, Powerful Mutant and Ranch Hand do not barter',
    ),
    desc: T(
      'Zdejmuje flage handlu z trzech postaci, ktore nie powinny miec okna handlu (PID 102, 119, 166).',
      'Removes the barter flag from three characters that should not offer trading (PIDs 102, 119, 166).',
    ),
  },
  {
    id: 'protoStealableCritters',
    group: 'critters',
    kind: 'proto',
    status: 'active',
    confidence: 'P',
    origin: 'patch-1.02.25',
    title: T(
      'Mozna okradac Tough Fire Gecko i Aliena',
      'Tough Fire Gecko and Alien can be pickpocketed',
    ),
    desc: T(
      'Zdejmuje flage zakazu kradziezy z dwoch stworzen (PID 240, 241); flaga zakazu upuszczania zostaje.',
      'Removes the no-steal flag from two creatures (PIDs 240, 241); the no-drop flag stays.',
    ),
  },
  {
    id: 'protoK9ArmorClass',
    group: 'critters',
    kind: 'proto',
    status: 'active',
    confidence: 'Z',
    origin: 'patch-1.02.25',
    title: T('Klasa pancerza cyberpsow K-9', 'K-9 cyberdog armor class'),
    desc: T(
      'Nadaje czterem wariantom cyberpsa bonus do klasy pancerza 26, 27, 28 i 29 (PID 472 do 475).',
      'Gives the four cyberdog variants an armor class bonus of 26, 27, 28 and 29 (PIDs 472 to 475).',
    ),
  },
  {
    id: 'protoItemArt',
    group: 'items',
    kind: 'proto',
    status: 'active',
    confidence: 'P',
    origin: 'patch-1.02.25',
    title: T('Poprawne grafiki trzech przedmiotow', 'Correct art for three items'),
    desc: T(
      'Zamienia zastepcze grafiki na wlasciwe dla przedmiotow PID 276, 277 i 278 (m.in. kamien i skora gekona).',
      'Replaces placeholder art with the correct art for items PID 276, 277 and 278 (e.g. flint and gecko pelt).',
    ),
  },
  {
    id: 'protoQuestItems',
    group: 'items',
    kind: 'proto',
    status: 'active',
    confidence: 'Z',
    origin: 'patch-1.02.25',
    title: T('Poprawki przedmiotow zadaniowych', 'Quest item corrections'),
    desc: T(
      "Koryguje dane przedmiotow zwiazanych z zadaniami: ksiazka, rum, formularz, Verti-Bird, teczka Moore'a, odlamek pomnika, list od Francisa i bron boksera (PID 79, 310, 311, 329, 334, 423, 426, 486, 488). Znaczenie pol danych niepotwierdzone (Z).",
      "Corrects quest-related item data: book, rum, form, Verti-Bird, Moore's briefcase, monument chunk, Francis note and boxer weapon (PIDs 79, 310, 311, 329, 334, 423, 426, 486, 488). Meaning of data fields is unconfirmed (Z).",
    ),
  },
  {
    id: 'protoWeaponSoundSwap',
    group: 'items',
    kind: 'proto',
    status: 'active',
    confidence: 'Z',
    origin: 'patch-1.02.25',
    title: T('Zamiana dzwieku FN FAL i Needlera', 'FN FAL and Needler sound swap'),
    desc: T(
      'Patch zamienia miedzy soba bajt koncowy prototypow FN FAL (350) i Needler Pistol (387), prawdopodobnie dzwiek broni (Z).',
      'The patch swaps the trailing byte between the FN FAL (350) and Needler Pistol (387) prototypes, probably the weapon sound (Z).',
    ),
  },
  {
    id: 'contentPatch',
    group: 'content',
    kind: 'content',
    status: 'external',
    confidence: 'P',
    origin: 'patch-1.02.25',
    title: T('Poprawki skryptow, map i dialogow', 'Script, map and dialog fixes'),
    desc: T(
      'Patch 1.02.25 poprawia setki skryptow, ok. 75 map i ok. 360 dialogow (lista w corrections.txt). Dziala, gdy folder gry zawiera katalog data/ z patchem; nie da sie jej przelaczyc w locie.',
      'Patch 1.02.25 fixes hundreds of scripts, about 75 maps and about 360 dialogs (see corrections.txt). Active when the game folder contains the patch data/ directory; it cannot be toggled at runtime.',
    ),
  },
  {
    id: 'sharpshooterFix',
    group: 'perks',
    kind: 'engine',
    status: 'pending',
    confidence: 'Z',
    origin: 'sfall',
    title: T('Poprawka perka Sharpshooter', 'Sharpshooter perk fix'),
    desc: T(
      'Perk Sharpshooter dziala na percepcje przy liczeniu zasiegu. Czeka na koncowke szansy trafienia (M6).',
      'The Sharpshooter perk correctly affects perception in range calculation. Waiting for the to-hit tail (M6).',
    ),
  },
  {
    id: 'gainStatPerkFix',
    group: 'perks',
    kind: 'engine',
    status: 'pending',
    confidence: 'Z',
    origin: 'sfall',
    title: T('Perki Gain: pelne premie', 'Gain perks: full bonuses'),
    desc: T(
      'Perki Gain (statystyk) daja wszystkie premie, ktore powinny. Niezaimplementowane.',
      'The Gain (stat) perks grant all the bonuses they should. Not implemented yet.',
    ),
  },
  {
    id: 'worldMapEncounterFix',
    group: 'worldmap',
    kind: 'engine',
    status: 'pending',
    confidence: 'Z',
    origin: 'sfall',
    title: T(
      'Spotkania niezalezne od szybkosci podrozy',
      'Encounter rate independent of travel speed',
    ),
    desc: T(
      'Czestosc spotkan na mapie swiata nie zalezy od tempa podrozy. Niezaimplementowane.',
      'World map encounter rate does not depend on travel speed. Not implemented yet.',
    ),
  },
  {
    id: 'bonusMoveFix',
    group: 'perks',
    kind: 'engine',
    status: 'pending',
    confidence: 'Z',
    origin: 'sfall',
    title: T('Premiowy ruch przezywa zapis w walce', 'Bonus move survives saving in combat'),
    desc: T(
      'Premia do ruchu (Bonus Move) nie jest zerowana po zapisie w trakcie walki. Niezaimplementowane.',
      'Bonus Move is not reset when saving during combat. Not implemented yet.',
    ),
  },
  {
    id: 'dialogueFix',
    group: 'dialog',
    kind: 'engine',
    status: 'pending',
    confidence: 'Z',
    origin: 'sfall',
    title: T('Brak ucieczki z dialogu klawiszem 0', 'No escaping dialogue with key 0'),
    desc: T(
      'Nie mozna przerwac rozmowy klawiszem 0 w dowolnym momencie. Niezaimplementowane.',
      'You cannot abort a conversation with key 0 at any time. Not implemented yet.',
    ),
  },
];

const KNOWN = new Set(FIX_REGISTRY.map((f) => f.id));

/**
 * Sklada koncowe flagi: domyslnie aktywne poprawki wlaczone (ADR-0004), nadpisania uzytkownika
 * (`rules.fixes.<id>`) wygrywaja, tryb klasyczny wylacza wszystko. Nieznane klucze odrzucane.
 */
export function resolveFixes(
  overrides: Readonly<Record<string, boolean>>,
  classicMode = false,
): FixFlags {
  const out: FixFlags = {};
  for (const f of FIX_REGISTRY) {
    const def = f.status === 'active';
    const v =
      f.status === 'active' && KNOWN.has(f.id) && f.id in overrides ? overrides[f.id]! : def;
    out[f.id] = classicMode ? false : v;
  }
  return out;
}

export function fixEnabled(
  flags: Readonly<Record<string, boolean>> | undefined,
  id: string,
): boolean {
  return flags?.[id] === true;
}

interface ProtoPatchChange {
  field: string;
  vanilla: number | string;
  patched: number | string;
}
interface ProtoPatch {
  fix: string;
  pid: number;
  changes: ProtoPatchChange[];
}

const PROTO_PATCHES = new Map<number, ProtoPatch[]>();
for (const p of (protoFixData as { patches: ProtoPatch[] }).patches) {
  const list = PROTO_PATCHES.get(p.pid) ?? [];
  list.push(p);
  PROTO_PATCHES.set(p.pid, list);
}

const FIELD = /^([A-Za-z0-9_]+)(?:\[(\d+)\])?$/;

/**
 * Stosuje poprawki prototypu: pole dostaje wartosc z patcha 1.02.25, gdy poprawka wlaczona,
 * inaczej wartosc vanilli. Zwraca nowy obiekt (wejscie bez mutacji) albo to samo wejscie,
 * gdy dla PID nie ma wpisow. Pola `(nowy plik)` pomijane.
 */
export function applyProtoFixes<T extends { pid: number }>(
  proto: T,
  flags: Readonly<Record<string, boolean>>,
): T {
  const patches = PROTO_PATCHES.get(proto.pid);
  if (!patches) return proto;
  const out: Record<string, unknown> = { ...proto };
  for (const p of patches) {
    const on = fixEnabled(flags, p.fix);
    for (const c of p.changes) {
      const m = FIELD.exec(c.field);
      if (!m) continue;
      const value = on ? c.patched : c.vanilla;
      if (m[2] === undefined) out[m[1]!] = value;
      else {
        const arr = Array.isArray(out[m[1]!]) ? [...(out[m[1]!] as unknown[])] : [];
        arr[Number(m[2])] = value;
        out[m[1]!] = arr;
      }
    }
  }
  return out as T;
}

const PATHFINDER_PERCENT_PER_RANK = 25;

/** Czas jednej iteracji podrozy: z `pathfinderFix` skrocony o 25% na range Pathfindera (maks. 2 rangi). */
export function scaleTravelTicks(
  ticks: number,
  pathfinderRank: number,
  flags: Readonly<Record<string, boolean>> | undefined,
): number {
  if (!fixEnabled(flags, 'pathfinderFix')) return ticks;
  const rank = Math.max(0, Math.min(2, Math.trunc(pathfinderRank)));
  return Math.trunc((ticks * (100 - PATHFINDER_PERCENT_PER_RANK * rank)) / 100);
}
