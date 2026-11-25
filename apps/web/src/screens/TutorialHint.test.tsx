// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/preact';
import { TutorialHint } from './TutorialHint';
import { fireHint, resetTutorialForTest } from '../state/tutorial-hints';

describe('TutorialHint', () => {
  beforeEach(() => {
    localStorage.clear();
    resetTutorialForTest();
  });
  it('pokazuje podpowiedz, zamyka ja, a Pomiń wylacza kolejne', async () => {
    const { rerender } = render(<TutorialHint />);
    expect(screen.queryByTestId('tutorial-hint')).toBeNull();
    fireHint('inventory');
    rerender(<TutorialHint />);
    await Promise.resolve();
    expect(screen.getByTestId('tutorial-hint').textContent).toMatch(/I|Inventory/);
    fireEvent.click(screen.getByTestId('tutorial-ok'));
    expect(screen.queryByTestId('tutorial-hint')).toBeNull();
    fireHint('save');
    fireEvent.click(await screen.findByTestId('tutorial-skip'));
    expect(screen.queryByTestId('tutorial-hint')).toBeNull();
    expect(fireHint('move')).toBeNull();
  });
});
