import data from '../data/items.json' with { type: 'json' };
import { statLevel } from './stats.js';
import { Stat, type CritterData, type RulesContext } from './types.js';
import type { StatDelta } from './timed-effects.js';

export const ITEM_PARAMS = data.params;
export const DRUG_TABLE = data.drugs;
export const BOOK_PARAMS = data.books;

export enum ItemType {
  Armor = 0,
  Container = 1,
  Drug = 2,
  Weapon = 3,
  Ammo = 4,
  Misc = 5,
  Key = 6,
}

export enum Slot {
  LeftHand = 0,
  RightHand = 1,
  Armor = 2,
}

interface ProtoBase {
  pid: number;
  size: number;
  weight: number;
  cost: number;
  flags: number;
  flagsExt: number;
}
export interface ArmorProto extends ProtoBase {
  type: ItemType.Armor;
  armorClass: number;
  /** DR wg kolejnosci typow obrazen: normal, laser, fire, plasma, electrical, emp, explosion. */
  damageResistance: number[];
  damageThreshold: number[];
  perk: number;
}
export interface ContainerProto extends ProtoBase {
  type: ItemType.Container;
  maxSize: number;
}
export interface DrugProto extends ProtoBase {
  type: ItemType.Drug;
  statId: [number, number, number];
  instantAmount: [number, number, number];
  duration1: number;
  delayed1Amount: [number, number, number];
  duration2: number;
  delayed2Amount: [number, number, number];
  addictionChance: number;
  withdrawalEffect: number;
  withdrawalOnset: number;
}
export interface WeaponProto extends ProtoBase {
  type: ItemType.Weapon;
  caliber: number;
  maxAmmo: number;
  ammoPid: number;
}
export interface AmmoProto extends ProtoBase {
  type: ItemType.Ammo;
  caliber: number;
  quantityPerStack: number;
}
export interface MiscProto extends ProtoBase {
  type: ItemType.Misc;
}
export interface KeyProto extends ProtoBase {
  type: ItemType.Key;
}
export type ItemProto =
  ArmorProto | ContainerProto | DrugProto | WeaponProto | AmmoProto | MiscProto | KeyProto;

export type ProtoLookup = (pid: number) => ItemProto | undefined;

export interface EquipMeta {
  deltas: StatDelta[];
  isWeapon: boolean;
  /** Perk pancerza nadany przy zalozeniu (zdejmowany przy zdjeciu); brak = nie nadano. */
  perk?: number;
}

/** Lokalny odpowiednik GameObject (engine-core nie istnieje na m4). */
export interface GameObject {
  id: number;
  pid: number;
  /** Kontener nadrzedny (obj+0x7c) albo null. */
  owner: GameObject | null;
  inventory: InventoryItem[];
  /** Ilosc nabojow: zaladowanych w broni albo w stosie amunicji (obj+0x3c). */
  rounds: number;
  /** PID zaladowanej amunicji (obj+0x40). */
  ammoPid: number;
  /** Wyposazenie wg Slot. */
  equipped: [GameObject | null, GameObject | null, GameObject | null];
  equipMeta: [EquipMeta | null, EquipMeta | null, EquipMeta | null];
  /** Dane krytera (tylko dla krytera/gracza). */
  critter?: CritterData;
  /** Aktywne uzaleznienia wg addictionIndex. */
  addictions: Record<number, true>;
  /** Perki odstawienia nadane zdarzeniem withdrawal wg addictionIndex (cofane antidotum). */
  withdrawalPerks?: Record<number, number>;
}

export interface InventoryItem {
  obj: GameObject;
  count: number;
}

export function newGameObject(id: number, pid: number, critter?: CritterData): GameObject {
  const o: GameObject = {
    id,
    pid,
    owner: null,
    inventory: [],
    rounds: 0,
    ammoPid: -1,
    equipped: [null, null, null],
    equipMeta: [null, null, null],
    addictions: {},
  };
  if (critter) o.critter = critter;
  return o;
}

export interface ItemsContext extends RulesContext {
  protos: ProtoLookup;
  /** Generator identyfikatorow dla obiektow tworzonych przy podziale stosow. */
  allocId?: () => number;
}

let fallbackId = 1_000_000;
export function allocObjectId(ctx: ItemsContext): number {
  return ctx.allocId ? ctx.allocId() : fallbackId++;
}

/** Plytka kopia obiektu bez zawartosci/wyposazenia (do dzielenia stosow). */
export function cloneObject(obj: GameObject, ctx: ItemsContext): GameObject {
  const c = newGameObject(allocObjectId(ctx), obj.pid);
  c.rounds = obj.rounds;
  c.ammoPid = obj.ammoPid;
  return c;
}

function sumContents(obj: GameObject, protos: ProtoLookup): number {
  let w = 0;
  for (const it of obj.inventory) w += itemWeight(it.obj, protos) * it.count;
  return w;
}

/** Waga stosu amunicji: pelne stosy po wadze proto (jak dla zaladowanej broni). */
function ammoWeight(p: AmmoProto, rounds: number): number {
  const per = Math.max(1, p.quantityPerStack);
  return rounds > 0 ? (Math.trunc((rounds - 1) / per) + 1) * p.weight : p.weight;
}

/** Flaga flagsExt: przedmiot ukryty/naturalny (bron krytterow); waga 0 (0x477b88, 0x4776e0, 0x477770). */
export const HIDDEN_ITEM_FLAG_EXT = 0x8000000;

