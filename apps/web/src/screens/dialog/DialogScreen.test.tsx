// @vitest-environment jsdom
import { fireEvent, render, screen, cleanup } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DialogState } from '@f2/vm';
import { setLocale } from '../../i18n';
import { DialogScreen, type DialogViewLike } from './DialogScreen';
import { handleDialogKey, shownOptions } from './dialog-model';

afterEach(() => {
  cleanup();
  setLocale('pl');
});

function opt(i: number, text: string, extra: Partial<DialogState['options'][number]> = {}) {
  return { index: i, text, iqRequired: 0, reaction: 50, visible: true, ...extra };
}
function makeState(over: Partial<DialogState> = {}): DialogState {
  return {
    npcObjId: 1,
    headFid: 0,
    background: 0,
    reaction: 50,
    npcText: 'Witaj, wedrowcze.',
    options: [
      opt(0, 'Pierwsza'),
      opt(1, 'Druga'),
      opt(2, 'Ukryta', { visible: false }),
      opt(3, 'Trzecia', { iqRequired: 6 }),
    ],
    history: [{ who: 'npc', text: 'Dawna kwestia' }],
    mode: 'reply',
    ...over,
  };
}
function makeView(state: DialogState | null): DialogViewLike {
  let v = state;
  const subs = new Set<(x: DialogState | null) => void>();
  return {
    dialog: {
      get value() {
        return v;
      },
      set value(n) {
        v = n;
        subs.forEach((f) => f(n));
      },
      subscribe(fn) {
        subs.add(fn);
        fn(v);
        return () => subs.delete(fn);
      },
    },
  };
}
const cmds = () => ({ choose: vi.fn(), close: vi.fn() });

describe('DialogScreen', () => {
  it('test_dialogScreen_renders_npc_text_and_options', () => {
    render(<DialogScreen view={makeView(makeState())} commands={cmds()} profile="desktop" />);
    expect(screen.getByTestId('dialog-npc-text').textContent).toBe('Witaj, wedrowcze.');
    expect(screen.getByTestId('dialog-npc-text').getAttribute('aria-live')).toBe('polite');
    expect(screen.getByText('Pierwsza')).toBeTruthy();
    expect(screen.queryByText('Ukryta')).toBeNull();
    expect(screen.queryByTestId('dialog-close')).toBeNull();
    expect(screen.getByText('Dawna kwestia')).toBeTruthy();
  });

  it('test_dialogScreen_click_option_calls_choose_with_index', () => {
    const c = cmds();
    render(<DialogScreen view={makeView(makeState())} commands={c} profile="desktop" />);
    fireEvent.click(screen.getByText('Trzecia'));
    expect(c.choose).toHaveBeenCalledWith(3);
  });

  it('test_dialogScreen_keyboard_digit_chooses', () => {
    const c = cmds();
    render(<DialogScreen view={makeView(makeState())} commands={c} profile="desktop" />);
    const root = screen.getByTestId('dialog-screen');
    fireEvent.keyDown(root, { key: '2' });
    expect(c.choose).toHaveBeenLastCalledWith(1);
    fireEvent.keyDown(root, { key: '3' });
    expect(c.choose).toHaveBeenLastCalledWith(3);
    fireEvent.keyDown(root, { key: 'ArrowDown' });
    fireEvent.keyDown(root, { key: 'Enter' });
    expect(c.choose).toHaveBeenLastCalledWith(1);
    fireEvent.keyDown(root, { key: '9' });
    expect(c.choose).toHaveBeenCalledTimes(3);
  });

  it('test_dialogScreen_touch_targets_min_48px', () => {
    render(<DialogScreen view={makeView(makeState())} commands={cmds()} profile="touch" />);
    for (const b of screen.getAllByRole('button')) {
      expect(parseInt((b as HTMLElement).style.minHeight, 10)).toBeGreaterThanOrEqual(48);
    }
    cleanup();
    render(
      <DialogScreen
        view={makeView(makeState({ mode: 'message', options: [] }))}
        commands={cmds()}
        profile="touch"
      />,
    );
    expect(parseInt(screen.getByTestId('dialog-close').style.minHeight, 10)).toBeGreaterThanOrEqual(
      48,
    );
  });

  it('test_dialogScreen_missing_text_placeholder', () => {
    const s = makeState({
      npcText: '',
      options: [opt(0, '', { targetMsgId: 107 }), opt(1, '')],
    });
    render(<DialogScreen view={makeView(s)} commands={cmds()} profile="desktop" />);
    expect(screen.getByText('[MSG 107]')).toBeTruthy();
    expect(screen.getAllByText('[MSG ?]').length).toBe(2);
  });

  it('test_dialogScreen_pl_en_switch_changes_labels', () => {
    const s = makeState({ mode: 'message', options: [] });
    const v = makeView(s);
    setLocale('pl');
    const r = render(<DialogScreen view={v} commands={cmds()} profile="desktop" />);
    expect(screen.getByTestId('dialog-close').textContent).toBe('Zamknij');
    r.unmount();
    setLocale('en');
    render(<DialogScreen view={v} commands={cmds()} profile="desktop" />);
    expect(screen.getByTestId('dialog-close').textContent).toBe('Close');
  });

  it('Zamknij tylko w trybie message; IQ tylko z showSkillChecks', () => {
    const c = cmds();
    const v = makeView(makeState({ mode: 'message', options: [opt(0, 'Done')] }));
    render(<DialogScreen view={v} commands={c} profile="desktop" />);
    fireEvent.click(screen.getByTestId('dialog-close'));
    expect(c.close).toHaveBeenCalled();
    expect(screen.queryByText('Done')).toBeNull();
    cleanup();
    render(<DialogScreen view={makeView(makeState())} commands={c} profile="desktop" />);
    expect(screen.queryByText('IQ 6')).toBeNull();
    cleanup();
    render(
      <DialogScreen view={makeView(makeState())} commands={c} profile="desktop" showSkillChecks />,
    );
    expect(screen.getByText('IQ 6')).toBeTruthy();
  });

  it('nic nie renderuje bez rozmowy i reaguje na zmiane sygnalu', () => {
    const v = makeView(null);
    render(<DialogScreen view={v} commands={cmds()} profile="desktop" />);
    expect(screen.queryByTestId('dialog-screen')).toBeNull();
  });
});

