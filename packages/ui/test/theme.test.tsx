import { act, render } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { ThemeProvider, useTheme } from '../src/theme/ThemeProvider';

function Probe() {
  const t = useTheme();
  return (
    <div>
      <span data-testid="t">{t.theme}</span>
      <span data-testid="p">{t.profile}</span>
      <button onClick={() => t.setTheme('retro')}>retro</button>
      <button onClick={() => t.setProfile('touch')}>touch</button>
      <button onClick={() => t.setFontScale(1.6)}>big</button>
      <button onClick={() => t.setFontScale(9)}>huge</button>
    </div>
  );
}

describe('ThemeProvider', () => {
  it('sets attributes on <html> and updates them', () => {
    const { getByText, getByTestId } = render(
      <ThemeProvider theme="modern" profile="desktop" fontScale={1}>
        <Probe />
      </ThemeProvider>,
    );
    const html = document.documentElement;
    expect(html.dataset['theme']).toBe('modern');
    expect(html.dataset['profile']).toBe('desktop');
    expect(html.style.getPropertyValue('--font-scale')).toBe('1');
    act(() => getByText('retro').click());
    expect(html.dataset['theme']).toBe('retro');
    expect(getByTestId('t').textContent).toBe('retro');
    act(() => getByText('touch').click());
    expect(html.dataset['profile']).toBe('touch');
    act(() => getByText('big').click());
    expect(html.style.getPropertyValue('--font-scale')).toBe('1.6');
    act(() => getByText('huge').click());
    expect(html.style.getPropertyValue('--font-scale')).toBe('1.6');
  });

  it('useTheme outside provider throws', () => {
    expect(() => render(<Probe />)).toThrow();
  });
});
