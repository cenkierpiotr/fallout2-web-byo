import { fireEvent, render, screen } from '@testing-library/preact';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signal } from '@preact/signals';
import { ThemeProvider, ToastProvider, setLocale } from '../src';
import {
  PipboyScreen,
  adaptQuestLog,
  countRevealed,
  createFullMockPipboyView,
  createMockPipboyView,
  paginateHolodisk,
  type PipboyCommands,
  type QuestLogLike,
} from '../src/screens/pipboy';

beforeEach(() => setLocale('pl'));

const wrap = (ui: preact.ComponentChildren) =>
  render(
    <ThemeProvider theme="modern" profile="desktop" fontScale={1}>
      <ToastProvider>{ui}</ToastProvider>
    </ThemeProvider>,
  );

describe('adapter dziennika (model quest/karma/holodisk)', () => {
  const log: QuestLogLike = {
    locations: [{ locationMsg: 1, quests: [{ descriptionMsg: 10, gvar: 9, status: 'active' }] }],
    holodisks: [{ gvar: 5, titleMsg: 100, textMsg: 200 }],
    karma: 42,
    titles: [{ pic: 1, nameMsg: 7, descriptionMsg: 8 }],
  };
  const msg = {
    location: (n: number) => `loc${n}`,
    quest: (n: number) => `q${n}`,
    holodiskTitle: (n: number) => `ht${n}`,
    holodiskText: (n: number) => `tx${n}`,
    karma: (n: number) => `k${n}`,
  };
  it('zamienia numery MSG na teksty', () => {
    const d = adaptQuestLog(log, msg);
    expect(d.quests).toEqual([
      { location: 'loc1', quests: [{ description: 'q10', status: 'active' }] },
    ]);
    expect(d.holodisks).toEqual([{ id: 5, title: 'ht100', text: 'tx200' }]);
    expect(d.karma).toEqual({ value: 42, titles: [{ name: 'k7', description: 'k8' }] });
  });
  it('paginuje holodysk po 35 wierszy, pusty tekst = 1 strona', () => {
    const text = Array.from({ length: 40 }, (_, i) => `w${i}`).join('\n');
    expect(paginateHolodisk(text).length).toBe(2);
    expect(paginateHolodisk('')).toEqual(['']);
  });
  it('liczy odkryte kafle', () => {
    expect(countRevealed(new Uint8Array([0b101, 0xff]))).toBe(10);
  });
});

describe('Pip-Boy: zakladki', () => {
  it('zadania: grupy per lokacja, status ukonczone, filtr aktywnych', () => {
    wrap(<PipboyScreen view={createFullMockPipboyView()} initialTab="quests" />);
    expect(screen.getByText('Arroyo')).toBeTruthy();
    expect(screen.getByText('Odzyskaj GECK')).toBeTruthy();
    expect(screen.getByText('Znajdz Vic').closest('li')?.getAttribute('data-status')).toBe(
      'completed',
    );
    fireEvent.click(screen.getByRole('switch', { name: 'Tylko aktywne' }));
    expect(screen.queryByText('Znajdz Vic')).toBeNull();
  });

  it('zadania: pusty dziennik pokazuje komunikat', () => {
    wrap(<PipboyScreen view={createMockPipboyView()} initialTab="quests" />);
    expect(screen.getByTestId('pipboy-quests-empty')).toBeTruthy();
  });

  it('archiwa: lista holodyskow, czytnik ze stronami', () => {
    wrap(<PipboyScreen view={createFullMockPipboyView()} initialTab="archives" />);
    fireEvent.click(screen.getByRole('button', { name: 'Dziennik Vaulta' }));
    expect(screen.getByTestId('pipboy-holodisk-page').textContent).toContain('Wiersz 1');
    expect(screen.getByTestId('pipboy-holodisk-pager').textContent).toContain('1/2');
    fireEvent.click(screen.getByRole('button', { name: 'Następna strona' }));
    expect(screen.getByTestId('pipboy-holodisk-page').textContent).toContain('Wiersz 40');
    fireEvent.click(screen.getByRole('button', { name: 'Wróć do listy' }));
    expect(screen.getByRole('button', { name: 'Dziennik Vaulta' })).toBeTruthy();
  });

  it('archiwa: tytuly karmy', () => {
    wrap(<PipboyScreen view={createFullMockPipboyView()} initialTab="archives" />);
    expect(screen.getByTestId('pipboy-karma').textContent).toContain('Bohater');
  });

  it('mapa: opis odkrytych kafli', () => {
    wrap(<PipboyScreen view={createFullMockPipboyView()} initialTab="map" />);
    expect(screen.getByTestId('pipboy-automap').getAttribute('data-revealed')).toBe('400');
  });

  it('mapa: brak danych = komunikat', () => {
    wrap(<PipboyScreen view={createMockPipboyView()} initialTab="map" />);
    expect(screen.getByTestId('pipboy-placeholder-map')).toBeTruthy();
  });

  it('budzik: przyciski wywoluja rest, blokada pokazuje powod', () => {
    const rest = vi.fn();
    const commands: PipboyCommands = { rest };
    const view = createFullMockPipboyView();
    wrap(<PipboyScreen view={view} initialTab="clock" commands={commands} />);
    expect(screen.getByTestId('pipboy-clock').textContent).toContain('13:00');
    fireEvent.click(screen.getByRole('button', { name: 'Odpocznij 10 min' }));
    expect(rest).toHaveBeenLastCalledWith({ kind: 'minutes', n: 10 });
    fireEvent.click(screen.getByRole('button', { name: 'Odpocznij do wyleczenia' }));
    expect(rest).toHaveBeenLastCalledWith({ kind: 'healed' });
    fireEvent.input(screen.getByRole('slider'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Odpocznij do godziny 6:00' }));
    expect(rest).toHaveBeenLastCalledWith({ kind: 'hour', h: 6 });
  });

  it('budzik: blokada gdy wrogowie w poblizu', () => {
    const rest = vi.fn();
    const view = signal({
      ...createFullMockPipboyView().value,
      restBlocked: 'enemies_nearby' as const,
    });
    wrap(<PipboyScreen view={view} initialTab="clock" commands={{ rest }} />);
    expect(screen.getByRole('alert').textContent).toContain('wrogowie');
    fireEvent.click(screen.getByRole('button', { name: 'Odpocznij 10 min' }));
    expect(rest).not.toHaveBeenCalled();
  });

  it('EN: etykiety zakladek i zadan', () => {
    setLocale('en');
    wrap(<PipboyScreen view={createFullMockPipboyView()} initialTab="quests" />);
    expect(screen.getByRole('switch', { name: 'Active only' })).toBeTruthy();
  });
});
