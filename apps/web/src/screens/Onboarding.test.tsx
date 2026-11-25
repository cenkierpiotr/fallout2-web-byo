// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/preact';
import { Onboarding } from './Onboarding';

describe('Onboarding', () => {
  it('przechodzi przez kroki, pomija i nie wraca po ponownym renderze', () => {
    localStorage.clear();
    const r = render(<Onboarding label="patch 1.02.25" />);
    expect(screen.getByTestId('onboarding')).toBeTruthy();
    fireEvent.click(screen.getByTestId('onboarding-next'));
    expect(screen.getByTestId('onboarding').textContent).toContain('patch 1.02.25');
    fireEvent.click(screen.getByTestId('onboarding-skip'));
    expect(screen.queryByTestId('onboarding')).toBeNull();
    r.unmount();
    render(<Onboarding />);
    expect(screen.queryByTestId('onboarding')).toBeNull();
  });

  it('krok skali UI zapisuje uiScale w ustawieniach', async () => {
    localStorage.clear();
    vi.resetModules();
    const { Onboarding: Fresh } = await import('./Onboarding');
    const { settings, DEFAULT_SETTINGS } = await import('../settings');
    settings.value = { ...DEFAULT_SETTINGS };
    render(<Fresh />);
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByTestId('onboarding-next'));
    fireEvent.click(screen.getByTestId('onboarding-scale-large'));
    expect(settings.value.uiScale).toBe(1.25);
    expect(screen.getByTestId('onboarding-scale-large').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByTestId('onboarding-next'));
    fireEvent.click(screen.getByTestId('onboarding-next'));
    expect(screen.queryByTestId('onboarding')).toBeNull();
  });
});
