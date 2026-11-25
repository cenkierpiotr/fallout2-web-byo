import { fireEvent, render, screen } from '@testing-library/preact';
import { beforeEach, describe, expect, it } from 'vitest';
import { ThemeProvider, ToastProvider, setLocale } from '../src';
import { PipboyHost } from '../src/screens/pipboy/PipboyHost';
import { PipboyScreen } from '../src/screens/pipboy/PipboyScreen';
import { createMockPipboyView } from '../src/screens/pipboy/mock-store';

beforeEach(() => setLocale('pl'));

const wrap = (ui: preact.ComponentChildren, profile: 'desktop' | 'touch' = 'desktop') =>
  render(
    <ThemeProvider theme="modern" profile={profile} fontScale={1}>
      <ToastProvider>{ui}</ToastProvider>
    </ThemeProvider>,
  );

describe('Pip-Boy', () => {
  it('pokazuje stan i zmienia zakladki na placeholdery', () => {
    wrap(<PipboyScreen view={createMockPipboyView()} />);
    expect(screen.getByTestId('pipboy-status').textContent).toContain('Wybraniec');
    fireEvent.click(screen.getByRole('tab', { name: 'Mapa' }));
    expect(screen.getByTestId('pipboy-placeholder-map')).toBeTruthy();
  });

  it('zakladki na dole w profilu dotykowym', () => {
    wrap(<PipboyScreen view={createMockPipboyView()} />, 'touch');
    expect(screen.getByTestId('pipboy-screen').getAttribute('data-tabs')).toBe('bottom');
  });

  it('klawisz P przelacza okno, Esc zamyka', () => {
    wrap(<PipboyHost view={createMockPipboyView()} />);
    expect(screen.queryByTestId('pipboy-screen')).toBeNull();
    fireEvent.keyDown(window, { code: 'KeyP', key: 'p' });
    expect(screen.getByTestId('pipboy-screen')).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByTestId('pipboy-screen')).toBeNull();
  });
});
