import { useState } from 'preact/hooks';
import {
  MAX_PROFILE_NAME,
  PROFILE_COLORS,
  ProfileError,
  exportProfile,
  importProfile,
  profileFileName,
  validPin,
  type ProfileSummary,
} from '@f2/engine-core';
import { t } from '../../i18n';
import { downloadBlob } from '../../state/backup';
import {
  activeProfileId,
  afterProfileRemoved,
  getProfileStore,
  profileGate,
  profiles,
  refreshProfiles,
  selectProfile,
} from '../../state/profiles';

type Mode =
  | { kind: 'idle' }
  | { kind: 'pin'; id: string }
  | { kind: 'rename'; id: string }
  | { kind: 'setpin'; id: string }
  | { kind: 'delete'; id: string }
  | { kind: 'add' };

const errKey = (e: unknown): string =>
  e instanceof ProfileError ? `profiles.error.${e.code}` : 'profiles.error.failed';

function Avatar({ p }: { p: ProfileSummary }) {
  return (
    <span class="profile-avatar" style={{ background: p.color }} aria-hidden="true">
      {p.avatar || p.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Ekran wyboru/zarzadzania lokalnymi profilami (mysz, klawiatura, dotyk). PIN to blokada przed przypadkowym wejsciem. */
export function ProfileSelect() {
  const [mode, setMode] = useState<Mode>({ kind: 'idle' });
  const [text, setText] = useState('');
  const [pin, setPin] = useState('');
  const [color, setColor] = useState<string>(PROFILE_COLORS[0]);
  const [msg, setMsg] = useState<string | null>(null);
  const store = getProfileStore();
  const list = profiles.value;
  const canClose = activeProfileId.value !== null;

  const reset = (): void => {
    setMode({ kind: 'idle' });
    setText('');
    setPin('');
    setMsg(null);
  };
  const fail = (e: unknown): void => setMsg(t(errKey(e)));
  const run = async (fn: () => Promise<void>): Promise<void> => {
    try {
      await fn();
      await refreshProfiles();
    } catch (e) {
      fail(e);
    }
  };

  const choose = async (p: ProfileSummary, pinValue?: string): Promise<void> => {
    if (p.hasPin && pinValue === undefined) {
      setMode({ kind: 'pin', id: p.id });
      return;
    }
    const r = await selectProfile(p.id, pinValue);
    if (r === 'pin-wrong') setMsg(t('profiles.error.pin-wrong'));
    else if (r !== 'ok') setMsg(t('profiles.error.failed'));
  };

  return (
    <section class="profiles" data-testid="profile-select" aria-label={t('profiles.title')}>
      <h2>{t('profiles.title')}</h2>
      <p class="muted">{t('profiles.hint')}</p>
      {msg && (
        <p class="status error" role="alert" data-testid="profile-msg">
          {msg}
        </p>
      )}
      <ul class="profiles__list">
        {list.map((p) => (
          <li key={p.id} class="profile-card" data-testid="profile-card" data-profile={p.id}>
            <button
              type="button"
              class="profile-card__main"
              data-testid="profile-choose"
              aria-current={activeProfileId.value === p.id ? 'true' : undefined}
              onClick={() => void choose(p)}
            >
              <Avatar p={p} />
              <span class="profile-card__name">
                {p.name} {p.hasPin && <span aria-label={t('profiles.locked')}>🔒</span>}
              </span>
              <span class="muted profile-card__last">
                {t('profiles.lastPlayed', { date: new Date(p.lastPlayedAt).toLocaleDateString() })}
              </span>
            </button>
            <span class="profile-card__actions">
              <button
                type="button"
                data-testid="profile-rename"
                onClick={() => (setText(p.name), setMode({ kind: 'rename', id: p.id }))}
              >
                {t('profiles.rename')}
              </button>
              <button
                type="button"
                data-testid="profile-pin"
                onClick={() => (setPin(''), setMode({ kind: 'setpin', id: p.id }))}
              >
                {t('profiles.pin')}
              </button>
              <button
                type="button"
                data-testid="profile-export"
                onClick={() =>
                  void run(async () => {
                    downloadBlob(await exportProfile(store, p.id), profileFileName(p.name));
                  })
                }
              >
                {t('profiles.export')}
              </button>
              <button
                type="button"
                class="danger"
                data-testid="profile-delete"
                onClick={() => setMode({ kind: 'delete', id: p.id })}
              >
                {t('profiles.delete')}
              </button>
            </span>
            {mode.kind === 'pin' && mode.id === p.id && (
              <form
                class="profile-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void choose(p, pin);
                }}
              >
                <label>
                  {t('profiles.pin.enter')}
                  <input
                    type="password"
                    inputMode="numeric"
                    autoFocus
                    data-testid="profile-pin-input"
                    value={pin}
                    onInput={(e) => setPin(e.currentTarget.value)}
                  />
                </label>
                <button type="submit" data-testid="profile-pin-ok">
                  {t('profiles.ok')}
                </button>
                <button type="button" onClick={reset}>
                  {t('profiles.cancel')}
                </button>
              </form>
            )}
            {mode.kind === 'rename' && mode.id === p.id && (
              <form
                class="profile-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    await store.rename(p.id, text);
                    reset();
                  });
                }}
              >
                <input
                  type="text"
                  maxLength={MAX_PROFILE_NAME}
                  autoFocus
                  data-testid="profile-rename-input"
                  value={text}
                  onInput={(e) => setText(e.currentTarget.value)}
                />
                <button type="submit" data-testid="profile-rename-ok">
                  {t('profiles.ok')}
                </button>
                <button type="button" onClick={reset}>
                  {t('profiles.cancel')}
                </button>
              </form>
            )}
            {mode.kind === 'setpin' && mode.id === p.id && (
              <form
                class="profile-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    const next = pin === '' ? null : pin;
                    if (next !== null && !validPin(next)) throw new ProfileError('pin-invalid');
                    await store.setPin(p.id, next, text);
                    reset();
                  });
                }}
              >
                {p.hasPin && (
                  <label>
                    {t('profiles.pin.current')}
                    <input
                      type="password"
                      inputMode="numeric"
                      data-testid="profile-pin-current"
                      value={text}
                      onInput={(e) => setText(e.currentTarget.value)}
                    />
                  </label>
                )}
                <label>
                  {t('profiles.pin.new')}
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={8}
                    data-testid="profile-pin-new"
                    value={pin}
                    onInput={(e) => setPin(e.currentTarget.value)}
                  />
                </label>
                <p class="muted">{t('profiles.pin.note')}</p>
                <button type="submit" data-testid="profile-setpin-ok">
                  {t('profiles.ok')}
                </button>
                <button type="button" onClick={reset}>
                  {t('profiles.cancel')}
                </button>
              </form>
            )}
            {mode.kind === 'delete' && mode.id === p.id && (
              <div
                class="profile-form"
                role="alertdialog"
                aria-label={t('profiles.delete.title')}
                data-testid="profile-delete-confirm"
              >
                <p>{t('profiles.delete.confirm', { name: p.name })}</p>
                <button
                  type="button"
                  class="danger"
                  data-testid="profile-delete-yes"
                  onClick={() =>
                    void run(async () => {
                      await store.remove(p.id);
                      await afterProfileRemoved(p.id);
                      reset();
                    })
                  }
                >
                  {t('profiles.delete.yes')}
                </button>
                <button type="button" autoFocus onClick={reset}>
                  {t('profiles.cancel')}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {mode.kind === 'add' ? (
        <form
          class="profile-form"
          data-testid="profile-add-form"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const created = await store.create({ name: text, color, ...(pin ? { pin } : {}) });
              reset();
              await refreshProfiles();
              await selectProfile(created.id, pin || undefined);
            });
          }}
        >
          <label>
            {t('profiles.name')}
            <input
              type="text"
              maxLength={MAX_PROFILE_NAME}
              autoFocus
              data-testid="profile-add-name"
              value={text}
              onInput={(e) => setText(e.currentTarget.value)}
            />
          </label>
          <fieldset class="profile-colors">
            <legend>{t('profiles.color')}</legend>
            {PROFILE_COLORS.map((c) => (
              <label key={c} class="profile-color" style={{ background: c }}>
                <input
                  type="radio"
                  name="profile-color"
                  checked={color === c}
                  onChange={() => setColor(c)}
                  aria-label={c}
                />
              </label>
            ))}
          </fieldset>
          <label>
            {t('profiles.pin.optional')}
            <input
              type="password"
              inputMode="numeric"
              maxLength={8}
              data-testid="profile-add-pin"
              value={pin}
              onInput={(e) => setPin(e.currentTarget.value)}
            />
          </label>
          <button type="submit" data-testid="profile-add-ok">
            {t('profiles.create')}
          </button>
          <button type="button" onClick={reset}>
            {t('profiles.cancel')}
          </button>
        </form>
      ) : (
        <p class="profiles__footer">
          <button
            type="button"
            data-testid="profile-add"
            onClick={() => (reset(), setMode({ kind: 'add' }))}
          >
            {t('profiles.add')}
          </button>
          <label class="file-button">
            {t('profiles.import')}
            <input
              type="file"
              accept=".f2profile"
              data-testid="profile-import"
              onChange={(e) => {
                const input = e.currentTarget;
                const f = input.files?.[0];
                input.value = '';
                if (!f) return;
                void run(async () => {
                  const r = await importProfile(f, store);
                  setMsg(
                    r.ok
                      ? t('profiles.imported', { name: r.name, n: r.imported })
                      : t('profiles.error.corrupt'),
                  );
                });
              }}
            />
          </label>
          {canClose && (
            <button
              type="button"
              data-testid="profile-close"
              onClick={() => (profileGate.value = false)}
            >
              {t('profiles.close')}
            </button>
          )}
        </p>
      )}
    </section>
  );
}
