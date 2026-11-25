import type { CSSProperties } from 'preact';
import { ArtButton } from '../../art';
import { Button, Panel } from '../../components';
import { t } from '../../i18n';
import { ItemGrid } from './ItemGrid';
import type { ItemDragHandlers } from './ItemCard';
import type { ContainerView, ItemView, SpriteUrl } from './types';

export interface ContainerPaneProps {
  container: ContainerView;
  sprite: SpriteUrl;
  drag: ItemDragHandlers;
  selectedIds: ReadonlySet<number>;
  multi: boolean;
  highlighted: boolean;
  height?: number;
  autoHeight?: boolean;
  /** Skorka FRM: bez ramki Panel, przycisk Done z grafiki. */
  art?: boolean;
  /** Skorka FRM, dotyk: cele min 44px na przyciskach tekstowych. */
  touch?: boolean;
  onActivate: (item: ItemView, ev: { x: number; y: number }) => void;
  onTakeAll: () => void;
  onClose: () => void;
}

const TOUCH: CSSProperties = { minWidth: '44px', minHeight: '44px' };

/** Panel kontenera/zwlok: siatka przedmiotow, "Wez wszystko" i zamkniecie. */
export function ContainerPane({
  container,
  sprite,
  drag,
  selectedIds,
  multi,
  highlighted,
  height,
  autoHeight = false,
  art = false,
  touch = false,
  onActivate,
  onTakeAll,
  onClose,
}: ContainerPaneProps) {
  const grid = (
    <ItemGrid
      items={container.items}
      label={t('inventory.container.label')}
      source="container"
      dropId="grid:container"
      sprite={sprite}
      drag={drag}
      selectedIds={selectedIds}
      multi={multi}
      highlighted={highlighted}
      onActivate={onActivate}
      autoHeight={autoHeight}
      {...(height !== undefined ? { height } : {})}
    />
  );
  if (art) {
    return (
      <section class="f2-inv-container f2-inv-container--art" aria-label={container.name}>
        <h3 class="f2-inv-container__title-art">{container.name}</h3>
        <div class="f2-inv-container__actions">
          <button
            type="button"
            class="f2-button f2-button--primary f2-button--sm"
            disabled={container.items.length === 0}
            style={touch ? TOUCH : undefined}
            onClick={onTakeAll}
          >
            {t('inventory.container.takeAll')}
          </button>
          <ArtButton
            up="inv.done.up"
            down="inv.done.dn"
            label={t('inventory.container.close')}
            onClick={onClose}
          />
        </div>
        {grid}
      </section>
    );
  }
  return (
    <Panel title={container.name} class="f2-inv-container">
      <div class="f2-inv-container__actions">
        <Button variant="primary" disabled={container.items.length === 0} onPress={onTakeAll}>
          {t('inventory.container.takeAll')}
        </Button>
        <Button variant="secondary" onPress={onClose}>
          {t('inventory.container.close')}
        </Button>
      </div>
      {grid}
    </Panel>
  );
}
