import { useMemo } from 'preact/hooks';
import { EndgameHost, createMockEndgame, type EndgameScreenId } from '../src';

const STARTS: EndgameScreenId[] = ['endgame', 'death', 'credits', 'main-menu'];

/**
 * Widok ?view=endgame: slajdy, smierc, napisy i menu glowne na atrapie przebiegu.
 * ?start=endgame|death|credits|main-menu, ?lastsave=1 (propozycja wczytania), ?pwa=1 (bez przycisku wyjscia).
 */
export function EndgameDemo() {
  const params = new URLSearchParams(location.search);
  const mock = useMemo(() => {
    const start = STARTS.find((s) => s === params.get('start')) ?? 'endgame';
    return createMockEndgame({ start, lastSave: params.get('lastsave') === '1' ? 'slot1' : null });
  }, []);
  (window as unknown as { __endgameCalls: unknown }).__endgameCalls = mock.calls;
  return (
    <EndgameHost
      view={mock.view}
      commands={mock.commands}
      version="0.0.0-dev"
      canQuit={params.get('pwa') !== '1'}
    />
  );
}
