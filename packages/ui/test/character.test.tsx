import { act, fireEvent, render, screen, within } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CharacterScreen,
  canIncrease,
  createMockCharacterStore,
  createMockPlayer,
  draftRemaining,
  previewSkill,
  setLocale,
  ThemeProvider,
  type MockCharacterStore,
} from '../src';
import { formatUnmet } from '../src/screens/character/unmet';

afterEach(() => setLocale('pl'));

const mount = (store: MockCharacterStore) =>
  render(
    <ThemeProvider>
      <CharacterScreen view={store.view} commands={store.commands} />
    </ThemeProvider>,
  );

describe('draft umiejetnosci', () => {
  const p = createMockPlayer({ skillPoints: 3 });
  it('oznaczony skill rosnie o 2 i koszt idzie z tabeli', () => {
    expect(previewSkill(p, 0, 2).level).toBe(24);
    expect(previewSkill(p, 0, 2).spent).toBe(2);
  });
  it('nie pozwala przekroczyc puli punktow', () => {
    expect(canIncrease(p, { 1: 3 }, 2)).toBe(false);
    expect(draftRemaining(p, { 1: 2 })).toBe(1);
  });
  it('koszt rosnie powyzej 100%', () => {
    const q = createMockPlayer({ skillPoints: 10 });
    q.skills[2] = { level: 100, tagged: false, cost: 1, gain: 1 };
    const pv = previewSkill(q, 2, 2);
    expect(pv.spent).toBe(3);
    expect(pv.level).toBe(102);
  });
});

describe('formatUnmet', () => {
  it('tlumaczy kody wymagan', () => {
    expect(formatUnmet('IN<6')).toBe('Inteligencja: co najmniej 6');
    expect(formatUnmet('skill:Doctor<75')).toBe('Medycyna: co najmniej 75%');
    expect(formatUnmet('level<12')).toBe('Wymagany poziom: 12');
  });
});

describe('CharacterScreen', () => {
  it('draft nie wysyla komend do zatwierdzenia, potem seria spendSkill', () => {
    const store = createMockCharacterStore();
    mount(store);
    const plus = screen.getByLabelText('Zwiększ: Pierwsza pomoc');
    fireEvent.click(plus);
    fireEvent.click(plus);
    expect(store.calls).toEqual([]);
    expect(screen.getByTestId('skill-level-6').textContent).toBe('40%');
    fireEvent.click(screen.getByText('Zatwierdź'));
    expect(store.calls).toEqual([
      [6, 1],
      [6, 1],
    ]);
    expect(store.view.player.value.skills[6]?.level).toBe(40);
    expect(store.view.player.value.skillPoints).toBe(5);
  });

  it('Cofnij przywraca stan', () => {
    const store = createMockCharacterStore();
    mount(store);
    fireEvent.click(screen.getByLabelText('Zwiększ: Handel'));
    fireEvent.click(screen.getByText('Cofnij'));
    expect(store.calls).toEqual([]);
    expect(screen.getByTestId('skill-level-15').textContent).toBe('65%');
  });

  it('PL i EN', () => {
    const store = createMockCharacterStore();
    mount(store);
    expect(screen.getByText('Umiejętności')).toBeTruthy();
    act(() => setLocale('en'));
    expect(screen.getByText('Skills')).toBeTruthy();
    expect(screen.getByLabelText('Increase First Aid')).toBeTruthy();
  });

  it('wybor atutu pokazuje tylko dostepne i wola choosePerk', () => {
    const store = createMockCharacterStore();
    mount(store);
    fireEvent.click(screen.getByText(/Wybierz atut/));
    const picker = screen.getByTestId('perk-picker');
    expect(within(picker).getAllByRole('option')).toHaveLength(2);
    fireEvent.click(screen.getByTestId('perk-option-2'));
    fireEvent.click(within(picker).getByText('Wybierz'));
    expect(store.view.player.value.unspentPerks).toBe(0);
  });
});
