import './inventory.css';
import type { ReadonlySignal } from '@preact/signals';
import type { ComponentChildren } from 'preact';
import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { Button, Panel, ProgressBar, Select, Tabs, useToast } from '../../components';
import { ArtAt, ArtStage, ExtrasPanel, useLayoutMode, useStageInfo, useUiArt } from '../../art';
import { dictionaries, locale, t, tn } from '../../i18n';
import { CompareTooltip } from './CompareTooltip';
import { ContainerPane } from './ContainerPane';
import { ItemCard, ItemIcon, type ItemDragHandlers, type ItemSource } from './ItemCard';
import { ItemGrid } from './ItemGrid';
import {
  allowedSlots,
  canEquipTo,
  compareSlot,
  filterItems,
  sortItems,
  type CategoryFilter,
  type SortKey,
} from './model';
import {
  EQUIP_SLOTS,
  ITEM_CATEGORIES,
  type CommandResult,
  type ContainerView,
  type EquipSlot,
  type InventoryCommands,
  type InventoryView,
  type ItemView,
  type SpriteUrl,
} from './types';

export interface InventoryScreenProps {
  inventory: ReadonlySignal<InventoryView>;
  container: ReadonlySignal<ContainerView | null>;
  commands: InventoryCommands;
  sprite: SpriteUrl;
  /** Uklad jednokolumnowy; domyslnie wg szerokosci okna (<= 900px). */
  compact?: boolean;
  /** Wysokosc siatki przedmiotow w px. */
  gridHeight?: number;
}

interface Active {
  id: number;
  source: ItemSource;
}

const SLOT_LABEL: Record<EquipSlot, string> = {
  left: 'inventory.slot.left',
  right: 'inventory.slot.right',
  armor: 'inventory.slot.armor',
};
const EQUIP_LABEL: Record<EquipSlot, string> = {
  left: 'inventory.action.equipLeft',
  right: 'inventory.action.equipRight',
  armor: 'inventory.action.wear',
};

function errorMessage(reason: string): string {
  const key = `inventory.error.${reason}`;
  return dictionaries[locale.value][key] !== undefined ? t(key) : t('inventory.error.unknown');
}

const NARROW_QUERY = '(max-width: 900px)';

