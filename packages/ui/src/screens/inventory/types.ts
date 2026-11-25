/**
 * Lokalne typy widoku inwentarza (zgodne z Zadaniem 14 planu M4-M5: `InventoryView`,
 * `ContainerView`, komendy `inventory.*` i `container.*`). Adapter `GameView` -> te typy
 * powstanie w Zadaniu 14; do tego czasu ekran dziala na mock-store (`mockStore.ts`).
 */

export type ItemCategory = 'weapon' | 'armor' | 'drug' | 'ammo' | 'misc' | 'quest';
export const ITEM_CATEGORIES: readonly ItemCategory[] = [
  'weapon',
  'armor',
  'drug',
  'ammo',
  'misc',
  'quest',
];

export type EquipSlot = 'left' | 'right' | 'armor';
export const EQUIP_SLOTS: readonly EquipSlot[] = ['left', 'right', 'armor'];

export interface ItemStats {
  damageMin?: number;
  damageMax?: number;
  range?: number;
  /** Odpornosc na obrazenia (pancerz, typ normalny). */
  dt?: number;
  /** Redukcja obrazen w procentach (pancerz, typ normalny). */
  dr?: number;
}

export interface ItemView {
  id: number;
  pid: number;
  name: string;
  /** FID ikony z art\inven. */
  fid: number;
  category: ItemCategory;
  count: number;
  /** Waga jednej sztuki. */
  weight: number;
  /** Wartosc jednej sztuki. */
  value: number;
  usable: boolean;
  stats?: ItemStats;
}

export interface InventoryView {
  items: ItemView[];
  weight: number;
  weightMax: number;
  slots: { left: ItemView | null; right: ItemView | null; armor: ItemView | null };
  /** FID rysunku postaci (zalezny od zalozonego pancerza). */
  paperdollFid: number;
}

export interface ContainerView {
  id: number;
  name: string;
  items: ItemView[];
}

export type CommandResult = { ok: true } | { ok: false; reason: string };

export interface InventoryCommands {
  use(itemId: number, targetId?: number): CommandResult;
  equip(itemId: number, slot: EquipSlot): CommandResult;
  unequip(slot: EquipSlot): CommandResult;
  drop(itemId: number, count: number): CommandResult;
  move(itemId: number, count: number, to: 'player' | 'container'): CommandResult;
  takeAll(): CommandResult;
  closeContainer(): void;
}

/** Zrodlo miniatur: URL obrazka dla FID (API z M1 `assets.getSprite`) albo undefined. */
export type SpriteUrl = (fid: number) => string | undefined;
