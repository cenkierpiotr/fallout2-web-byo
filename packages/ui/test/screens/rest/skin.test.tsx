import { fireEvent, render, screen } from '@testing-library/preact';
import { beforeEach, describe, expect, it } from 'vitest';
import { UiArtProvider, type UiArtSource } from '../../../src/art/context';
import { ThemeProvider } from '../../../src/theme/ThemeProvider';
import { ToastProvider } from '../../../src/components/Toast';
import { setLocale } from '../../../src/i18n';
import { RestScreen } from '../../../src/screens/rest/RestScreen';
import { createMockRest } from '../../../src/screens/rest/mock-store';

beforeEach(() => setLocale('pl'));

const sourceOf = (sizes: Record<string, [number, number]>): UiArtSource => ({
  get: (name) =>
    sizes[name] ? { url: `${name}.png`, width: sizes[name][0]!, height: sizes[name][1]! } : null,
  subscribe: () => () => {},
});
const BG: Record<string, [number, number]> = { 'rest.bg': [640, 480] };

function setup(source?: UiArtSource, layout?: 'pc' | 'touch', over = {}) {
  const m = createMockRest(over);
  render(
    <ThemeProvider theme="modern" profile="desktop" fontScale={1}>
      <UiArtProvider source={source ?? null} {...(layout ? { layout } : {})}>
        <ToastProvider>
          <RestScreen view={m.view} commands={m.commands} />
        </ToastProvider>
      </UiArtProvider>
    </ThemeProvider>,
  );
  return m;
}

describe('RestScreen - skorka FRM', () => {
  it('bez sztuki: panel bez sceny', () => {
    setup();
    expect(document.querySelector('[data-art-stage]')).toBeNull();
    expect(document.querySelector('.f2-rest--art')).toBeNull();
    expect(screen.getByTestId('rest-screen')).toBeTruthy();
  });

  it('PC: scena 640/480, akcje dzialaja, testidy bez zmian', () => {
    const m = setup(sourceOf(BG), 'pc');
    const stage = document.querySelector('[data-art-stage]') as HTMLElement;
    expect(stage.style.aspectRatio.replace(/\s/g, '')).toBe('640/480');
    expect(document.querySelectorAll('[data-art-at]').length).toBe(1);
    fireEvent.click(screen.getByText('Do rana'));
    expect(m.calls).toEqual(['until-morning']);
    expect(screen.getByTestId('rest-hours')).toBeTruthy();
    expect(screen.getByTestId('rest-hp')).toBeTruthy();
  });

  it('wrogowie blokuja tryby takze pod skorka', () => {
    setup(sourceOf(BG), 'pc', { enemiesNearby: true });
    expect(screen.getByRole('alert')).toBeTruthy();
    expect((screen.getByText('1 godzina').closest('button') as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('dotyk: nakladka bez ArtAt', () => {
    setup(sourceOf(BG), 'touch');
    expect(document.querySelector('.f2-rest__touch')).toBeTruthy();
    expect(document.querySelectorAll('[data-art-at]').length).toBe(0);
  });
});
