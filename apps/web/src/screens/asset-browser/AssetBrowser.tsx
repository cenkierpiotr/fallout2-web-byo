import { shouldIgnoreKey } from './keys';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { lstName, parseLst } from '@f2/formats';
import { client } from '../../state/game-folder';
import { createView } from '../../state/view';
import { t } from '../../i18n';
import { FrmList, type FrmItem } from './FrmList';
import { Preview } from './Preview';
import { PreviewControls } from './PreviewControls';

interface Category {
  id: string;
  lst: string;
  dir: string;
  suffix?: string;
}

const CATEGORIES: Category[] = [
  { id: 'tiles', lst: 'art/tiles/TILES.LST', dir: 'art/tiles' },
  { id: 'walls', lst: 'art/walls/WALLS.LST', dir: 'art/walls' },
  { id: 'scenery', lst: 'art/scenery/SCENERY.LST', dir: 'art/scenery' },
  { id: 'items', lst: 'art/items/ITEMS.LST', dir: 'art/items' },
  { id: 'inven', lst: 'art/inven/INVEN.LST', dir: 'art/inven' },
  { id: 'intrface', lst: 'art/intrface/INTRFACE.LST', dir: 'art/intrface' },
  { id: 'misc', lst: 'art/misc/MISC.LST', dir: 'art/misc' },
  { id: 'skilldex', lst: 'art/skilldex/SKILLDEX.LST', dir: 'art/skilldex' },
  { id: 'backgrnd', lst: 'art/backgrnd/BACKGRND.LST', dir: 'art/backgrnd' },
  { id: 'heads', lst: 'art/heads/HEADS.LST', dir: 'art/heads' },
  { id: 'critters', lst: 'art/critters/CRITTERS.LST', dir: 'art/critters', suffix: 'AA' },
];

/** Pozycje listy dla kategorii; critters: nazwa + sufiks animacji, np. hmjmps -> HMJMPSAA.FRM. */
export function buildItems(cat: Category, lines: string[]): FrmItem[] {
  const items: FrmItem[] = [];
  for (const line of lines) {
    const name = lstName(line);
    if (!name) continue;
    const file = cat.suffix ? `${name.replace(/\.frm$/i, '')}${cat.suffix}.FRM` : name;
    items.push({ label: file.toUpperCase(), path: `${cat.dir}/${file}` });
  }
  return items;
}

export function AssetBrowser() {
  const c = client.value;
  const view = useMemo(() => createView(), []);
  const [catId, setCatId] = useState('tiles');
  const [query, setQuery] = useState('');
  const [all, setAll] = useState<FrmItem[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!c) return;
    const cat = CATEGORIES.find((x) => x.id === catId);
    if (!cat) return;
    let cancelled = false;
    setProblem(null);
    setAll([]);
    c.read(cat.lst).then(
      (bytes) => {
        if (!cancelled) setAll(buildItems(cat, parseLst(bytes)));
      },
      (e: unknown) => {
        if (!cancelled) setProblem(e instanceof Error ? e.message : String(e));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [c, catId]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? all.filter((x) => x.label.toLowerCase().includes(q)) : all;
  }, [all, query]);

  // klawiatura
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (shouldIgnoreKey(e)) return;
      const el = e.target as HTMLElement | null;
      switch (e.key) {
        case 'ArrowLeft':
          view.dir.value = (view.dir.value + 5) % 6;
          break;
        case 'ArrowRight':
          view.dir.value = (view.dir.value + 1) % 6;
          break;
        case ' ':
          if (el && el.tagName === 'BUTTON') return;
          view.playing.value = !view.playing.value;
          break;
        case '+':
        case '=':
          view.zoom.value = Math.min(4, +(view.zoom.value + 0.25).toFixed(2));
          break;
        case '-':
          view.zoom.value = Math.max(0.5, +(view.zoom.value - 0.25).toFixed(2));
          break;
        case 'ArrowDown':
        case 'ArrowUp': {
          const i = items.findIndex((x) => x.path === view.path.value);
          const next = items[e.key === 'ArrowDown' ? i + 1 : i < 0 ? 0 : i - 1];
          if (next) view.path.value = next.path;
          break;
        }
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [items, view]);

  if (!c) return null;
  return (
    <div class="browser">
      <aside class="list-pane">
        <label>
          <span class="muted">{t('browser.category')}</span>
          <select
            data-testid="category-select"
            value={catId}
            onChange={(e) => {
              setCatId(e.currentTarget.value);
              setQuery('');
            }}
          >
            {CATEGORIES.map((x) => (
              <option key={x.id} value={x.id}>
                {x.id}
              </option>
            ))}
          </select>
        </label>
        <input
          type="search"
          placeholder={t('browser.search')}
          aria-label={t('browser.search')}
          data-testid="search-input"
          value={query}
          onInput={(e) => setQuery(e.currentTarget.value)}
        />
        {problem && <p class="error">{t('error.generic', { message: problem })}</p>}
        <FrmList items={items} selected={view.path.value} onSelect={(p) => (view.path.value = p)} />
      </aside>
      <section class="stage">
        <Preview client={c} view={view} />
        <PreviewControls view={view} />
      </section>
    </div>
  );
}
