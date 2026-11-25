import { signal, type Signal } from '@preact/signals';
import type { DialogCommands, DialogOptionView, DialogView } from './types';

export interface MockDialog {
  dialog: Signal<DialogView | null>;
  commands: DialogCommands;
  /** Dziennik komend (do asercji w testach). */
  log: string[];
}

const opt = (
  index: number,
  text: string,
  extra: Partial<DialogOptionView> = {},
): DialogOptionView => ({
  index,
  text,
  visible: true,
  iqRequired: 0,
  reaction: 'neutral',
  ...extra,
});

/** Przykladowy wezel startowy (Klint, wzorowany na rozmowie z Arroyo). */
export function sampleDialog(over: Partial<DialogView> = {}): DialogView {
  return {
    npcName: 'Klint',
    npcText: 'Witaj, wedrowcze. Czego szukasz w Arroyo?',
    mode: 'reply',
    canBarter: true,
    options: [
      opt(0, 'Chcialem tylko sie przywitac.'),
      opt(1, 'Przekonam cie, zebys mi pomogl.', {
        skill: { name: 'Retoryka', percent: 65 },
        reaction: 'good',
      }),
      opt(2, 'Znam sie na maszynach.', { iqRequired: 6 }),
      opt(3, 'Opcja ukryta', { visible: false }),
      opt(4, 'Nie mam czasu, zegnaj.', { reaction: 'bad' }),
    ],
    history: [{ who: 'npc', text: 'Witaj, wedrowcze. Czego szukasz w Arroyo?' }],
    ...over,
  };
}

/** Mock `GameView.dialog` + `GameCommands`: wybor opcji przechodzi do kolejnego wezla, ostatnia opcja konczy rozmowe. */
export function createMockDialog(initial: DialogView | null = sampleDialog()): MockDialog {
  const dialog = signal<DialogView | null>(initial);
  const log: string[] = [];
  const commands: DialogCommands = {
    choose(index) {
      log.push(`choose:${index}`);
      const cur = dialog.value;
      if (!cur) return;
      const picked = cur.options.find((o) => o.index === index);
      if (!picked || index === 4) {
        dialog.value = null;
        return;
      }
      const reply = `Odpowiedz ${log.length}: ${picked.text.slice(0, 20)}`;
      dialog.value = {
        ...cur,
        npcText: reply,
        options: [opt(0, 'Rozumiem.'), opt(4, 'Zegnaj.')],
        history: [
          ...cur.history,
          { who: 'player', text: picked.text },
          { who: 'npc', text: reply },
        ],
      };
    },
    close() {
      log.push('close');
      dialog.value = null;
    },
    barter() {
      log.push('barter');
    },
  };
  return { dialog, commands, log };
}
