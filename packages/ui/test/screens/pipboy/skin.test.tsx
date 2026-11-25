import { fireEvent, render, screen } from '@testing-library/preact';
import { beforeEach, describe, expect, it } from 'vitest';
import { UiArtProvider, type UiArtSource } from '../../../src/art/context';
import { ThemeProvider } from '../../../src/theme/ThemeProvider';
import { ToastProvider } from '../../../src/components/Toast';
import { setLocale } from '../../../src/i18n';
import { PipboyScreen } from '../../../src/screens/pipboy/PipboyScreen';
import { createFullMockPipboyView } from '../../../src/screens/pipboy/mock-store';

beforeEach(() => setLocale('pl'));

const sourceOf = (sizes: Record<string, [number, number]>): UiArtSource => ({
  get: (name) =>
    sizes[name] ? { url: `${name}.png`, width: sizes[name][0]!, height: sizes[name][1]! } : null,
  subscribe: () => () => {},
});
const PIP: Record<string, [number, number]> = { 'pip.bg': [640, 480] };

function setup(source?: UiArtSource, layout?: 'pc' | 'touch') {
  render(
    <ThemeProvider theme="modern" profile="desktop" fontScale={1}>
      <UiArtProvider source={source ?? null} {...(layout ? { layout } : {})}>
        <ToastProvider>
          <PipboyScreen view={createFullMockPipboyView()} />
        </ToastProvider>
      </UiArtProvider>
    </ThemeProvider>,
  );
}

describe('PipboyScreen - skorka FRM', () => {
  it('bez sztuki: fallback bez sceny', () => {
    setup();
    expect(document.querySelector('[data-art-stage]')).toBeNull();
    expect(screen.getByTestId('pipboy-screen').className).not.toContain('--art');
    expect(screen.getByTestId('pipboy-status')).toBeTruthy();
  });

  it('PC: tlo 640/480, LCD i pas zakladek, te same testidy i zakladki dzialaja', () => {
    setup(sourceOf(PIP), 'pc');
    const stage = document.querySelector('[data-art-stage]') as HTMLElement;
    expect(stage.style.aspectRatio.replace(/\s/g, '')).toBe('640/480');
    expect(stage.style.backgroundImage).toContain('pip.bg.png');
    expect(document.querySelectorAll('[data-art-at]').length).toBe(2);
    expect(screen.getByTestId('pipboy-panel')).toBeTruthy();
    expect(screen.getAllByRole('tab')).toHaveLength(5);
    fireEvent.click(screen.getByRole('tab', { name: 'Mapa' }));
    expect(screen.getByRole('tab', { name: 'Mapa' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe('f2-tab-map');
  });

  it('dotyk: tresc jako nakladka, zakladki w nakladce i bez ArtAt', () => {
    setup(sourceOf(PIP), 'touch');
    const touch = document.querySelector('.f2-pipboy__touch');
    expect(touch).toBeTruthy();
    expect(touch!.contains(screen.getByTestId('pipboy-panel'))).toBe(true);
    expect(touch!.querySelector('[role=tablist]')).toBeTruthy();
    expect(document.querySelectorAll('[data-art-at]').length).toBe(0);
  });
});
