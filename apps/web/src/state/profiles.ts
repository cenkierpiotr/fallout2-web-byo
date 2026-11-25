import { effect, signal } from '@preact/signals';
import {
  IndexedDbKv,
  ProfileStore,
  LEGACY_PROFILE_ID,
  type ActivateResult,
  type ProfileSummary,
  type SaveStore,
} from '@f2/engine-core';
import { locale, setLocale } from '../i18n';
import { setProfileOverrides } from '../settings';

/** Stabilne id urzadzenia (autor zmian w metadanych sync); lokalne, bez wartosci osobowych. */
export function deviceId(): string {
  try {
    let id = localStorage.getItem('f2-device-id');
    if (!id) {
      id = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) =>
        b.toString(16).padStart(2, '0'),
      ).join('');
      localStorage.setItem('f2-device-id', id);
    }
    return id;
  } catch {
    return 'local';
  }
}

let store: ProfileStore | null = null;
/** Magazyn profili (IndexedDB: `f2-profiles` rekordy, `f2-saves` zapisy). Tworzony leniwie. */
export function getProfileStore(): ProfileStore {
  store ??= new ProfileStore(new IndexedDbKv('f2-profiles'), new IndexedDbKv('f2-saves'), {
    deviceId: deviceId(),
  });
  return store;
}
/** Dla testow: podmiana magazynu. */
export function setProfileStore(s: ProfileStore | null): void {
  store = s;
}

export const profiles = signal<ProfileSummary[]>([]);
export const activeProfileId = signal<string | null>(null);
export const profilesReady = signal(false);
/** Czy pokazac ekran wyboru profilu (start przy >1 profilu, albo reczna zmiana z menu). */
export const profileGate = signal(false);

export async function refreshProfiles(): Promise<void> {
  profiles.value = await getProfileStore().list();
}

async function applyActive(id: string): Promise<void> {
  const ps = getProfileStore();
  activeProfileId.value = id;
  const o = await ps.getSettings(id);
  setProfileOverrides(o, (patch) => {
    void ps.patchSettings(id, patch).catch(() => undefined);
  });
  if (o['locale'] === 'pl' || o['locale'] === 'en') setLocale(o['locale']);
}

/** Start aplikacji: tworzy domyslny profil (zapisy sprzed profili), przywraca aktywny, ustala bramke wyboru. */
export async function initProfiles(defaultName: string): Promise<void> {
  const ps = getProfileStore();
  try {
    await ps.ensureDefault(defaultName);
    await refreshProfiles();
    const active = await ps.getActiveId();
    const list = profiles.value;
    if (list.length > 1 || !active) {
      profileGate.value = list.length > 0 && (list.length > 1 || !active);
      // jeden profil bez PIN-u i bez aktywnego: wchodzimy od razu
      const only = list[0];
      if (list.length === 1 && only && !only.hasPin) {
        await ps.activate(only.id);
        await applyActive(only.id);
        profileGate.value = false;
      }
    } else if (active) {
      await applyActive(active);
    }
  } catch (e) {
    console.error('profile', e);
  } finally {
    profilesReady.value = true;
  }
}

/** Wybor profilu z ekranu (PIN gdy ustawiony). Zwraca wynik aktywacji. */
export async function selectProfile(id: string, pin?: string): Promise<ActivateResult> {
  const r = await getProfileStore().activate(id, pin);
  if (r === 'ok') {
    await applyActive(id);
    await refreshProfiles();
    profileGate.value = false;
  }
  return r;
}

/** Zmiana profilu z menu: wraca do ekranu wyboru. */
export function openProfileSwitcher(): void {
  void refreshProfiles();
  profileGate.value = true;
}

/** Magazyn zapisow aktywnego profilu (bez profilu: przestrzen legacy). */
export function activeSaveStore(): SaveStore {
  return getProfileStore().saveStore(activeProfileId.value ?? LEGACY_PROFILE_ID);
}

/** Po usunieciu profilu: jesli byl aktywny, bramka wyboru. */
export async function afterProfileRemoved(id: string): Promise<void> {
  await refreshProfiles();
  if (activeProfileId.value === id) {
    activeProfileId.value = null;
    setProfileOverrides(null);
    profileGate.value = true;
  }
}

// Jezyk interfejsu zapamietywany per profil.
effect(() => {
  const l = locale.value;
  const id = activeProfileId.peek();
  if (id && store) void store.patchSettings(id, { locale: l }).catch(() => undefined);
});
