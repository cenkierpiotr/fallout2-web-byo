import { useEffect, useState } from 'preact/hooks';
import {
  AccessibilityTab,
  Button,
  applyA11y,
  defaultA11y,
  useTheme,
  type A11yValues,
} from '../src';

/** Widok ?view=a11y: zakladka Dostepnosc z zastosowaniem trybow na <html> (motyw/skala przez ThemeProvider). */
export function A11yDemo() {
  const theme = useTheme();
  const [values, setValues] = useState<A11yValues>({ ...defaultA11y, fontScale: theme.fontScale });
  useEffect(() => applyA11y(values), [values]);
  return (
    <main class="pg">
      <AccessibilityTab
        values={values}
        onChange={(k, v) => {
          setValues((cur) => ({ ...cur, [k]: v }));
          if (k === 'fontScale') theme.setFontScale(v as number);
          if (k === 'highContrast') theme.setTheme(v ? 'high-contrast' : 'modern');
        }}
      />
      <Button variant="primary" onPress={() => {}}>
        Zastosuj
      </Button>
    </main>
  );
}
