import type { ReadonlySignal } from '@preact/signals';
import type { CSSProperties } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Button, Modal, Panel, useToast } from '../../components';
import { ArtAt, ArtStage, ExtrasPanel, useLayoutMode, useUiArt } from '../../art';
import { t } from '../../i18n';
import { SaveCard, slotTitle } from './SaveCard';
import type { SaveResult, SavesCommands, SavesView } from './types';
import './saves.css';

export interface SavesScreenProps {
  view: ReadonlySignal<SavesView>;
  commands: SavesCommands;
  /** Wywolywane po udanym wczytaniu (zamkniecie ekranu w aplikacji). */
  onLoaded?: (slotId: string) => void;
  /** Tryb menu glownego (bez zywej gry): tylko wczytywanie i usuwanie, bez zapisu, importu i eksportu. */
  loadOnly?: boolean;
}

type Confirm = { kind: 'overwrite' | 'delete'; id: string } | null;

/* Layout oryginalnego ekranu zapisu (lsgame.frm 640x480; fallout1-ce loadsave.cc):
 * tytul u gory, lista slotow po lewej, podglad i pole informacji po prawej. */
const ART_TITLE = { x: 48, y: 21, w: 260, h: 26 };
const ART_LIST = { x: 55, y: 87, w: 230, h: 353 };
const ART_PREVIEW = { x: 366, y: 58, w: 224, h: 133 };
const ART_INFO = { x: 396, y: 254, w: 164, h: 60 };

