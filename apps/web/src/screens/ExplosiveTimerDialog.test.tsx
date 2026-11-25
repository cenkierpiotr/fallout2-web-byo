// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { ExplosiveTimerDialog } from './ExplosiveTimerDialog';
import { fusePrompt } from '../game/explosive-host';
import { setLocale } from '../i18n';

describe('ExplosiveTimerDialog', () => {
  afterEach(() => {
    cleanup();
    fusePrompt.value = null;
    setLocale('en');
  });
  it('jest ukryty bez zapytania', () => {
    render(<ExplosiveTimerDialog />);
    expect(screen.queryByTestId('explosive-timer')).toBeNull();
  });
  it('klawiatura: strzalki zmieniaja czas, Enter potwierdza', async () => {
    const onConfirm = vi.fn();
    fusePrompt.value = { itemId: 1, onConfirm };
    render(<ExplosiveTimerDialog />);
    const box = await screen.findByTestId('explosive-timer');
    fireEvent.keyDown(box, { key: 'ArrowUp' });
    fireEvent.keyDown(box, { key: 'ArrowUp' });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onConfirm).toHaveBeenCalledWith(12);
  });
  it('dotyk: preset i przycisk potwierdzenia, anulowanie zamyka bez wywolania', async () => {
    setLocale('pl');
    const onConfirm = vi.fn();
    fusePrompt.value = { itemId: 1, onConfirm };
    render(<ExplosiveTimerDialog />);
    fireEvent.click(await screen.findByText('30 s'));
    fireEvent.click(screen.getByText('Ustaw ładunek'));
    expect(onConfirm).toHaveBeenCalledWith(30);
    fireEvent.click(screen.getByText('Anuluj'));
    expect(fusePrompt.value).toBeNull();
  });
  it('wartosc poza zakresem jest przycinana', async () => {
    const onConfirm = vi.fn();
    fusePrompt.value = { itemId: 1, onConfirm };
    render(<ExplosiveTimerDialog />);
    const input = await screen.findByTestId('explosive-seconds');
    fireEvent.input(input, { target: { value: '9999' } });
    fireEvent.keyDown(screen.getByTestId('explosive-timer'), { key: 'Enter' });
    expect(onConfirm).toHaveBeenCalledWith(180);
  });
});
