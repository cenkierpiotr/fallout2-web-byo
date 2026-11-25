import { t } from '../../i18n';
import { compareItems, compareSlot, type CompareRow } from './model';
import type { ItemView } from './types';

export interface CompareTooltipProps {
  item: ItemView;
  /** Przedmiot zalozony w odpowiadajacym slocie (null = pusty slot). */
  equipped: ItemView | null;
}

const fmt = (n: number | undefined): string =>
  n === undefined ? '-' : String(Math.round(n * 10) / 10);
const fmtDelta = (n: number | undefined): string =>
  n === undefined || n === 0 ? '' : `${n > 0 ? '+' : ''}${Math.round(n * 10) / 10}`;

function Row({ row }: { row: CompareRow }) {
  const tone = row.better === null ? 'same' : row.better ? 'better' : 'worse';
  return (
    <tr data-testid={`cmp-${row.key}`} class={`f2-inv-cmp__row f2-inv-cmp__row--${tone}`}>
      <th scope="row">{t(`inventory.compare.${row.key}`)}</th>
      <td>{fmt(row.value)}</td>
      <td>{fmt(row.equipped)}</td>
      <td class="f2-inv-cmp__delta">{fmtDelta(row.delta)}</td>
    </tr>
  );
}

/** Porownanie wybranego przedmiotu z zalozonym: obrazenia, zasieg, DT/DR, waga. */
export function CompareTooltip({ item, equipped }: CompareTooltipProps) {
  if (compareSlot(item) === null) return null;
  const rows = compareItems(item, equipped);
  return (
    <div
      class="f2-inv-cmp"
      role="group"
      aria-label={t('inventory.compare.title')}
      data-testid="compare"
    >
      <p class="f2-inv-cmp__title">
        {equipped
          ? t('inventory.compare.vs', { name: equipped.name })
          : t('inventory.compare.vsEmpty')}
      </p>
      <table>
        <thead>
          <tr>
            <th scope="col">{t('inventory.compare.stat')}</th>
            <th scope="col">{t('inventory.compare.selected')}</th>
            <th scope="col">{t('inventory.compare.worn')}</th>
            <th scope="col">{t('inventory.compare.diff')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <Row key={r.key} row={r} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
