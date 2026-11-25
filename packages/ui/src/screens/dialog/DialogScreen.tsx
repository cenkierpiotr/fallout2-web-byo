import { useEffect, useRef, useState } from 'preact/hooks';
import { focusables } from '../../hooks';
import { useRovingFocus } from '../../a11y/useRovingFocus';
import { t } from '../../i18n';
import { useUiArt } from '../../art';
import { DialogHistory } from './DialogHistory';
import { OptionCard } from './OptionCard';
import { handleDialogDigit, pastEntries, shownOptions, textOrPlaceholder } from './model';
import type { DialogCommands, DialogSignalLike } from './types';
import './dialog.css';

const SWALLOWED = ['pointerdown', 'pointerup', 'pointermove', 'mousedown', 'wheel', 'contextmenu'];

export interface DialogScreenProps {
  view: { dialog: DialogSignalLike };
  commands: DialogCommands;
  profile: 'desktop' | 'touch';
  /** settings.showSkillCheckPercent: procent szansy przy opcjach z testem umiejetnosci. */
  showSkillCheckPercent?: boolean;
  /** Kolory reakcji (perk Empathy). */
  showReactions?: boolean;
}

/** Ekran dialogu nad canvasem. Nic nie renderuje, gdy nie ma aktywnej rozmowy. */
export function DialogScreen({
  view,
  commands,
  profile,
  showSkillCheckPercent = false,
  showReactions = false,
}: DialogScreenProps) {
  const state = view.dialog.value;
  const [reviewOpen, setReviewOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const open = state !== null;
  const nodeKey = state
    ? `${state.npcText}|${state.options.map((o) => o.index).join(',')}|${state.mode}`
    : '';

  // Skorka FRM: podokno rozmowy di_talk (wariant party: di_talkp) rysowane nad mapa jak w oryginale.
  // Oba hooki wywolane bezwarunkowo (zasady hookow): wybor grafiki nastepuje po odczycie.
  const subwinMain = useUiArt('dlg.subwin');
  const subwinParty = useUiArt('dlg.subwin.party');
  const hi = useUiArt('dlg.hi.top');
  const doneUp = useUiArt('dlg.done.up');
  const doneDn = useUiArt('dlg.done.dn');
  const subwin = subwinMain ?? subwinParty;
  // Brak podokna = brak danych gry => fallback 1:1 (zadne zmienne CSS nie trafiaja do DOM).
  const artVars = subwin
    ? {
        '--f2-dlg-bg': `url(${subwin.url})`,
        ...(hi ? { '--f2-dlg-hi': `url(${hi.url})` } : {}),
        ...(doneUp
          ? {
              '--f2-dlg-done': `url(${doneUp.url})`,
              ...(doneDn ? { '--f2-dlg-done-dn': `url(${doneDn.url})` } : {}),
              '--f2-dlg-done-ratio': String(doneUp.width / doneUp.height),
            }
          : {}),
      }
    : null;

  useRovingFocus(listRef, '[data-testid=dialog-option]', { orientation: 'vertical' });

  // Fokus na pierwszej opcji po zmianie wezla (i przy otwarciu).
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !open) return;
    const first = root.querySelector<HTMLElement>(
      '[data-testid=dialog-option], [data-testid=dialog-close]',
    );
    first?.focus();
  }, [nodeKey, open]);

  // Zdarzenia wskaznika nie moga dotrzec do mapy (klik w opcje nie jest marszem).
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const swallow = (e: Event): void => e.stopPropagation();
    for (const type of SWALLOWED) root.addEventListener(type, swallow);
    return () => {
      for (const type of SWALLOWED) root.removeEventListener(type, swallow);
    };
  }, [open]);

  if (!state) return null;
  const shown = shownOptions(state, showSkillCheckPercent);

  const onKeyDown = (e: KeyboardEvent): void => {
    e.stopPropagation();
    if (e.key === 'Tab') {
      // pulapka fokusu: Tab krazy wewnatrz dialogu
      const root = rootRef.current;
      if (!root) return;
      const f = focusables(root);
      if (f.length === 0) return;
      const first = f[0]!;
      const last = f[f.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
      return;
    }
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const r = handleDialogDigit(e.key, shown, state.mode);
    if (r.kind === 'choose') {
      e.preventDefault();
      commands.choose(r.index);
    } else if (r.kind === 'close') {
      e.preventDefault();
      commands.close();
    }
  };

  return (
    <div
      class="f2-dialog"
      data-testid="dialog-screen"
      data-profile={profile}
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={t('dialog.title', { name: state.npcName })}
      onKeyDown={onKeyDown}
    >
      <div
        class="f2-dialog__panel"
        data-art={artVars ? '1' : undefined}
        data-art-done={artVars && doneUp ? '1' : undefined}
        style={artVars ?? undefined}
      >
        <div class="f2-dialog__head">
          <div
            class="f2-dialog__portrait"
            role="img"
            aria-label={t('dialog.portrait', { name: state.npcName })}
            data-testid="dialog-portrait"
          >
            <span aria-hidden="true">{state.npcName.slice(0, 1)}</span>
          </div>
          <div class="f2-dialog__speech">
            <h2 class="f2-dialog__name">{state.npcName}</h2>
            <p
              class="f2-dialog__npc-text"
              data-testid="dialog-npc-text"
              aria-live="polite"
              aria-atomic="true"
            >
              {textOrPlaceholder(state.npcText)}
            </p>
          </div>
        </div>
        <DialogHistory
          entries={reviewOpen ? state.history : pastEntries(state)}
          expanded={reviewOpen}
        />
        <div class="f2-dialog__tools">
          <button
            type="button"
            class="f2-dialog__tool"
            data-testid="dialog-review"
            aria-expanded={reviewOpen}
            onClick={() => setReviewOpen((v) => !v)}
          >
            {t('dialog.review')}
          </button>
          {state.canBarter && (
            <button
              type="button"
              class="f2-dialog__tool"
              data-testid="dialog-barter"
              onClick={() => commands.barter()}
            >
              {t('dialog.barter')}
            </button>
          )}
        </div>
        {state.mode === 'message' ? (
          <button
            type="button"
            class="f2-dialog__close"
            data-testid="dialog-close"
            onClick={() => commands.close()}
          >
            {t('dialog.close')}
          </button>
        ) : (
          <ul
            class="f2-dialog__options"
            ref={listRef}
            data-testid="dialog-options"
            aria-label={t('dialog.options')}
          >
            {shown.map((o) => (
              <OptionCard
                key={o.index}
                option={o}
                showReaction={showReactions}
                onChoose={(i) => commands.choose(i)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
