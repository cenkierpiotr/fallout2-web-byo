import type { ReadonlySignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { useUiArt } from '../../art/context';
import { t } from '../../i18n';
import { ADVANCE_KEYS } from './EndgameScreen';
import type { ArtUrl, EndgameCommands, EndgameView } from './types';
import './endgame.css';

export interface DeathScreenProps {
  view: ReadonlySignal<EndgameView>;
  commands: Pick<EndgameCommands, 'advance'>;
  artUrl?: ArtUrl;
}

/** Ekran smierci: death.frm, narracja jako napisy (aria-live), dowolny klawisz = dalej. */
export function DeathScreen({ view, commands, artUrl }: DeathScreenProps) {
  const slide = view.value.slide;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (!ADVANCE_KEYS.has(e.key) && e.key.length !== 1) return;
      e.preventDefault();
      commands.advance();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [commands]);

  const managed = useUiArt('menu.death');
  const url = slide ? (artUrl?.(slide.art) ?? managed?.url) : undefined;
  return (
    <section
      class="f2-death"
      role="alertdialog"
      aria-label={t('death.title')}
      aria-describedby="f2-death-caption"
      data-testid="death-screen"
      onClick={() => commands.advance()}
    >
      <div class="f2-death__frame">
        {url ? (
          <img class="f2-death__art" src={url} alt="" data-testid="death-art" />
        ) : (
          <div class="f2-death__art f2-death__art--placeholder" data-testid="death-art" />
        )}
        <h2 class="f2-death__heading">{t('death.title')}</h2>
      </div>
      <p
        id="f2-death-caption"
        class="f2-death__caption"
        aria-live="polite"
        data-testid="death-caption"
      >
        {slide?.text ?? ''}
      </p>
      <p class="f2-death__hint">{t('death.hint')}</p>
    </section>
  );
}
