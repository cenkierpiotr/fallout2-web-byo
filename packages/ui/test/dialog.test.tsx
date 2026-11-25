import { act, fireEvent, render, screen } from '@testing-library/preact';
import { beforeEach, describe, expect, it } from 'vitest';
import { setLocale } from '../src';
import { DialogScreen } from '../src/screens/dialog/DialogScreen';
import { createMockDialog, sampleDialog } from '../src/screens/dialog/mock-store';
import {
  handleDialogDigit,
  pastEntries,
  requirementLabel,
  shownOptions,
} from '../src/screens/dialog/model';

beforeEach(() => setLocale('pl'));

const mount = (props: { profile?: 'desktop' | 'touch'; percent?: boolean } = {}) => {
  const m = createMockDialog();
  const r = render(
    <DialogScreen
      view={{ dialog: m.dialog }}
      commands={m.commands}
      profile={props.profile ?? 'desktop'}
      showSkillCheckPercent={props.percent ?? false}
    />,
  );
  return { m, ...r };
};

describe('model dialogu', () => {
  it('pomija niewidoczne opcje i numeruje 1..9', () => {
    const shown = shownOptions(sampleDialog(), false);
    expect(shown.map((o) => o.key)).toEqual([1, 2, 3, 4]);
    expect(shown.map((o) => o.index)).toEqual([0, 1, 2, 4]);
  });
  it('wymaganie: nazwa testu, procent tylko z ustawieniem, IQ bez procentu', () => {
    const [, skill, iq] = sampleDialog().options;
    expect(requirementLabel(skill!, false)).toBe('Retoryka');
    expect(requirementLabel(skill!, true)).toBe('Retoryka 65%');
    expect(requirementLabel(iq!, true)).toBe('IQ 6');
  });
  it('cyfry wybieraja, w trybie message tylko 1 zamyka', () => {
    const shown = shownOptions(sampleDialog(), false);
    expect(handleDialogDigit('2', shown, 'reply')).toEqual({ kind: 'choose', index: 1 });
    expect(handleDialogDigit('9', shown, 'reply')).toEqual({ kind: 'none' });
    expect(handleDialogDigit('1', shown, 'message')).toEqual({ kind: 'close' });
    expect(handleDialogDigit('a', shown, 'reply')).toEqual({ kind: 'none' });
  });
  it('historia bez biezacej kwestii NPC', () => {
    expect(pastEntries(sampleDialog())).toEqual([]);
  });
});

describe('DialogScreen', () => {
  it('nic nie renderuje bez rozmowy', () => {
    const m = createMockDialog(null);
    render(<DialogScreen view={{ dialog: m.dialog }} commands={m.commands} profile="desktop" />);
    expect(screen.queryByTestId('dialog-screen')).toBeNull();
  });

  it('renderuje tekst NPC z aria-live i widoczne opcje', () => {
    mount();
    const text = screen.getByTestId('dialog-npc-text');
    expect(text.getAttribute('aria-live')).toBe('polite');
    expect(text.textContent).toContain('Witaj');
    expect(screen.getAllByTestId('dialog-option')).toHaveLength(4);
  });

  it('fokus na pierwszej opcji po otwarciu i po zmianie wezla', async () => {
    const { m } = mount();
    const first = () => screen.getAllByTestId('dialog-option')[0]!;
    expect(document.activeElement).toBe(first());
    await act(async () => {
      m.commands.choose(0);
    });
    expect(screen.getByTestId('dialog-npc-text').textContent).toContain('Odpowiedz');
    expect(document.activeElement).toBe(first());
  });

  it('klawisz cyfry wybiera opcje i nie wycieka do mapy', () => {
    const { m, container } = mount();
    let leaked = false;
    container.addEventListener('keydown', () => (leaked = true));
    fireEvent.keyDown(screen.getAllByTestId('dialog-option')[0]!, { key: '2' });
    expect(m.log).toContain('choose:1');
    expect(leaked).toBe(false);
  });

  it('strzalka w dol przesuwa fokus (roving), Enter to natywny klik', () => {
    mount();
    const opts = screen.getAllByTestId('dialog-option');
    fireEvent.keyDown(opts[0]!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(opts[1]);
    expect(opts[1]!.tabIndex).toBe(0);
    expect(opts[0]!.tabIndex).toBe(-1);
  });

  it('procent wymagania widoczny tylko z ustawieniem', () => {
    const a = mount({ percent: true });
    expect(screen.getAllByTestId('dialog-option-req')[0]!.textContent).toBe('Retoryka 65%');
    a.unmount();
    mount({ percent: false });
    expect(screen.getAllByTestId('dialog-option-req')[0]!.textContent).toBe('Retoryka');
  });

  it('Handel i Przeglad: komenda barter, przelaczanie historii', () => {
    const { m } = mount();
    fireEvent.click(screen.getByTestId('dialog-barter'));
    expect(m.log).toContain('barter');
    const review = screen.getByTestId('dialog-review');
    expect(review.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(review);
    expect(review.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('dialog-history').textContent).toContain('Witaj');
  });

  it('profil touch: karty >= 48 px przez zmienna celu (css), data-profile ustawione', () => {
    mount({ profile: 'touch' });
    expect(screen.getByTestId('dialog-screen').getAttribute('data-profile')).toBe('touch');
  });
});
