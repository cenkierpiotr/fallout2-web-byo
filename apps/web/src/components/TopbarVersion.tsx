export interface TopbarVersionProps {
  version: string;
}

/** Wyswietla wersje bundle w pasku gornym, zeby gracz mogl sprawdzic, ktora wersja dziala. */
export function TopbarVersion({ version }: TopbarVersionProps) {
  return (
    <span class="topbar-version" data-testid="topbar-version">
      v{version}
    </span>
  );
}
