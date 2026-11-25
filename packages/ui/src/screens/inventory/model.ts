import type { EquipSlot, ItemCategory, ItemView } from './types';

export type CategoryFilter = ItemCategory | 'all';
export type SortKey = 'name' | 'weight' | 'value';

export const stackWeight = (it: ItemView): number => it.weight * it.count;
export const stackValue = (it: ItemView): number => it.value * it.count;

export function filterItems(
  items: readonly ItemView[],
  category: CategoryFilter,
  query: string,
): ItemView[] {
  const q = query.trim().toLocaleLowerCase();
  return items.filter(
    (it) =>
      (category === 'all' || it.category === category) &&
      (q === '' || it.name.toLocaleLowerCase().includes(q)),
  );
}

/** Nazwa rosnaco; waga i wartosc malejaco (najciezsze/najcenniejsze pierwsze). */
export function sortItems(items: readonly ItemView[], key: SortKey, locale: string): ItemView[] {
  const out = [...items];
  const byName = (a: ItemView, b: ItemView) => a.name.localeCompare(b.name, locale);
  out.sort((a, b) => {
    if (key === 'name') return byName(a, b);
    const d = key === 'weight' ? stackWeight(b) - stackWeight(a) : stackValue(b) - stackValue(a);
    return d !== 0 ? d : byName(a, b);
  });
  return out;
}

/** Zakres slotow dla przedmiotu: pancerz tylko w slot pancerza, reszta w rece (bez questowych). */
export function allowedSlots(item: ItemView): EquipSlot[] {
  if (item.category === 'armor') return ['armor'];
  if (item.category === 'weapon') return ['right', 'left'];
  if (item.category === 'misc' || item.category === 'drug' || item.category === 'ammo')
    return ['right', 'left'];
  return [];
}

export const canEquipTo = (item: ItemView, slot: EquipSlot): boolean =>
  allowedSlots(item).includes(slot);

/** Slot, z ktorym porownujemy przedmiot (zalozony odpowiednik). */
export const compareSlot = (item: ItemView): EquipSlot | null =>
  item.category === 'armor' ? 'armor' : item.category === 'weapon' ? 'right' : null;

export type CompareKey = 'damage' | 'range' | 'dt' | 'dr' | 'weight';
export interface CompareRow {
  key: CompareKey;
  /** Wartosc kandydata i zalozonego (undefined = brak danych). */
  value: number | undefined;
  equipped: number | undefined;
  delta: number | undefined;
  /** true = lepiej, false = gorzej, null = bez zmian/brak danych. */
  better: boolean | null;
}

const avg = (min?: number, max?: number): number | undefined =>
  min === undefined || max === undefined ? undefined : (min + max) / 2;

export function compareItems(candidate: ItemView, equipped: ItemView | null): CompareRow[] {
  const row = (
    key: CompareKey,
    value: number | undefined,
    eq: number | undefined,
    lowerIsBetter = false,
  ): CompareRow => {
    const delta = value !== undefined && eq !== undefined ? value - eq : undefined;
    const better =
      delta === undefined || delta === 0 ? null : lowerIsBetter ? delta < 0 : delta > 0;
    return { key, value, equipped: eq, delta, better };
  };
  const c = candidate.stats ?? {};
  const e = equipped?.stats ?? {};
  const rows: CompareRow[] = [];
  if (candidate.category === 'weapon') {
    rows.push(row('damage', avg(c.damageMin, c.damageMax), avg(e.damageMin, e.damageMax)));
    rows.push(row('range', c.range, e.range));
  } else if (candidate.category === 'armor') {
    rows.push(row('dt', c.dt, e.dt));
    rows.push(row('dr', c.dr, e.dr));
  }
  rows.push(row('weight', candidate.weight, equipped?.weight, true));
  return rows;
}
