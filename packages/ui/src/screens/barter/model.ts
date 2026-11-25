/** Czyste pomocniki widoku handlu. Ceny i akceptacje liczy sesja (@f2/engine-core + @f2/rules). */
import type { ItemCategory } from '../inventory/types';
import type { BarterItem } from './types';

export const CAPS_PID = 0x29;

export type BarterCategoryFilter = 'all' | ItemCategory;

/** Filtr kategorii kolumn inwentarza; kapsle (pid 0x29) zawsze zostaja widoczne. */
export function filterByCategory(
  items: readonly BarterItem[],
  category: BarterCategoryFilter,
): BarterItem[] {
  if (category === 'all') return [...items];
  return items.filter((i) => i.category === category || i.pid === CAPS_PID);
}
