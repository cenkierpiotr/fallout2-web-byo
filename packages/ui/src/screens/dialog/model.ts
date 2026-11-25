import { t } from '../../i18n';
import type { DialogOptionView, DialogReaction, DialogView } from './types';

export interface ShownOption {
  index: number;
  /** Numer klawisza 1..9 (0 = brak skrotu). */
  key: number;
  text: string;
  reaction: DialogReaction;
  /** Tekst oznaczenia wymagania (puste = brak). */
  requirement: string;
}

/** Etykieta wymagania: nazwa testu zawsze, procent tylko gdy `showPercent`. */
export function requirementLabel(o: DialogOptionView, showPercent: boolean): string {
  if (o.skill) {
    return showPercent
      ? t('dialog.req.skillPercent', { skill: o.skill.name, percent: Math.round(o.skill.percent) })
      : t('dialog.req.skill', { skill: o.skill.name });
  }
  return o.iqRequired > 0 ? t('dialog.req.iq', { iq: o.iqRequired }) : '';
}

export function textOrPlaceholder(text: string | undefined): string {
  return text !== undefined && text.trim() !== '' ? text : '[MSG ?]';
}

export function shownOptions(view: DialogView, showPercent: boolean): ShownOption[] {
  const out: ShownOption[] = [];
  for (const o of view.options) {
    if (!o.visible) continue;
    out.push({
      index: o.index,
      key: out.length < 9 ? out.length + 1 : 0,
      text: textOrPlaceholder(o.text),
      reaction: o.reaction,
      requirement: requirementLabel(o, showPercent),
    });
  }
  return out;
}

/** Historia bez biezacej kwestii NPC (jest pokazana osobno, duza). */
export function pastEntries(view: DialogView): DialogView['history'] {
  const h = view.history;
  const last = h[h.length - 1];
  return last && last.who === 'npc' && last.text === view.npcText ? h.slice(0, -1) : h;
}

export type DialogKeyResult =
  { kind: 'choose'; index: number } | { kind: 'close' } | { kind: 'none' };

/** Klawisze 1-9 wybieraja opcje; w trybie 'message' 1 zamyka. Strzalki/Enter obsluguje roving focus + natywny przycisk. */
export function handleDialogDigit(
  key: string,
  shown: ShownOption[],
  mode: DialogView['mode'],
): DialogKeyResult {
  if (!/^[1-9]$/.test(key)) return { kind: 'none' };
  if (mode === 'message') return key === '1' ? { kind: 'close' } : { kind: 'none' };
  const o = shown[Number(key) - 1];
  return o ? { kind: 'choose', index: o.index } : { kind: 'none' };
}
