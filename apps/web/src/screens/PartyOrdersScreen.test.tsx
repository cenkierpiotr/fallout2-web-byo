// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { PartyOrdersScreen } from './PartyOrdersScreen';
import type { PartyOrdersRow } from '../game/party-orders-view';

const row = (): PartyOrdersRow => ({
  objId: 7,
  pid: 1,
  options: {
    distance: ['stay_close', 'charge'],
    attackWho: [],
    areaAttackMode: [],
    bestWeapon: [],
    chemUse: [],
    runAwayMode: [],
  } as never,
  orders: {},
});

afterEach(cleanup);

describe('PartyOrdersScreen', () => {
  it('pokazuje tylko klucze z opcjami i zapisuje wybor', () => {
    const onSet = vi.fn(() => true);
    render(<PartyOrdersScreen rows={() => [row()]} onSet={onSet} />);
    expect(screen.queryByTestId('orders-7-attackWho')).toBeNull();
    fireEvent.change(screen.getByTestId('orders-7-distance'), { target: { value: 'charge' } });
    expect(onSet).toHaveBeenCalledWith(7, 'distance', 'charge');
  });
  it('odrzucony rozkaz pokazuje blad', () => {
    render(<PartyOrdersScreen rows={() => [row()]} onSet={() => false} />);
    fireEvent.change(screen.getByTestId('orders-7-distance'), { target: { value: 'charge' } });
    expect(screen.getByTestId('orders-error')).toBeTruthy();
  });
  it('nazwa towarzysza z resolvera, a bez niej zastepcze Towarzysz N', () => {
    const { unmount } = render(
      <PartyOrdersScreen rows={() => [row()]} onSet={() => true} nameOf={() => 'Sulik'} />,
    );
    expect(screen.getByTestId('orders-member-7').querySelector('legend')?.textContent).toBe(
      'Sulik',
    );
    unmount();
    render(<PartyOrdersScreen rows={() => [row()]} onSet={() => true} nameOf={() => undefined} />);
    expect(screen.getByTestId('orders-member-7').querySelector('legend')?.textContent).toMatch(
      /Companion 1|Towarzysz 1|1/,
    );
  });
  it('pusta druzyna', () => {
    render(<PartyOrdersScreen rows={() => []} onSet={() => true} />);
    expect(screen.getByTestId('orders-empty')).toBeTruthy();
  });
});
