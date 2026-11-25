// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/preact';
import { TopbarVersion } from './TopbarVersion';

describe('TopbarVersion', () => {
  it('renderuje wersje z prefiksem "v"', () => {
    render(<TopbarVersion version="1.1.0+abc1234" />);
    expect(screen.getByTestId('topbar-version').textContent).toBe('v1.1.0+abc1234');
    cleanup();
  });

  it('renderuje "vdev" gdy wersja bundle jest niedostepna', () => {
    render(<TopbarVersion version="dev" />);
    expect(screen.getByTestId('topbar-version').textContent).toBe('vdev');
    cleanup();
  });
});
