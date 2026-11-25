// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Modal, UiArtProvider, type UiArtSource } from '../src';

const src = (has: boolean): UiArtSource => ({
  get: (name) => (has && name === 'inv.bg' ? { url: 'x.png', width: 640, height: 480 } : null),
  subscribe: () => () => {},
});

afterEach(cleanup);

describe('Modal ze skorka', () => {
  it('bez grafiki zachowuje stary wyglad', () => {
    render(
      <UiArtProvider source={src(false)}>
        <Modal open title="T" onClose={() => {}} artBackground="inv.bg">
          <p>x</p>
        </Modal>
      </UiArtProvider>,
    );
    expect(screen.getByRole('dialog').className).toBe('f2-modal');
  });
  it('bez artBackground nie jest pelnoekranowy nawet z grafika', () => {
    render(
      <UiArtProvider source={src(true)}>
        <Modal open title="T" onClose={() => {}}>
          <p>x</p>
        </Modal>
      </UiArtProvider>,
    );
    expect(screen.getByRole('dialog').className).toBe('f2-modal');
  });
  it('z grafika jest pelnoekranowy, Esc zamyka', () => {
    const onClose = vi.fn();
    render(
      <UiArtProvider source={src(true)}>
        <Modal open title="T" onClose={onClose} artBackground="inv.bg">
          <p>x</p>
        </Modal>
      </UiArtProvider>,
    );
    const d = screen.getByRole('dialog');
    expect(d.className).toContain('f2-modal--art');
    fireEvent.keyDown(d, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
