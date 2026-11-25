import { useMemo } from 'preact/hooks';
import {
  InventoryScreen,
  createMockInventory,
  sampleItems,
  type ItemView,
  type SpriteUrl,
} from '../src';

const params = new URLSearchParams(location.search);

/** Miniatury zastepcze: kolorowy kwadrat z SVG zalezny od FID (prawdziwe ikony: assets.getSprite w Zadaniu 14). */
const sprite: SpriteUrl = (fid) => {
  const hue = (fid * 47) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" rx="6" fill="hsl(${hue} 55% 45%)"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

/** Widok ?view=inventory[&items=N&container=1&weightMax=W&compact=1] na atrapie magazynu. */
export function InventoryDemo() {
  const mock = useMemo(() => {
    const n = Number(params.get('items') ?? '40') || 40;
    const items = sampleItems(n);
    const slots: { armor?: ItemView } = {
      armor: {
        id: 9000,
        pid: 9000,
        name: 'Skorzana kurtka',
        fid: 0x07000005,
        category: 'armor',
        count: 1,
        weight: 5,
        value: 100,
        usable: false,
        stats: { dt: 1, dr: 10 },
      },
    };
    const container =
      params.get('container') === '1'
        ? {
            id: 1,
            name: 'Skrzynia',
            items: [
              ...sampleItems(6, 5000),
              {
                id: 5900,
                pid: 5900,
                name: 'Zlota sztaba',
                fid: 0x07000011,
                category: 'misc' as const,
                count: 1,
                weight: 500,
                value: 9000,
                usable: false,
              },
            ],
          }
        : null;
    return createMockInventory({
      items,
      slots,
      weightMax: Number(params.get('weightMax') ?? '9999') || 9999,
      paperdollFid: 0x07000003,
      container,
    });
  }, []);
  (window as unknown as { __invLog: string[] }).__invLog = mock.log;
  return (
    <main style={{ padding: 'var(--space-3)' }}>
      <InventoryScreen
        inventory={mock.inventory}
        container={mock.container}
        commands={mock.commands}
        sprite={sprite}
        {...(params.has('compact') ? { compact: params.get('compact') === '1' } : {})}
      />
    </main>
  );
}
