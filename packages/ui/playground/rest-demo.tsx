import { useMemo } from 'preact/hooks';
import { RestHost, createMockRest } from '../src';

/** Widok ?view=rest: atrapa HUD z zegarem i oknem odpoczynku (klawisz R); ?enemies=1, ?interrupt=1. */
export function RestDemo() {
  const params = new URLSearchParams(location.search);
  const mock = useMemo(
    () =>
      createMockRest({
        enemiesNearby: params.get('enemies') === '1',
        interrupt: params.get('interrupt') === '1',
      }),
    [],
  );
  (window as unknown as { __restCalls: unknown }).__restCalls = mock.calls;
  return (
    <main style={{ padding: 'var(--space-3)' }}>
      <div
        data-testid="hud"
        style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}
      >
        <RestHost view={mock.view} clock={mock.clock} commands={mock.commands} />
      </div>
    </main>
  );
}
