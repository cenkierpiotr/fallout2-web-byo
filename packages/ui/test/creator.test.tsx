import { act, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { CreatorScreen, createMockCreatorStore } from '../src/screens/creator';
import { ThemeProvider } from '../src/theme/ThemeProvider';
import { setLocale } from '../src/i18n';

afterEach(() => setLocale('pl'));

describe('mock-store kreatora', () => {
  it('rozdaje punkty SPECIAL i blokuje ponad limit', () => {
    const s = createMockCreatorStore();
    expect(s.getView().pointsLeft).toBe(5);
    for (let i = 0; i < 5; i++) expect(s.commands.adjustStat(0, 1).ok).toBe(true);
    expect(s.getView().pointsLeft).toBe(0);
    expect(s.commands.adjustStat(1, 1)).toEqual({ ok: false, reason: 'noPoints' });
  });

  it('limit 3 tagow i 2 cech', () => {
    const s = createMockCreatorStore();
    [0, 1, 2].forEach((i) => s.commands.toggleTag(i));
    expect(s.commands.toggleTag(3).ok).toBe(false);
    [0, 1].forEach((i) => s.commands.toggleTrait(i));
    expect(s.commands.toggleTrait(2).ok).toBe(false);
  });

  it('finish odrzucony bez kompletu, preset go odblokowuje', () => {
    const s = createMockCreatorStore();
    expect(s.commands.finish().ok).toBe(false);
    expect(s.getView().reasons).toEqual(['statPoints', 'tags', 'name']);
    s.commands.applyPreset('combat');
    expect(s.getView().canFinish).toBe(true);
    expect(s.commands.finish().ok).toBe(true);
    expect(s.isFinished()).toBe(true);
  });
});

describe('CreatorScreen', () => {
  it('desktop: PL i EN, klik + zmniejsza pule', () => {
    const store = createMockCreatorStore();
    const { rerender } = render(
      <ThemeProvider profile="desktop">
        <CreatorScreen view={store.getView()} commands={store.commands} />
      </ThemeProvider>,
    );
    expect(screen.getByText('Tworzenie postaci')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Zwiększ: Siła' }));
    rerender(
      <ThemeProvider profile="desktop">
        <CreatorScreen view={store.getView()} commands={store.commands} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('points-left').textContent).toContain('4');
    act(() => setLocale('en'));
    expect(screen.getByText('Character creation')).toBeTruthy();
  });
});
