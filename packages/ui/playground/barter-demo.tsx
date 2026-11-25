import { useMemo } from 'preact/hooks';
import { BarterScreen, type SpriteUrl } from '../src';
import { createMockBarter, sampleBarter } from './barter-mock';

const params = new URLSearchParams(location.search);

const sprite: SpriteUrl = (fid) => {
  const hue = (fid * 47) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" rx="6" fill="hsl(${hue} 55% 45%)"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

/** Widok ?view=barter[&compact=1&weightMax=W&container=1&merchantCarry=W] na atrapie magazynu; log komend w window.__barterLog. */
export function BarterDemo() {
  const mock = useMemo(() => {
    const carry = Number(params.get('weightMax') ?? '');
    const merchantCarry = Number(params.get('merchantCarry') ?? '');
    return createMockBarter(
      sampleBarter({
        params: {
          ...(carry > 0 ? { playerFreeCarry: carry } : {}),
          ...(params.get('container') === '1'
            ? { containerMode: true, merchantFreeCarry: merchantCarry >= 0 ? merchantCarry : 0 }
            : {}),
        },
      }),
    );
  }, []);
  (window as unknown as { __barterLog: string[] }).__barterLog = mock.log;
  return (
    <main style={{ padding: 'var(--space-3)' }}>
      <BarterScreen
        view={mock.view}
        commands={mock.commands}
        sprite={sprite}
        {...(params.has('compact') ? { compact: params.get('compact') === '1' } : {})}
      />
    </main>
  );
}
