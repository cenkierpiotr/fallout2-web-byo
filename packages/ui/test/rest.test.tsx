import { fireEvent, render, screen } from '@testing-library/preact';
import { beforeEach, describe, expect, it } from 'vitest';
import { ThemeProvider, ToastProvider, setLocale } from '../src';
import { Clock } from '../src/screens/rest/Clock';
import { RestHost } from '../src/screens/rest/RestHost';
import { RestScreen } from '../src/screens/rest/RestScreen';
import { createMockRest } from '../src/screens/rest/mock-store';

beforeEach(() => setLocale('pl'));

const wrap = (ui: preact.ComponentChildren) =>
  render(
    <ThemeProvider theme="modern" profile="desktop" fontScale={1}>
      <ToastProvider>{ui}</ToastProvider>
    </ThemeProvider>,
  );

describe('odpoczynek', () => {
  it('tryby wywoluja rest z wlasciwym trybem', () => {
    const m = createMockRest();
    wrap(<RestScreen view={m.view} commands={m.commands} />);
    fireEvent.click(screen.getByText('10 minut'));
    fireEvent.click(screen.getByText('Do rana'));
    fireEvent.click(screen.getByText('Do wyleczenia'));
    expect(m.calls).toEqual(['m10', 'until-morning', 'until-healed']);
  });

  it('wlasna liczba godzin: walidacja i wywolanie', () => {
    const m = createMockRest();
    wrap(<RestScreen view={m.view} commands={m.commands} />);
    const input = screen.getByTestId('rest-hours') as HTMLInputElement;
    fireEvent.input(input, { target: { value: '0' } });
    expect((screen.getByTestId('rest-custom-go') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.input(input, { target: { value: '5' } });
    fireEvent.submit(input.form!);
    expect(m.calls).toEqual([{ hours: 5 }]);
  });

  it('wrogowie: komunikat i zablokowane tryby', () => {
    const m = createMockRest({ enemiesNearby: true });
    wrap(<RestScreen view={m.view} commands={m.commands} />);
    expect(screen.getByRole('alert').textContent).toContain('wrogowie');
    expect((screen.getByText('1 godzina').closest('button') as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('do wyleczenia wylaczone przy pelnym zdrowiu', () => {
    const m = createMockRest({ hp: 35, hpMax: 35 });
    wrap(<RestScreen view={m.view} commands={m.commands} />);
    expect(
      (screen.getByText('Do wyleczenia').closest('button') as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('komunikat o przerwaniu i zegar po odpoczynku', () => {
    const m = createMockRest({ interrupt: true });
    wrap(
      <>
        <Clock clock={m.clock} />
        <RestScreen view={m.view} commands={m.commands} />
      </>,
    );
    expect(screen.getByTestId('hud-clock').textContent).toContain('22:30');
    fireEvent.click(screen.getByText('1 godzina'));
    expect(screen.getByTestId('rest-result').textContent).toContain('przerwany');
    expect(screen.getByTestId('hud-clock').textContent).toContain('23:00');
  });

  it('host: klawisz R otwiera, Esc zamyka', () => {
    const m = createMockRest();
    wrap(<RestHost view={m.view} clock={m.clock} commands={m.commands} />);
    expect(screen.queryByTestId('rest-screen')).toBeNull();
    fireEvent.keyDown(window, { code: 'KeyR', key: 'r' });
    expect(screen.getByTestId('rest-screen')).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByTestId('rest-screen')).toBeNull();
    expect(m.closedCount()).toBe(1);
  });
});