/** Ekran zapisow: lista slotow, zapis/wczytanie/usuniecie/eksport/import, F5/F8, strzalki, dotyk. */
export function SavesScreen({ view, commands, onLoaded, loadOnly = false }: SavesScreenProps) {
  const toast = useToast();
  const slots = view.value.slots;
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bg = useUiArt('save.bg');
  const mode = useLayoutMode();

  const report = (r: SaveResult, okKey: string, params?: Record<string, string>) => {
    if (r.ok) toast.show(t(okKey, params), 'ok');
    else toast.show(t(`saves.error.${r.code}`), 'danger');
    return r.ok;
  };

  const run = async (
    fn: () => Promise<SaveResult>,
    okKey: string,
    params?: Record<string, string>,
  ) => {
    setBusy(true);
    try {
      return report(await fn(), okKey, params);
    } finally {
      setBusy(false);
    }
  };

  const slotName = (id: string) => {
    const s = slots.find((x) => x.id === id);
    return s ? slotTitle(s) : id;
  };

  const doSave = (id: string) =>
    run(() => commands.save(id), 'saves.toast.saved', { slot: slotName(id) });
  const requestSave = (id: string) => {
    const s = slots.find((x) => x.id === id);
    if (!s) return;
    if (s.empty || s.kind === 'quick') void doSave(id);
    else setConfirm({ kind: 'overwrite', id });
  };
  const doLoad = async (id: string) => {
    if (await run(() => commands.load(id), 'saves.toast.loaded', { slot: slotName(id) }))
      onLoaded?.(id);
  };

  // F5: szybki zapis, F8: szybkie wczytanie
  const latest = useRef({ busy, confirm, slots, doSave, doLoad });
  latest.current = { busy, confirm, slots, doSave, doLoad };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { busy, confirm, slots, doSave, doLoad } = latest.current;
      if (e.ctrlKey || e.metaKey || e.altKey || confirm) return;
      if (e.key === 'F5') {
        e.preventDefault();
        if (!busy && !loadOnly) void doSave('quick');
      } else if (e.key === 'F8') {
        e.preventDefault();
        if (busy) return;
        const q = slots.find((s) => s.id === 'quick');
        if (q && !q.empty) void doLoad('quick');
        else toast.show(t('saves.error.save-no-quick'), 'warning');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const moveTo = (i: number) => {
    const next = Math.max(0, Math.min(slots.length - 1, i));
    setActive(next);
    listRef.current?.querySelectorAll<HTMLElement>('[data-testid=save-card]')[next]?.focus();
  };

  const onListKey = (e: KeyboardEvent) => {
    // tylko gdy fokus na samej karcie (nie na przyciskach w srodku)
    const card = (e.target as HTMLElement).closest<HTMLElement>('[data-testid=save-card]');
    if (!card || e.target !== card) return;
    const i = slots.findIndex((s) => s.id === card.dataset['slot']);
    const slot = slots[i];
    if (!slot) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveTo(i + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveTo(i - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      moveTo(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      moveTo(slots.length - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (!slot.empty) void doLoad(slot.id);
      else if (slot.kind !== 'auto' && !loadOnly) requestSave(slot.id);
    } else if (e.key === 'Delete' && !slot.empty) {
      e.preventDefault();
      setConfirm({ kind: 'delete', id: slot.id });
    }
  };

  const onImport = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) await run(() => commands.importFile(file), 'saves.toast.imported');
  };

  const confirmed = async () => {
    const c = confirm;
    setConfirm(null);
    if (!c) return;
    if (c.kind === 'overwrite') await doSave(c.id);
    else await run(() => commands.remove(c.id), 'saves.toast.deleted', { slot: slotName(c.id) });
  };

  /** Lista slotow: testidy, sterowanie klawiatura i akcje identyczne w kazdym trybie. */
  const slotList = (art: boolean, artTouch: boolean) => (
    <ul
      ref={listRef}
      class={`f2-saves__list${art ? ' f2-saves__list--art' : ''}`}
      aria-label={t('saves.title')}
      data-testid="saves-list"
      onKeyDown={onListKey}
    >
      {slots.map((slot, i) => (
        <SaveCard
          key={slot.id}
          slot={slot}
          active={i === active}
          busy={busy}
          loadOnly={loadOnly}
          art={art}
          artTouch={artTouch}
          exportInCard={!art}
          onFocusCard={() => setActive(i)}
          onSave={() => (setActive(i), requestSave(slot.id))}
          onLoad={() => void doLoad(slot.id)}
          onDelete={() => setConfirm({ kind: 'delete', id: slot.id })}
          onExport={() =>
            void run(() => commands.exportSlot(slot.id), 'saves.toast.exported', {
              slot: slotTitle(slot),
            })
          }
        />
      ))}
    </ul>
  );

  const confirmModal = (
    <Modal
      open={confirm !== null}
      title={
        confirm?.kind === 'delete'
          ? t('saves.confirm.deleteTitle')
          : t('saves.confirm.overwriteTitle')
      }
      onClose={() => setConfirm(null)}
    >
      <p data-testid="saves-confirm-text">
        {confirm
          ? t(confirm.kind === 'delete' ? 'saves.confirm.delete' : 'saves.confirm.overwrite', {
              slot: slotName(confirm.id),
            })
          : ''}
      </p>
      <div class="f2-saves__confirm-actions">
        <Button variant="secondary" onPress={() => setConfirm(null)}>
          {t('saves.confirm.cancel')}
        </Button>
        <Button
          variant={confirm?.kind === 'delete' ? 'danger' : 'primary'}
          onPress={() => void confirmed()}
        >
          {confirm?.kind === 'delete' ? t('saves.action.delete') : t('saves.confirm.overwriteYes')}
        </Button>
      </div>
    </Modal>
  );

  /* Skorka FRM (grafika wczytana): oryginalny uklad ekranu zapisu na tle lsgame.frm.
   * Import/eksport/podpowiedzi klawiszowe to nasze dodatki bez odpowiednika w oryginale,
   * więc zgodnie z planem trafiaja do panelu dodatkow (ExtrasPanel) pod scena. */
  if (bg) {
    const touch = mode === 'touch';
    const activeSlot = slots[active];
    const touchStyle: CSSProperties | undefined = touch
      ? { minWidth: '44px', minHeight: '44px' }
      : undefined;
    const exportTargets = loadOnly ? [] : slots.filter((s) => !s.empty);

    return (
      <div data-testid="saves-screen" class="f2-saves f2-saves__root f2-saves__root--art">
        <h2 class="f2-saves__sr-title">{t('saves.title')}</h2>
        <div class="f2-saves__scene">
          <ArtStage background="save.bg" minTouch={touch}>
            <ArtAt {...ART_TITLE}>
              <p class="f2-saves__title-art">{t('saves.title')}</p>
            </ArtAt>
            {!touch && (
              <ArtAt {...ART_LIST}>
                <div class="f2-saves__list-scroll">{slotList(true, false)}</div>
              </ArtAt>
            )}
            {!touch && activeSlot && !activeSlot.empty && (
              <ArtAt {...ART_PREVIEW}>
                {activeSlot.thumbnail ? (
                  <img
                    data-testid="save-preview"
                    class="f2-saves__preview-img"
                    src={activeSlot.thumbnail}
                    alt=""
                  />
                ) : (
                  <div data-testid="save-preview" class="f2-saves__preview-empty" />
                )}
              </ArtAt>
            )}
            {!touch && (
              <ArtAt {...ART_INFO}>
                {activeSlot && !activeSlot.empty ? (
                  <p class="f2-saves__info-art">
                    <span data-testid="save-preview-name">{activeSlot.name}</span>
                    {typeof activeSlot.level === 'number' && (
                      <>
                        {' · '}
                        {t('saves.meta.level')} {activeSlot.level}
                      </>
                    )}
                    {activeSlot.location && (
                      <>
                        {' · '}
                        {activeSlot.location}
                      </>
                    )}
                  </p>
                ) : (
                  <p class="f2-saves__info-art f2-saves__info-art--empty">
                    {activeSlot && <strong>{slotTitle(activeSlot)}</strong>}
                    <br />
                    {t('saves.empty')}
                  </p>
                )}
              </ArtAt>
            )}
          </ArtStage>
        </div>
        {touch && (
          /* Dotyk: lista pod scena (jak w handlu), tlo lsgame zostaje w pelni widoczne. */
          <div class="f2-saves__touch-list">{slotList(true, true)}</div>
        )}
        {!loadOnly && (
          <ExtrasPanel title={t('saves.extras')}>
            <div class="f2-saves__extras-row">
              <button
                type="button"
                class="f2-button f2-button--secondary f2-button--sm"
                disabled={busy}
                style={touchStyle}
                onClick={() => fileRef.current?.click()}
              >
                {t('saves.action.import')}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".json,.f2save,application/json"
                hidden
                aria-label={t('saves.action.import')}
                data-testid="saves-import-input"
                onChange={(e) => void onImport(e)}
              />
              <span class="f2-saves__hint">{t('saves.hint.hotkeys')}</span>
            </div>
            {exportTargets.length > 0 && (
              <div class="f2-saves__extras-exports">
                {exportTargets.map((slot) => (
                  <button
                    key={slot.id}
                    type="button"
                    class="f2-button f2-button--secondary f2-button--sm"
                    disabled={busy}
                    style={touchStyle}
                    aria-label={t('saves.action.exportFrom', { slot: slotTitle(slot) })}
                    onClick={() =>
                      void run(() => commands.exportSlot(slot.id), 'saves.toast.exported', {
                        slot: slotTitle(slot),
                      })
                    }
                  >
                    {t('saves.action.export')} · {slotTitle(slot)}
                  </button>
                ))}
              </div>
            )}
          </ExtrasPanel>
        )}
        {confirmModal}
      </div>
    );
  }

  return (
    <Panel title={t('saves.title')} class="f2-saves">
      <div data-testid="saves-screen" class="f2-saves__root">
        {!loadOnly && (
          <div class="f2-saves__toolbar">
            <Button variant="secondary" disabled={busy} onPress={() => fileRef.current?.click()}>
              {t('saves.action.import')}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,.f2save,application/json"
              hidden
              aria-label={t('saves.action.import')}
              data-testid="saves-import-input"
              onChange={(e) => void onImport(e)}
            />
            <span class="f2-saves__hint">{t('saves.hint.hotkeys')}</span>
          </div>
        )}
        <ul
          ref={listRef}
          class="f2-saves__list"
          aria-label={t('saves.title')}
          data-testid="saves-list"
          onKeyDown={onListKey}
        >
          {slots.map((slot, i) => (
            <SaveCard
              key={slot.id}
              slot={slot}
              active={i === active}
              busy={busy}
              loadOnly={loadOnly}
              onFocusCard={() => setActive(i)}
              onSave={() => (setActive(i), requestSave(slot.id))}
              onLoad={() => void doLoad(slot.id)}
              onDelete={() => setConfirm({ kind: 'delete', id: slot.id })}
              onExport={() =>
                void run(() => commands.exportSlot(slot.id), 'saves.toast.exported', {
                  slot: slotTitle(slot),
                })
              }
            />
          ))}
        </ul>
      </div>
      {confirmModal}
    </Panel>
  );
}
