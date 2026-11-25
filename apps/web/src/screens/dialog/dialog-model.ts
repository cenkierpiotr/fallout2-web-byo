import type { DialogOption, DialogState } from '@f2/vm';

/** Opcja gotowa do wyswietlenia: indeks w stanie, numer klawisza i tekst. */
export interface ShownOption {
  /** Argument `choose` (pozycja w DialogState.options). */
  index: number;
  /** Numer klawisza 1..9 (0 gdy opcja nie ma skrotu). */
  key: number;
  text: string;
  iqRequired: number;
  reaction: 'good' | 'neutral' | 'bad';
}

function reactionOf(r: number): ShownOption['reaction'] {
  return r === 49 ? 'good' : r === 51 ? 'bad' : 'neutral';
}

/** Tekst z placeholderem `[MSG id]` gdy komunikat nie zostal znaleziony (Review Focus 5). */
export function textOrPlaceholder(text: string | undefined, msgId?: number): string {
  if (text !== undefined && text.trim() !== '') return text;
  return `[MSG ${msgId ?? '?'}]`;
}

/** Opcje widoczne (IQ spelnione); niewidoczne sa pomijane, jak w oryginale. */
export function shownOptions(state: DialogState): ShownOption[] {
  const out: ShownOption[] = [];
  state.options.forEach((o: DialogOption, i) => {
    if (!o.visible) return;
    out.push({
      index: i,
      key: out.length < 9 ? out.length + 1 : 0,
      text: textOrPlaceholder(o.text, o.targetMsgId),
      iqRequired: o.iqRequired,
      reaction: reactionOf(o.reaction),
    });
  });
  return out;
}

export type DialogKeyResult =
  | { kind: 'choose'; index: number }
  | { kind: 'close' }
  | { kind: 'focus'; position: number }
  | { kind: 'none' };

/**
 * Klawiatura: 1-9 wybiera opcje, strzalki zmieniaja podswietlenie, Enter wybiera podswietlona.
 * W trybie 'message' Enter i 1 zamykaja rozmowe.
 */
export function handleDialogKey(
  key: string,
  shown: ShownOption[],
  focused: number,
  mode: DialogState['mode'],
): DialogKeyResult {
  if (mode === 'message') {
    return key === 'Enter' || key === '1' || key === ' ' ? { kind: 'close' } : { kind: 'none' };
  }
  if (/^[1-9]$/.test(key)) {
    const o = shown[Number(key) - 1];
    return o ? { kind: 'choose', index: o.index } : { kind: 'none' };
  }
  if (shown.length === 0) return { kind: 'none' };
  if (key === 'ArrowDown')
    return { kind: 'focus', position: Math.min(shown.length - 1, focused + 1) };
  if (key === 'ArrowUp') return { kind: 'focus', position: Math.max(0, focused - 1) };
  if (key === 'Enter') {
    const o = shown[Math.max(0, Math.min(focused, shown.length - 1))];
    return o ? { kind: 'choose', index: o.index } : { kind: 'none' };
  }
  return { kind: 'none' };
}
