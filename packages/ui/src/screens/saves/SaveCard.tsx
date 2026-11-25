import type { CSSProperties } from 'preact';
import { Button } from '../../components';
import { formatGameDate, locale, t } from '../../i18n';
import type { SaveSlotView } from './types';

export interface SaveCardProps {
  slot: SaveSlotView;
  /** Roving tabindex: tylko aktywna karta jest w kolejnosci Tab. */
  active: boolean;
  busy: boolean;
  /** Menu glowne: bez przyciskow zapisu i eksportu. */
  loadOnly?: boolean;
  /** Skorka FRM: karta kompaktowa wewnatrz sceny grafiki. */
  art?: boolean;
  /** Skorka FRM: min. cele dotykowe 44px na przyciskach. */
  artTouch?: boolean;
  /** Czy przycisk eksportu zostaje w karcie (w skorce FRM przenosimy go do panelu dodatkow). */
  exportInCard?: boolean;
  onFocusCard: () => void;
  onSave: () => void;
  onLoad: () => void;
  onDelete: () => void;
  onExport: () => void;
}

/** "2 h 05 min" / "5 min" z milisekund. */
export function formatPlayTime(ms: number): string {
  const min = Math.floor(ms / 60_000);
  const h = Math.floor(min / 60);
  return h > 0 ? `${h} h ${String(min % 60).padStart(2, '0')} min` : `${min} min`;
}

function formatRealDate(ms: number): string {
  const tag = locale.value === 'pl' ? 'pl-PL' : 'en-US';
  return new Intl.DateTimeFormat(tag, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(ms));
}

/** Tytul karty: nazwa slotu wg rodzaju. */
export function slotTitle(slot: SaveSlotView): string {
  if (slot.kind === 'auto') {
    const m = /^auto-(\d+)$/.exec(slot.id);
    return m ? t('saves.slot.autoN', { n: Number(m[1]) + 1 }) : t('saves.slot.auto');
  }
  if (slot.kind === 'quick') return t('saves.slot.quick');
  const n = Number(slot.id.replace(/\D/g, '')) + 1;
  return t('saves.slot.manual', { n });
}

/** Przycisk w trybie skorki FRM (natywny, min 44px przy dotyku). */
function ArtCardButton(props: {
  variant: 'primary' | 'secondary' | 'danger';
  label: string;
  disabled: boolean;
  touch: boolean;
  onPress: () => void;
}) {
  const style: CSSProperties | undefined = props.touch
    ? { minWidth: '44px', minHeight: '44px' }
    : undefined;
  return (
    <button
      type="button"
      class={`f2-button f2-button--${props.variant} f2-button--sm f2-save-card__btn-art`}
      disabled={props.disabled}
      aria-label={props.label}
      style={style}
      onClick={props.onPress}
    >
      {props.label}
    </button>
  );
}

