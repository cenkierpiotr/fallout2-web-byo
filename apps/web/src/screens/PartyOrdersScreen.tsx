import { useState } from 'preact/hooks';
import { t } from '../i18n';
import { PARTY_ORDER_KEYS, type PartyOrders } from '@f2/rules';
import type { PartyOrdersRow } from '../game/party-orders-view';

export interface PartyOrdersScreenProps {
  /** Aktualny model okna (odczytywany przy kazdym renderze, wiec odswieza sie po zmianie). */
  rows: () => PartyOrdersRow[];
  /** Zapis jednego rozkazu (walidacja wg party.txt po stronie PartyState); false = odrzucony. */
  onSet: (objId: number, key: keyof PartyOrders, value: string) => boolean;
  /** Czytelna nazwa towarzysza; brak = "Towarzysz N". */
  nameOf?: (row: PartyOrdersRow) => string | undefined;
}

/** Okno rozkazow druzyny: dla kazdego towarzysza lista rozkazow z opcjami dozwolonymi w party.txt. */
export function PartyOrdersScreen({ rows, onSet, nameOf }: PartyOrdersScreenProps) {
  const [, bump] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const list = rows();
  if (list.length === 0) return <p data-testid="orders-empty">{t('orders.empty')}</p>;
  return (
    <div data-testid="orders-screen">
      {error && (
        <p role="alert" data-testid="orders-error">
          {error}
        </p>
      )}
      {list.map((row, n) => (
        <fieldset key={row.objId} data-testid={`orders-member-${row.objId}`}>
          <legend>{nameOf?.(row) ?? t('orders.member', { n: n + 1 })}</legend>
          {PARTY_ORDER_KEYS.filter((k) => row.options[k].length > 0).map((k) => {
            const id = `orders-${row.objId}-${k}`;
            return (
              <div
                key={k}
                style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}
              >
                <label for={id} style={{ minWidth: 140 }}>
                  {t(`orders.key.${k}`)}
                </label>
                <select
                  id={id}
                  data-testid={id}
                  style={{ minHeight: 44, flex: 1 }}
                  value={row.orders[k] ?? ''}
                  onChange={(e) => {
                    const v = (e.currentTarget as HTMLSelectElement).value;
                    if (v === '') return;
                    const ok = onSet(row.objId, k, v);
                    setError(ok ? null : t('orders.rejected'));
                    bump((x) => x + 1);
                  }}
                >
                  <option value="" disabled>
                    {t('orders.default')}
                  </option>
                  {row.options[k].map((o) => (
                    <option key={o} value={o}>
                      {t(`orders.opt.${k}.${o}`)}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </fieldset>
      ))}
    </div>
  );
}
