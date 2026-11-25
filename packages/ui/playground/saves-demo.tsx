import { useMemo } from 'preact/hooks';
import { SavesScreen, createMockSaves } from '../src';

/** Widok ?view=saves: ekran zapisow na atrapie magazynu. */
export function SavesDemo() {
  const store = useMemo(() => createMockSaves(), []);
  (window as unknown as { __saveCalls: string[] }).__saveCalls = store.log;
  return (
    <main style={{ padding: 'var(--space-3)', maxWidth: '960px', margin: '0 auto' }}>
      <SavesScreen view={store.view} commands={store.commands} />
    </main>
  );
}