export function SaveCard({
  slot,
  active,
  busy,
  loadOnly = false,
  art = false,
  artTouch = false,
  exportInCard = true,
  onFocusCard,
  onSave,
  onLoad,
  onDelete,
  onExport,
}: SaveCardProps) {
  const titleId = `f2-save-title-${slot.id}`;
  const canSave = slot.kind !== 'auto' && !loadOnly;
  const showExport = !loadOnly && exportInCard;

  if (art) {
    // Warianta kompaktowa na scenie FRM: krotki wiersz + przyciski pod spodem.
    return (
      <li class="f2-saves__item">
        <div
          class={`f2-save-card f2-save-card--art${slot.empty ? ' f2-save-card--empty' : ''}`}
          role="group"
          aria-labelledby={titleId}
          tabIndex={active ? 0 : -1}
          data-testid="save-card"
          data-slot={slot.id}
          data-empty={String(slot.empty)}
          onFocus={(e) => {
            if (e.target === e.currentTarget) onFocusCard();
          }}
        >
          <div class="f2-save-card__row">
            <div class="f2-save-card__thumb" data-testid="save-thumb">
              {!slot.empty && slot.thumbnail ? (
                <img src={slot.thumbnail} alt="" loading="lazy" />
              ) : (
                <span class="f2-save-card__noimg" aria-hidden="true">
                  {slot.empty ? '' : '?'}
                </span>
              )}
            </div>
            <div class="f2-save-card__info">
              <h3 id={titleId} class="f2-save-card__title">
                {slotTitle(slot)}
              </h3>
              {slot.empty ? (
                <p class="f2-save-card__empty">{t('saves.empty')}</p>
              ) : (
                <p class="f2-save-card__summary">
                  <span data-testid="save-name">{slot.name}</span>
                  {typeof slot.level === 'number' && (
                    <>
                      {' · '}
                      {t('saves.meta.level')} {slot.level}
                    </>
                  )}
                  {slot.location && (
                    <>
                      {' · '}
                      {slot.location}
                    </>
                  )}
                </p>
              )}
            </div>
          </div>
          <div class="f2-save-card__actions">
            {canSave && (
              <ArtCardButton
                variant="primary"
                label={t('saves.action.saveIn', { slot: slotTitle(slot) })}
                disabled={busy}
                touch={artTouch}
                onPress={onSave}
              />
            )}
            <ArtCardButton
              variant="secondary"
              label={t('saves.action.loadFrom', { slot: slotTitle(slot) })}
              disabled={busy || slot.empty}
              touch={artTouch}
              onPress={onLoad}
            />
            <ArtCardButton
              variant="danger"
              label={t('saves.action.deleteFrom', { slot: slotTitle(slot) })}
              disabled={busy || slot.empty}
              touch={artTouch}
              onPress={onDelete}
            />
          </div>
        </div>
      </li>
    );
  }

  return (
    <li class="f2-saves__item">
      <div
        class={`f2-save-card${slot.empty ? ' f2-save-card--empty' : ''}`}
        role="group"
        aria-labelledby={titleId}
        tabIndex={active ? 0 : -1}
        data-testid="save-card"
        data-slot={slot.id}
        data-empty={String(slot.empty)}
        onFocus={(e) => {
          if (e.target === e.currentTarget) onFocusCard();
        }}
      >
        <div class="f2-save-card__thumb" data-testid="save-thumb">
          {!slot.empty && slot.thumbnail ? (
            <img src={slot.thumbnail} alt="" loading="lazy" />
          ) : (
            <span class="f2-save-card__noimg" aria-hidden="true">
              {slot.empty ? '' : '?'}
            </span>
          )}
        </div>
        <div class="f2-save-card__info">
          <h3 id={titleId} class="f2-save-card__title">
            {slotTitle(slot)}
          </h3>
          {slot.empty ? (
            <p class="f2-save-card__empty">{t('saves.empty')}</p>
          ) : (
            <dl class="f2-save-card__meta">
              <dt>{t('saves.meta.character')}</dt>
              <dd data-testid="save-name">{slot.name}</dd>
              <dt>{t('saves.meta.level')}</dt>
              <dd>{slot.level}</dd>
              <dt>{t('saves.meta.location')}</dt>
              <dd>{slot.location}</dd>
              {slot.gameTime && (
                <>
                  <dt>{t('saves.meta.gameTime')}</dt>
                  <dd>{formatGameDate(slot.gameTime)}</dd>
                </>
              )}
              {slot.playTimeMs !== undefined && (
                <>
                  <dt>{t('saves.meta.playTime')}</dt>
                  <dd>{formatPlayTime(slot.playTimeMs)}</dd>
                </>
              )}
              {slot.savedAt !== undefined && (
                <>
                  <dt>{t('saves.meta.savedAt')}</dt>
                  <dd>{formatRealDate(slot.savedAt)}</dd>
                </>
              )}
            </dl>
          )}
        </div>
        <div class="f2-save-card__actions">
          {canSave && (
            <Button
              variant="primary"
              disabled={busy}
              onPress={onSave}
              aria-label={t('saves.action.saveIn', { slot: slotTitle(slot) })}
            >
              {t('saves.action.save')}
            </Button>
          )}
          <Button
            variant="secondary"
            disabled={busy || slot.empty}
            onPress={onLoad}
            aria-label={t('saves.action.loadFrom', { slot: slotTitle(slot) })}
          >
            {t('saves.action.load')}
          </Button>
          {showExport && (
            <Button
              variant="secondary"
              disabled={busy || slot.empty}
              onPress={onExport}
              aria-label={t('saves.action.exportFrom', { slot: slotTitle(slot) })}
            >
              {t('saves.action.export')}
            </Button>
          )}
          <Button
            variant="danger"
            disabled={busy || slot.empty}
            onPress={onDelete}
            aria-label={t('saves.action.deleteFrom', { slot: slotTitle(slot) })}
          >
            {t('saves.action.delete')}
          </Button>
        </div>
      </div>
    </li>
  );
}
