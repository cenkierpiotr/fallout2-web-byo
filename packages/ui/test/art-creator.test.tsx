import { render } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { ArtCreator, sanitizeBio } from '../src/screens/creator/ArtCreator';
import { createMockCreatorStore } from '../src/screens/creator';
import { ThemeProvider } from '../src/theme/ThemeProvider';

describe('sanitizeBio', () => {
  it('przepuszcza zwykly opis i przycina biale znaki', () => {
    expect(sanitizeBio('  Wojownik z Arroyo.  ')).toBe('Wojownik z Arroyo.');
    expect(sanitizeBio(undefined)).toBe('');
  });
  it('odrzuca HTML z SPA fallbacku (doctype/html, bez wzgledu na wielkosc liter)', () => {
    expect(sanitizeBio('<!doctype html><html></html>')).toBe('');
    expect(sanitizeBio('\n <HTML lang="pl">')).toBe('');
  });
  it('nie odrzuca tekstu zaczynajacego sie od innego znacznika', () => {
    expect(sanitizeBio('<b>pogrubione</b>')).toBe('<b>pogrubione</b>');
  });
});

describe('ArtCreator wiersze sceny', () => {
  it('desktop: kazdy wiersz statystyki ma klase --scene i data-testid', () => {
    const store = createMockCreatorStore();
    const view = store.getView();
    const { container } = render(
      <ThemeProvider profile="desktop">
        <ArtCreator view={view} commands={store.commands} />
      </ThemeProvider>,
    );
    const rows = container.querySelectorAll('.f2-creator__artstat--scene');
    expect(rows.length).toBe(view.stats.length);
    view.stats.forEach((s) => expect(container.querySelector(`[data-testid="stat-${s.id}"]`)).toBeTruthy());
  });
});