describe('dialog-model', () => {
  it('klawisze 1-9 liczone po opcjach widocznych', () => {
    const shown = shownOptions(makeState());
    expect(shown.map((o) => o.key)).toEqual([1, 2, 3]);
    expect(handleDialogKey('3', shown, 0, 'reply')).toEqual({ kind: 'choose', index: 3 });
    expect(handleDialogKey('Enter', shown, 0, 'message')).toEqual({ kind: 'close' });
  });
});

describe('DialogScreen: klawiatura i pulapka fokusu', () => {
  it('po otwarciu fokus na pierwszej opcji, Enter na opcji z Tab wybiera TE opcje', () => {
    const c = cmds();
    render(<DialogScreen view={makeView(makeState())} commands={c} profile="desktop" />);
    const first = screen.getByTestId('dialog-option-0');
    expect(document.activeElement).toBe(first);
    const second = screen.getByTestId('dialog-option-1');
    second.focus();
    // Enter na przycisku zostawiamy natywnemu klikowi (nie wybieramy opcji ze starego stanu strzalek)
    expect(fireEvent.keyDown(second, { key: 'Enter' })).toBe(true);
    fireEvent.click(second);
    expect(c.choose).toHaveBeenLastCalledWith(1);
  });

  it('Tab na ostatniej opcji wraca na pierwsza, Shift+Tab na pierwszej idzie na ostatnia', () => {
    render(<DialogScreen view={makeView(makeState())} commands={cmds()} profile="desktop" />);
    const first = screen.getByTestId('dialog-option-0');
    const last = screen.getByTestId('dialog-option-3');
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('strzalki przenosza realny fokus i aria-current', () => {
    render(<DialogScreen view={makeView(makeState())} commands={cmds()} profile="desktop" />);
    const root = screen.getByTestId('dialog-screen');
    fireEvent.keyDown(root, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByTestId('dialog-option-1'));
  });

  it('tryb message: fokus na Zamknij, Tab zostaje w dialogu', () => {
    render(
      <DialogScreen
        view={makeView(makeState({ mode: 'message', options: [] }))}
        commands={cmds()}
        profile="desktop"
      />,
    );
    const close = screen.getByTestId('dialog-close');
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
  });

  describe('duch klikniecia po dotknieciu NPC', () => {
    const touchClick = (el: Element): void => {
      const e = new MouseEvent('click', { bubbles: true, cancelable: true });
      Object.defineProperty(e, 'pointerType', { value: 'touch' });
      el.dispatchEvent(e);
    };

    it('dotykowy click tuz po otwarciu nie wybiera opcji, pozniejszy tak', () => {
      const now = vi.spyOn(performance, 'now');
      now.mockReturnValue(1000);
      const c = cmds();
      render(<DialogScreen view={makeView(makeState())} commands={c} profile="touch" />);
      now.mockReturnValue(1100);
      touchClick(screen.getByText('Pierwsza'));
      expect(c.choose).not.toHaveBeenCalled();
      now.mockReturnValue(1600);
      touchClick(screen.getByText('Pierwsza'));
      expect(c.choose).toHaveBeenCalledTimes(1);
      now.mockRestore();
    });

    it('klik myszy tuz po otwarciu dziala bez opoznienia', () => {
      const c = cmds();
      render(<DialogScreen view={makeView(makeState())} commands={c} profile="desktop" />);
      fireEvent.click(screen.getByText('Pierwsza'));
      expect(c.choose).toHaveBeenCalledTimes(1);
    });
  });
});
