import { useMemo } from 'preact/hooks';
import { PipboyHost, createFullMockPipboyView, isLocale, setLocale, type RestTarget } from '../src';

/** Widok ?view=pipboy: atrapa HUD z przyciskiem Pip-Boya (klawisz P), pelne dane demo. */
export function PipboyDemo() {
  const lang = new URLSearchParams(window.location.search).get('lang');
  if (isLocale(lang)) setLocale(lang);
  const view = useMemo(() => createFullMockPipboyView(), []);
  const commands = useMemo(
    () => ({
      rest: (target: RestTarget) => {
        const c = view.value.clock;
        if (!c) return;
        let total = c.hour * 60 + c.minute;
        if (target.kind === 'minutes') total += target.n;
        else if (target.kind === 'hour')
          total = (total + ((((target.h * 60 - total) % 1440) + 1440) % 1440)) % 1440 || total;
        else total += 60;
        view.value = {
          ...view.value,
          clock: { ...c, hour: Math.floor((total % 1440) / 60), minute: total % 60 },
        };
      },
    }),
    [view],
  );
  return (
    <main style={{ padding: 'var(--space-3)' }}>
      <div data-testid="hud" style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <PipboyHost view={view} commands={commands} />
      </div>
    </main>
  );
}