function useNarrow(): boolean {
  const mq = () => (typeof matchMedia === 'function' ? matchMedia(NARROW_QUERY) : null);
  const [narrow, setNarrow] = useState(() => mq()?.matches ?? false);
  useEffect(() => {
    const m = mq();
    if (!m) return;
    const on = () => setNarrow(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return narrow;
}

/** Wysokosc elementu w px (ResizeObserver); 0 dopoki nieznana. Callback ref: obserwator podpina sie
 * do kazdego nowego elementu (tlo laduje sie pozniej, zmiana trybu touch/PC), nie tylko do pierwszego. */
export function useBoxHeight() {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [h, setH] = useState(0);
  const ref = useCallback((node: HTMLDivElement | null) => setEl(node), []);
  useEffect(() => {
    if (!el) {
      setH(0);
      return;
    }
    const update = () => setH(Math.floor(el.clientHeight));
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [ref, h] as const;
}

/* Regiony tla inv.bg (499x377), zweryfikowane na profilach krawedzi invbox.png (pionowe piki w
 * x=115/146/151-153/264-266/292, poziome w y=39/253/285/350-355; tolerancja +/-2px na rozmytych
 * rantach): pionowa kolumna po lewej (postac), wneka na wage, trzy sloty (pancerz, item1, item2)
 * i duzy ekran po prawej (lista przedmiotow, loot). */
const INV_W = 499;
const INV_REGIONS = {
  doll: { x: 44, y: 48, w: 70, h: 294 },
  weight: { x: 172, y: 40, w: 64, h: 90 },
  armor: { x: 153, y: 180, w: 94, h: 66 },
  left: { x: 153, y: 287, w: 91, h: 60 },
  right: { x: 249, y: 287, w: 90, h: 60 },
  screen: { x: 296, y: 48, w: 152, h: 186 },
};

function InvRegions(props: {
  doll: ComponentChildren;
  weight: ComponentChildren;
  slots: Record<EquipSlot, ComponentChildren>;
  main: ComponentChildren;
}) {
  const st = useStageInfo();
  const k = (st?.w ?? INV_W) / INV_W;
  const at = (r: { x: number; y: number; w: number; h: number }) => ({
    x: Math.round(r.x * k),
    y: Math.round(r.y * k),
    w: Math.round(r.w * k),
    h: Math.round(r.h * k),
  });
  const R = INV_REGIONS;
  return (
    <>
      <ArtAt {...at(R.doll)}>
        <div class="f2-inv-art__region f2-inv-art__region--doll">{props.doll}</div>
      </ArtAt>
      <ArtAt {...at(R.weight)}>
        <div class="f2-inv-art__region f2-inv-art__region--weight">{props.weight}</div>
      </ArtAt>
      <ArtAt {...at(R.armor)}>
        <div class="f2-inv-art__region f2-inv-art__region--slot">{props.slots.armor}</div>
      </ArtAt>
      <ArtAt {...at(R.left)}>
        <div class="f2-inv-art__region f2-inv-art__region--slot">{props.slots.left}</div>
      </ArtAt>
      <ArtAt {...at(R.right)}>
        <div class="f2-inv-art__region f2-inv-art__region--slot">{props.slots.right}</div>
      </ArtAt>
      <ArtAt {...at(R.screen)}>
        <div class="f2-inv-art__region f2-inv-art__region--screen">{props.main}</div>
      </ArtAt>
    </>
  );
}

export function InventoryScreen({
  inventory,
  container,
  commands,
  sprite,
  compact: compactProp,
  gridHeight = 360,
}: InventoryScreenProps) {
  const [gridBoxRef, gridBoxH] = useBoxHeight();
  const [contBoxRef, contBoxH] = useBoxHeight();
  const narrow = useNarrow();
  const bg = useUiArt('inv.bg');
  const artMode = useLayoutMode();
  const compact = compactProp ?? narrow;
  const toast = useToast();
  const view = inventory.value;
  const cont = container.value;

  const [category, setCategory] = useState<CategoryFilter>('all');
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [multi, setMulti] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [active, setActive] = useState<Active | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const visible = useMemo(
    () => sortItems(filterItems(view.items, category, query), sortKey, locale.value),
    [view.items, category, query, sortKey, locale.value],
  );

  const run = (res: CommandResult): boolean => {
    if (!res.ok) toast.show(errorMessage(res.reason), 'warning');
    return res.ok;
  };

  const findItem = (a: Active | null): ItemView | null => {
    if (!a) return null;
    if (a.source === 'player') return view.items.find((i) => i.id === a.id) ?? null;
    if (a.source === 'container') return cont?.items.find((i) => i.id === a.id) ?? null;
    return view.slots[a.source.slice(5) as EquipSlot];
  };
  const activeItem = multi ? null : findItem(active);

  const toggleSelected = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const onActivate = (source: ItemSource) => (item: ItemView) => {
    if (multi && (source === 'player' || source === 'container')) toggleSelected(item.id);
    else setActive({ id: item.id, source });
  };

  const equipFrom = (item: ItemView, source: ItemSource, slot: EquipSlot) => {
    if (!canEquipTo(item, slot)) {
      toast.show(errorMessage('slot-invalid'), 'warning');
      return;
    }
    if (source === 'container' && !run(commands.move(item.id, item.count, 'player'))) return;
    run(commands.equip(item.id, slot));
  };

  const handleDrop = (target: string | null, item: ItemView, source: ItemSource) => {
    setHover(null);
    if (target === null) return; // poza celami: przedmiot wraca, nic sie nie dzieje
    if (target.startsWith('slot:')) {
      const slot = target.slice(5) as EquipSlot;
      if (source === `slot:${slot}`) return;
      equipFrom(item, source, slot);
    } else if (target === 'grid:player') {
      if (source === 'container') run(commands.move(item.id, item.count, 'player'));
      else if (source.startsWith('slot:')) run(commands.unequip(source.slice(5) as EquipSlot));
    } else if (target === 'grid:container') {
      if (!cont || source === 'container') return;
      if (source.startsWith('slot:') && !run(commands.unequip(source.slice(5) as EquipSlot)))
        return;
      run(commands.move(item.id, item.count, 'container'));
    } else if (target === 'ground') {
      if (source.startsWith('slot:') && !run(commands.unequip(source.slice(5) as EquipSlot)))
        return;
      run(commands.drop(item.id, item.count));
    }
  };

  const drag: ItemDragHandlers = {
    onDrop: handleDrop,
    onHover: setHover,
    onEnd: () => setHover(null),
  };

  const hoverCls = (id: string) => (hover === id ? ' f2-inv-drop--hover' : '');

  const bulkIds = [...selected];
  const bulkItems = [...view.items, ...(cont?.items ?? [])].filter((i) => selected.has(i.id));
  const bulk = (fn: (it: ItemView) => CommandResult) => {
    for (const it of bulkItems) if (!run(fn(it))) break;
    setSelected(new Set());
  };

  const tapSlot = (slot: EquipSlot) => {
    if (activeItem && active && !active.source.startsWith('slot:')) {
      equipFrom(activeItem, active.source, slot);
    }
  };

  const slotBox = (slot: EquipSlot) => {
    const item = view.slots[slot];
    const src = `slot:${slot}` as ItemSource;
    return (
      <div
        class={`f2-inv-slot f2-inv-slot--${slot}${hoverCls(`slot:${slot}`)}`}
        data-drop={`slot:${slot}`}
        data-testid={`slot-${slot}`}
      >
        <span class="f2-inv-slot__label">{t(SLOT_LABEL[slot])}</span>
        {item ? (
          <ItemCard
            item={item}
            source={src}
            sprite={sprite}
            selected={active?.source === src && active.id === item.id}
            drag={drag}
            onActivate={onActivate(src)}
          />
        ) : (
          <button
            type="button"
            class="f2-inv-slot__empty"
            aria-label={t('inventory.slot.empty', { slot: t(SLOT_LABEL[slot]) })}
            onClick={() => tapSlot(slot)}
          >
            <span aria-hidden="true">+</span>
          </button>
        )}
      </div>
    );
  };

  const actionBar = () => {
    if (multi) {
      return (
        <div class="f2-inv-actions" data-testid="actions">
          <span>{tn('inventory.multi.count', bulkIds.length)}</span>
          <Button
            variant="secondary"
            disabled={bulkIds.length === 0}
            onPress={() => bulk((it) => commands.drop(it.id, it.count))}
          >
            {t('inventory.action.drop')}
          </Button>
          {cont && (
            <Button
              variant="secondary"
              disabled={bulkIds.length === 0}
              onPress={() =>
                bulk((it) =>
                  commands.move(
                    it.id,
                    it.count,
                    view.items.some((v) => v.id === it.id) ? 'container' : 'player',
                  ),
                )
              }
            >
              {t('inventory.action.transfer')}
            </Button>
          )}
        </div>
      );
    }
    if (!activeItem || !active) {
      return <p class="f2-inv-hint">{t('inventory.hint')}</p>;
    }
    const item = activeItem;
    const src = active.source;
    const afterOk = (res: CommandResult) => {
      if (run(res)) setActive(null);
    };
    return (
      <div class="f2-inv-actions" data-testid="actions">
        <span class="f2-inv-actions__name">{item.name}</span>
        {src === 'player' && item.usable && (
          <Button variant="primary" onPress={() => afterOk(commands.use(item.id))}>
            {t('inventory.action.use')}
          </Button>
        )}
        {src !== 'container' &&
          !src.startsWith('slot:') &&
          allowedSlots(item).map((slot) => (
            <Button key={slot} variant="secondary" onPress={() => equipFrom(item, src, slot)}>
              {t(EQUIP_LABEL[slot])}
            </Button>
          ))}
        {src.startsWith('slot:') && (
          <Button
            variant="secondary"
            onPress={() => afterOk(commands.unequip(src.slice(5) as EquipSlot))}
          >
            {t('inventory.action.unequip')}
          </Button>
        )}
        {src === 'container' && (
          <Button
            variant="primary"
            onPress={() => afterOk(commands.move(item.id, item.count, 'player'))}
          >
            {t('inventory.action.take')}
          </Button>
        )}
        {src === 'player' && cont && (
          <Button
            variant="secondary"
            onPress={() => afterOk(commands.move(item.id, item.count, 'container'))}
          >
            {t('inventory.action.store')}
          </Button>
        )}
        {src !== 'container' && (
          <Button variant="danger" onPress={() => afterOk(commands.drop(item.id, item.count))}>
            {t('inventory.action.drop')}
          </Button>
        )}
      </div>
    );
  };

  const cmpSlot = activeItem ? compareSlot(activeItem) : null;
  const cmpEquipped = cmpSlot ? view.slots[cmpSlot] : null;

  const weightBar = (
    <ProgressBar
      value={view.weight}
      max={view.weightMax}
      label={t('inventory.weight')}
      tone="weight"
    />
  );
  const dropGround = (
    <div class={`f2-inv-ground${hoverCls('ground')}`} data-drop="ground" data-testid="drop-ground">
      {t('inventory.dropZone')}
    </div>
  );
  const paperdoll = (
    <>
      <div
        class={`f2-inv-paperdoll${sprite(view.paperdollFid) ? '' : ' f2-inv-paperdoll--empty'}`}
        data-testid="paperdoll"
        data-fid={view.paperdollFid}
      >
        <ItemIcon fid={view.paperdollFid} sprite={sprite} />
      </div>
      <div class="f2-inv-slots">{EQUIP_SLOTS.map((s) => slotBox(s))}</div>
      {weightBar}
      {dropGround}
    </>
  );
  const dollOnly = (
    <>
      <div
        class={`f2-inv-paperdoll${sprite(view.paperdollFid) ? '' : ' f2-inv-paperdoll--empty'}`}
        data-testid="paperdoll"
        data-fid={view.paperdollFid}
      >
        <ItemIcon fid={view.paperdollFid} sprite={sprite} />
      </div>
      {dropGround}
    </>
  );

  const toolbar = (
    <div class="f2-inv-toolbar">
      <label class="f2-inv-search">
        <span class="f2-inv-search__label">{t('inventory.search')}</span>
        <input
          type="search"
          value={query}
          onInput={(e) => setQuery(e.currentTarget.value)}
          placeholder={t('inventory.search.placeholder')}
        />
      </label>
      <Select
        label={t('inventory.sort')}
        value={sortKey}
        onChange={(v) => setSortKey(v as SortKey)}
        options={[
          { value: 'name', label: t('inventory.sort.name') },
          { value: 'weight', label: t('inventory.sort.weight') },
          { value: 'value', label: t('inventory.sort.value') },
        ]}
      />
      <Button
        variant={multi ? 'primary' : 'secondary'}
        onPress={() => {
          setMulti(!multi);
          setSelected(new Set());
        }}
      >
        {multi ? t('inventory.multi.off') : t('inventory.multi.on')}
      </Button>
    </div>
  );
  const tabs = (
    <Tabs
      placement="top"
      value={category}
      onChange={(id) => setCategory(id as CategoryFilter)}
      items={[
        { id: 'all', label: t('inventory.category.all') },
        ...ITEM_CATEGORIES.map((c) => ({ id: c, label: t(`inventory.category.${c}`) })),
      ]}
    />
  );
  const artPc = bg !== null && artMode !== 'touch';
  const artTouch = bg !== null && artMode === 'touch';
  const grid = (
    <ItemGrid
      items={visible}
      label={t('inventory.list.label')}
      source="player"
      dropId="grid:player"
      sprite={sprite}
      drag={drag}
      selectedIds={multi ? selected : new Set(active?.source === 'player' ? [active.id] : [])}
      multi={multi}
      highlighted={hover === 'grid:player'}
      height={artPc ? Math.max(48, gridBoxH) : gridHeight}
      autoHeight={artTouch}
      onActivate={onActivate('player')}
    />
  );
  const compare =
    activeItem && cmpSlot && active?.source !== `slot:${cmpSlot}` ? (
      <CompareTooltip item={activeItem} equipped={cmpEquipped} />
    ) : null;

  const containerPane = (art: boolean, touch: boolean) =>
    cont ? (
      <ContainerPane
        container={cont}
        sprite={sprite}
        drag={drag}
        selectedIds={multi ? selected : new Set(active?.source === 'container' ? [active.id] : [])}
        multi={multi}
        highlighted={hover === 'grid:container'}
        height={artPc ? Math.max(48, contBoxH - 56) : gridHeight}
        autoHeight={artTouch}
        art={art}
        touch={touch}
        onActivate={onActivate('container')}
        onTakeAll={() => run(commands.takeAll())}
        onClose={() => commands.closeContainer()}
      />
    ) : null;

  /* Skorka FRM: oryginalny uklad (ekwipunek, siatka, loot) na tle inv.bg. Wyszukiwanie, sortowanie,
   * wybor wielu i kategorie to nasze dodatki bez odpowiednika w oryginale: panel dodatkow na PC,
   * w wersji dotykowej wszystko w jednej przewijanej nakladce. */
  if (bg) {
    const touch = artMode === 'touch';
    const left = <div class="f2-inv-art__pane">{paperdoll}</div>;
    const main = (
      <div class="f2-inv-art__pane">
        {touch && toolbar}
        {touch && tabs}
        {grid}
        {actionBar()}
        {touch && compare}
      </div>
    );
    const side = containerPane(true, touch);
    const screen = (
      <div class="f2-inv-art__split">
        <div class="f2-inv-art__box" ref={gridBoxRef}>
          {grid}
        </div>
        <div class="f2-inv-art__bar">{actionBar()}</div>
        {side && (
          <div class="f2-inv-art__box f2-inv-art__box--loot" ref={contBoxRef}>
            {side}
          </div>
        )}
      </div>
    );
    return (
      <div
        class={`f2-inv-screen f2-inv-screen--art${touch ? ' f2-inv-screen--touch' : ''}`}
        data-testid="inventory-screen"
      >
        <h2 class="f2-inv__sr-title">{t('inventory.title')}</h2>
        <div class="f2-inv__scene">
          <ArtStage background="inv.bg" minTouch={touch}>
            {!touch && (
              <InvRegions
                doll={dollOnly}
                weight={weightBar}
                slots={{ armor: slotBox('armor'), left: slotBox('left'), right: slotBox('right') }}
                main={screen}
              />
            )}
          </ArtStage>
        </div>
        {touch && (
          /* Dotyk: tresc pod scena (jak w zapisach i handlu), bez zagniezdzonego przewijania. */
          <div class="f2-inv__touch-body">
            {left}
            {main}
            {side}
          </div>
        )}
        {!touch && (
          <ExtrasPanel title={t('inventory.extras')}>
            {toolbar}
            {tabs}
            {compare}
          </ExtrasPanel>
        )}
      </div>
    );
  }

  return (
    <div
      class={`f2-inv-screen${compact ? ' f2-inv-screen--compact' : ''}`}
      data-testid="inventory-screen"
    >
      <aside class="f2-inv-screen__left">
        <Panel title={t('inventory.equipment')}>{paperdoll}</Panel>
      </aside>

      <section class="f2-inv-screen__main">
        <Panel title={t('inventory.title')}>
          {toolbar}
          {tabs}
          {grid}
          {actionBar()}
          {compare}
        </Panel>
      </section>

      {cont && <aside class="f2-inv-screen__side">{containerPane(false, false)}</aside>}
    </div>
  );
}
