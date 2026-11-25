import { useEffect, useRef, useState } from 'preact/hooks';
import type { DialogState } from '@f2/vm';
import { useUiArt } from '@f2/ui';
import { t } from '../../i18n';
import { handleDialogKey, shownOptions, textOrPlaceholder } from './dialog-model';
import { DialogHistory } from './DialogHistory';
import { OptionCard } from './OptionCard';
import './dialog.css';

/** Okno (ms) po otwarciu rozmowy, w ktorym dotykowy click jest uznawany za duch po tapie na NPC. */
const GHOST_CLICK_MS = 400;

/** Minimalny kontrakt widoku (zgodny z GameView.dialog z engine-core). */
export interface DialogViewLike {
  dialog: { value: DialogState | null; subscribe(fn: (v: DialogState | null) => void): () => void };
}

export interface DialogCommandsLike {
  choose(index: number): unknown;
  close(): unknown;
}

export interface DialogScreenProps {
  view: DialogViewLike;
  commands: DialogCommandsLike;
  profile: 'desktop' | 'touch';
  /** Pokazuje etykiete wymagania IQ przy opcjach (settings.showSkillChecks). */
  showSkillChecks?: boolean;
  /** Kolory reakcji (perk Empathy). */
  showReactions?: boolean;
}

function useDialogState(view: DialogViewLike): DialogState | null {
  const [state, setState] = useState<DialogState | null>(view.dialog.value);
  useEffect(() => view.dialog.subscribe(setState), [view]);
  return state;
}

/** Historia bez biezacej kwestii NPC (ta jest pokazana osobno, duza). */
function pastEntries(state: DialogState): DialogState['history'] {
  const h = state.history;
  const last = h[h.length - 1];
  return last && last.who === 'npc' && last.text === state.npcText ? h.slice(0, -1) : h;
}

/** Ekran dialogu nad canvasem. Nic nie renderuje, gdy nie ma aktywnej rozmowy. */
export function DialogScreen({
  view,
  commands,
  profile,
  showSkillChecks = false,
  showReactions = false,
}: DialogScreenProps) {
  const state = useDialogState(view);
  const [focused, setFocused] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const open = state !== null && state.mode !== 'closed';
  // Moment otwarcia rozmowy (ustawiany w renderze, wiec przed jakimkolwiek zdarzeniem kolejnego klikniecia).
  const openedAtRef = useRef<number | null>(null);
  if (!open) openedAtRef.current = null;
  else if (openedAtRef.current === null) openedAtRef.current = performance.now();
  const textKey = state?.npcText ?? '';

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

  useEffect(() => {
    setFocused(0);
  }, [textKey, state?.options.length]);
  // Fokus na pierwszej opcji (lub przycisku zamkniecia) przy otwarciu i przy kazdej nowej kwestii,
  // dzieki temu Tab/Enter dzialaja od razu, a czytnik ekranu zaczyna od odpowiedzi.
  useEffect(() => {
    const root = rootRef.current;
    if (!open || !root) return;
    const first = root.querySelector<HTMLElement>('.option-card, .dialog-close');
    (first ?? root).focus();
  }, [open, textKey, state?.options.length]);

  if (!state || state.mode === 'closed') return null;
  const shown = shownOptions(state);
  const minHeight = profile === 'touch' ? 48 : 32;

  const buttons = (): HTMLElement[] =>
    Array.from(rootRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? []);

  // Podswietlenie (aria-current) i pozycja strzalek podaza za realnym fokusem (rowniez po Tab).
  const onFocusIn = (e: Event): void => {
    const cards = Array.from(rootRef.current?.querySelectorAll('.option-card') ?? []);
    const pos = cards.indexOf(e.target as Element);
    if (pos >= 0) setFocused(pos);
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    e.stopPropagation();
    // Pulapka fokusu: Tab/Shift+Tab krazy w obrebie dialogu (nie ucieka do HUD pod spodem).
    if (e.key === 'Tab') {
      const list = buttons();
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;
      if (!first || !last) {
        e.preventDefault();
      } else if (e.shiftKey && (active === first || active === rootRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
      return;
    }
    // Enter/spacja na przycisku z fokusem (Tab) to natywny klik w TEN przycisk, nie w opcje ze strzalek.
    if ((e.key === 'Enter' || e.key === ' ') && (e.target as HTMLElement).closest('button')) return;
    const r = handleDialogKey(e.key, shown, focused, state.mode);
    if (r.kind === 'none') return;
    e.preventDefault();
    if (r.kind === 'choose') commands.choose(r.index);
    else if (r.kind === 'close') commands.close();
    else {
      setFocused(r.position);
      rootRef.current?.querySelectorAll<HTMLElement>('.option-card')[r.position]?.focus();
    }
  };
  // Zdarzenia wskaznika nie moga dotrzec do mapy (klik w opcje nie jest marszem).
  const swallow = (e: Event): void => e.stopPropagation();
  // Duch klikniecia: dotkniecie NPC otwiera rozmowe na pointerup, a przegladarka dosyla po nim syntetyczny click
  // w ten sam punkt - trafialby w opcje, ktora wybralaby sie sama. Klikniecia dotykowe tuz po otwarciu sa ignorowane
  // (mysz i klawiatura bez zmian).
  const onClickCapture = (e: Event): void => {
    const at = openedAtRef.current;
    if (at === null || (e as PointerEvent).pointerType !== 'touch') return;
    if (performance.now() - at < GHOST_CLICK_MS) {
      e.stopPropagation();
      e.preventDefault();
    }
  };

  return (
    <div
      class="dialog-overlay"
      data-testid="dialog-screen"
      data-profile={profile}
      data-art={artVars ? '1' : undefined}
      ref={rootRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={t('dialog.title')}
      onKeyDown={onKeyDown}
      onFocusIn={onFocusIn}
      onClickCapture={onClickCapture}
      onPointerDown={swallow}
      onPointerUp={swallow}
      onPointerMove={swallow}
      onMouseDown={swallow}
      onTouchStart={swallow}
      onWheel={swallow}
      onContextMenu={swallow}
    >
      <div
        class="dialog-panel"
        data-art={artVars ? '1' : undefined}
        data-art-done={artVars && doneUp ? '1' : undefined}
        style={artVars ?? undefined}
      >
        <div class="dialog-head">
          <div class="dialog-portrait" aria-hidden="true" data-testid="dialog-portrait">
            {t('dialog.portrait')}
          </div>
          <p class="dialog-npc-text" data-testid="dialog-npc-text" aria-live="polite">
            {textOrPlaceholder(state.npcText)}
          </p>
        </div>
        <DialogHistory entries={pastEntries(state)} />
        {state.mode === 'message' ? (
          <button
            type="button"
            class="dialog-close"
            data-testid="dialog-close"
            style={{ minHeight: `${minHeight}px` }}
            onClick={() => commands.close()}
          >
            {t('dialog.close')}
          </button>
        ) : (
          <ul class="dialog-options" data-testid="dialog-options">
            {shown.map((o, pos) => (
              <OptionCard
                key={o.index}
                option={o}
                current={pos === focused}
                minHeight={minHeight}
                showSkillChecks={showSkillChecks}
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
