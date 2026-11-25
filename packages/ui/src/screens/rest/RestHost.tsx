import type { ReadonlySignal } from '@preact/signals';
import { useEffect, useState } from 'preact/hooks';
import { IconButton, Modal } from '../../components';
import { t } from '../../i18n';
import { Clock } from './Clock';
import { RestScreen } from './RestScreen';
import type { ClockView, RestCommands, RestView } from './types';

export interface RestHostProps {
  view: ReadonlySignal<RestView>;
  clock: ReadonlySignal<ClockView>;
  commands: RestCommands;
  /** Klawisz otwierania (KeyboardEvent.code); domyslnie R. */
  hotkey?: string;
}

function isTyping(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}

/** Zegar w HUD + przycisk i skrot otwierajacy okno odpoczynku (Esc zamyka). */
export function RestHost({ view, clock, commands, hotkey = 'KeyR' }: RestHostProps) {
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

  const close = () => {
    setOpen(false);
    commands.close();
  };

  return (
    <>
      <Clock clock={clock} />
      <span data-testid="hud-rest">
        <IconButton
          icon="end-turn"
          label={t('rest.open')}
          onPress={() => setOpen(true)}
          size="lg"
        />
      </span>
      <Modal open={open} title={t('rest.title')} onClose={close} artBackground="rest.bg">
        <RestScreen view={view} commands={{ rest: commands.rest, close }} />
      </Modal>
    </>
  );
}
