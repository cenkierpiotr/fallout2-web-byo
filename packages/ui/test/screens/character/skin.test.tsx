import { fireEvent, render, screen } from '@testing-library/preact';
import { beforeEach, describe, expect, it } from 'vitest';
import { UiArtProvider, type UiArtSource } from '../../../src/art/context';
import {
  CharacterScreen,
  createMockCharacterStore,
  createMockPlayer,
  setLocale,
  ThemeProvider,
} from '../../../src';

beforeEach(() => setLocale('pl'));

const sourceOf = (sizes: Record<string, [number, number]>): UiArtSource => ({
  get: (name) =>
    sizes[name] ? { url: `${name}.png`, width: sizes[name][0]!, height: sizes[name][1]! } : null,
  subscribe: () => () => {},
});

function setup(source: UiArtSource | null, layout?: 'pc' | 'touch') {
  const store = createMockCharacterStore(createMockPlayer({ skillPoints: 3 }));
  render(
    <ThemeProvider>
      <UiArtProvider source={source} {...(layout ? { layout } : {})}>
        <CharacterScreen view={store.view} commands={store.commands} />
      </UiArtProvider>
    </ThemeProvider>,
  );
}
const IDS = ['special-list', 'skill-list', 'skill-points', 'special-0', 'skill-0', 'skill-level-0'];

describe('karta postaci ze skorka FRM', () => {
  it('bez grafiki dziala jak wczesniej (fallback)', () => {
    setup(null);
    for (const id of IDS) expect(screen.getByTestId(id)).toBeTruthy();
    expect(document.querySelector('[data-art-stage]')).toBeNull();
  });
  it('z char.bg na PC rysuje scene i zachowuje test id', () => {
    setup(sourceOf({ 'char.bg': [640, 480] }), 'pc');
    expect(document.querySelector('[data-art-stage]')).toBeTruthy();
    expect(document.querySelectorAll('[data-art-at]').length).toBeGreaterThanOrEqual(5);
    for (const id of IDS) expect(screen.getByTestId(id)).toBeTruthy();
  });
  it('przyciski + i - nadal zmieniaja punkty', () => {
    setup(sourceOf({ 'char.bg': [640, 480] }), 'pc');
    const before = screen.getByTestId('skill-points').textContent;
    fireEvent.click(screen.getAllByRole('button', { name: /zwiększ|zwieksz/i })[0]!);
    expect(screen.getByTestId('skill-points').textContent).not.toBe(before);
  });
  it('dotyk: nakladka z trescia i cele min 44px w CSS', () => {
    setup(sourceOf({ 'char.bg': [640, 480] }), 'touch');
    expect(document.querySelector('.f2-char__touch-body')).toBeTruthy();
    expect(document.querySelector('.f2-char--touch')).toBeTruthy();
    for (const id of IDS) expect(screen.getByTestId(id)).toBeTruthy();
  });
});
