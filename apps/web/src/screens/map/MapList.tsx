import { useMemo, useState } from 'preact/hooks';
import { t } from '../../i18n';
import type { MapEntry } from './maps-txt';

export function MapList({ maps, onOpen }: { maps: MapEntry[]; onOpen: (name: string) => void }) {
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? maps.filter((m) => m.name.toLowerCase().includes(q) || m.lookup.toLowerCase().includes(q))
      : maps;
  }, [maps, query]);
  return (
    <section class="map-list" data-testid="map-list">
      <h2>{t('mapList.title')}</h2>
      <input
        type="search"
        placeholder={t('mapList.search')}
        aria-label={t('mapList.search')}
        data-testid="map-search"
        value={query}
        onInput={(e) => setQuery(e.currentTarget.value)}
      />
      {shown.length === 0 && <p class="muted">{t('mapList.empty')}</p>}
      <ul class="list-scroll">
        {shown.map((m) => (
          <li key={m.name}>
            <button
              type="button"
              class="list-row"
              data-testid={`map-item-${m.name}`}
              onClick={() => onOpen(m.name)}
            >
              {m.name}
              {m.lookup ? <span class="muted"> {m.lookup}</span> : null}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