/** PID pancerzy wspomaganych, ktorych waga jest dzielona przez 2 (0x477b88): 3, 0xe8, 0x15c, 0x15d. */
const HALF_WEIGHT_ARMOR_PIDS: ReadonlySet<number> = new Set([3, 0xe8, 0x15c, 0x15d]);

/** Czy proto jest przedmiotem ukrytym (flagsExt 0x8000000). */
export function isHiddenItem(p: ItemProto | undefined): boolean {
  return p !== undefined && (p.flagsExt & HIDDEN_ITEM_FLAG_EXT) !== 0;
}

/**
 * f2_item_weight (0x477b88): waga proto (0 dla ukrytych), pojemnik + zawartosc,
 * bron + zaladowana amunicja, pancerz wspomagany (4 PID) /2 (calkowite, bez zawartosci).
 */
export function itemWeight(obj: GameObject, protos: ProtoLookup): number {
  const p = protos(obj.pid);
  if (!p) return 0;
  const base = isHiddenItem(p) ? 0 : p.weight;
  switch (p.type) {
    case ItemType.Container:
      return base + sumContents(obj, protos);
    case ItemType.Armor:
      return HALF_WEIGHT_ARMOR_PIDS.has(obj.pid) ? Math.trunc(base / 2) : base;
    case ItemType.Weapon: {
      const ammo = obj.rounds > 0 ? protos(obj.ammoPid) : undefined;
      if (ammo?.type === ItemType.Ammo) return base + ammoWeight(ammo, obj.rounds);
      return base;
    }
    case ItemType.Ammo:
      return ammoWeight(p, obj.rounds);
    default:
      return base;
  }
}

/** PID Geiger Counter (wylaczony / wlaczony) i Stealth Boy (wylaczony / wlaczony), 0x4794a4. */
export const ACTIVE_ITEM_PIDS = {
  geigerOff: 0x34,
  geigerOn: 0xcf,
  stealthBoyOff: 0x36,
  stealthBoyOn: 0xd2,
} as const;

/**
 * Przelaczenie przedmiotu aktywowanego (0x4794a4 -> 0x4796d0 wlacz / 0x479898 wylacz):
 * Geiger 0x34 <-> 0xcf, Stealth Boy 0x36 <-> 0xd2. Inne PID: undefined (-1 w oryginale).
 */
export function toggledItemPid(pid: number): number | undefined {
  switch (pid) {
    case ACTIVE_ITEM_PIDS.geigerOff:
      return ACTIVE_ITEM_PIDS.geigerOn;
    case ACTIVE_ITEM_PIDS.geigerOn:
      return ACTIVE_ITEM_PIDS.geigerOff;
    case ACTIVE_ITEM_PIDS.stealthBoyOff:
      return ACTIVE_ITEM_PIDS.stealthBoyOn;
    case ACTIVE_ITEM_PIDS.stealthBoyOn:
      return ACTIVE_ITEM_PIDS.stealthBoyOff;
    default:
      return undefined;
  }
}

/** Przeciazenie (0x42e66c): udzwig (stat 0xc) mniejszy niz waga ekwipunku. */
export function isOverloaded(carryWeight: number, carriedWeight: number): boolean {
  return carryWeight < carriedWeight;
}

/** Suma wag calego inwentarza (f2_inven_weight). */
export function totalWeight(owner: GameObject, protos: ProtoLookup): number {
  return sumContents(owner, protos);
}

/** Suma rozmiarow zawartosci (sprawdzenie pojemnika, add_check 0x477158). */
export function usedSize(owner: GameObject, protos: ProtoLookup): number {
  let s = 0;
  for (const it of owner.inventory) s += (protos(it.obj.pid)?.size ?? 0) * it.count;
  return s;
}

export function containerCapacity(p: ContainerProto): number {
  return p.maxSize;
}

export function isTwoHanded(p: ItemProto | undefined): boolean {
  return p?.type === ItemType.Weapon && (p.flagsExt & ITEM_PARAMS.twoHandedFlagExt) !== 0;
}

export interface BookRead {
  skill: number;
  gained: number;
  minutes: number;
}

/** Czytanie ksiazki wg 0x49b9xx (D: formula zysku i Comprehension; PID-y i skille ksiazek z items.json). */
export function readBook(
  reader: GameObject,
  bookProto: ItemProto,
  ctx: ItemsContext,
): BookRead | null {
  const entry = BOOK_PARAMS.entries.find((e) => e.pid === bookProto.pid);
  if (!entry || !reader.critter) return null;
  const c = reader.critter;
  const current = ctx.skillLevel?.(c, entry.skill) ?? 0;
  // D 0x49ba95..0x49bb09: n = (100 - skill) / 10 (calkowite), Comprehension (perk 0x51): n * 150 / 100;
  // n krokow skill_inc (0x4aa7f8) kazdy +1 (rozmiar kroku W). n <= 0: ksiazka nic nie daje (komunikat 0x321).
  let gain = Math.max(0, Math.trunc((100 - current) / 10));
  if ((c.perkRanks[BOOK_PARAMS.comprehensionPerk] ?? 0) > 0)
    gain = Math.trunc((gain * (100 + BOOK_PARAMS.comprehensionPercent)) / 100);
  const gained = gain;
  const intel = statLevel(c, Stat.Intelligence, ctx);
  const minutes = Math.max(
    BOOK_PARAMS.minMinutes,
    (BOOK_PARAMS.minutesBase - intel) * BOOK_PARAMS.minutesPerIntelligenceDeficit,
  );
  return { skill: entry.skill, gained, minutes };
}
