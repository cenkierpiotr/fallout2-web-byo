import type { ReadonlySignal } from '@preact/signals';
import { useEffect, useState } from 'preact/hooks';
import { IconButton, Modal } from '../../components';
import { t } from '../../i18n';
import { PipboyScreen } from './PipboyScreen';
import type { PipboyCommands, PipboyView } from './types';

export interface PipboyHostProps {
  view: ReadonlySignal<PipboyView>;
  /** Klawisz otwierania (KeyboardEvent.code); domyslnie P. */
  hotkey?: string;
  commands?: PipboyCommands;
}

function isTyping(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}

/** Przycisk HUD + skrot klawiszowy otwierajacy Pip-Boya w oknie modalnym (Esc zamyka). */
export function PipboyHost({ view, hotkey = 'KeyP', commands }: PipboyHostProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== hotkey || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      e.preventDefault();
      setOpen((o) => !o);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hotkey]);

  return (
    <>
      <span data-testid="hud-pipboy">
        <IconButton
          icon="pipboy"
          label={t('pipboy.open')}
          onPress={() => setOpen(true)}
          size="lg"
        />
      </span>
      <Modal open={open} title={t('pipboy.title')} onClose={() => setOpen(false)}
        artBackground="pip.bg"
      >
        <PipboyScreen view={view} {...(commands ? { commands } : {})} />
      </Modal>
    </>
  );
}
