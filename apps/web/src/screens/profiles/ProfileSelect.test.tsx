// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { MemoryKv, ProfileStore } from '@f2/engine-core';
import { ProfileSelect } from './ProfileSelect';
import {
  activeProfileId,
  initProfiles,
  profileGate,
  profiles,
  setProfileStore,
} from '../../state/profiles';

let n = 0;
beforeEach(async () => {
  n = 0;
  setProfileStore(new ProfileStore(new MemoryKv(), new MemoryKv(), { randomId: () => `p${++n}` }));
  profiles.value = [];
  activeProfileId.value = null;
  profileGate.value = false;
  localStorage.clear();
});
afterEach(cleanup);

describe('ProfileSelect', () => {
  it('start: pierwszy profil tworzony automatycznie, bez bramki', async () => {
    await initProfiles('Gracz');
    expect(profiles.value.map((p) => p.name)).toEqual(['Gracz']);
    expect(profileGate.value).toBe(false);
  });

  it('dodaje profil, wybiera go i usuwa po potwierdzeniu', async () => {
    await initProfiles('Gracz');
    profileGate.value = true;
    render(<ProfileSelect />);
    fireEvent.click(screen.getByTestId('profile-add'));
    fireEvent.input(screen.getByTestId('profile-add-name'), { target: { value: 'Ola' } });
    fireEvent.click(screen.getByTestId('profile-add-ok'));
    await waitFor(() => expect(profileGate.value).toBe(false));
    expect(profiles.value.map((p) => p.name).sort()).toEqual(['Gracz', 'Ola']);

    profileGate.value = true;
    cleanup();
    render(<ProfileSelect />);
    const cards = screen.getAllByTestId('profile-card');
    expect(cards.length).toBe(2);
    const ola = cards.find((c) => c.textContent?.includes('Ola'))!;
    fireEvent.click(ola.querySelector('[data-testid="profile-delete"]')!);
    expect(screen.getByTestId('profile-delete-confirm')).toBeTruthy();
    expect(profiles.value.length).toBe(2); // jeszcze nie usuniety
    fireEvent.click(screen.getByTestId('profile-delete-yes'));
    await waitFor(() => expect(profiles.value.map((p) => p.name)).toEqual(['Gracz']));
  });

  it('profil z PIN-em: zly PIN odrzucony, dobry wpuszcza', async () => {
    await initProfiles('Gracz');
    const store = (await import('../../state/profiles')).getProfileStore();
    const p = await store.create({ name: 'Tata', pin: '1234' });
    await (await import('../../state/profiles')).refreshProfiles();
    profileGate.value = true;
    render(<ProfileSelect />);
    const card = screen.getAllByTestId('profile-card').find((c) => c.dataset['profile'] === p.id)!;
    fireEvent.click(card.querySelector('[data-testid="profile-choose"]')!);
    fireEvent.input(screen.getByTestId('profile-pin-input'), { target: { value: '0000' } });
    fireEvent.click(screen.getByTestId('profile-pin-ok'));
    await waitFor(() => expect(screen.getByTestId('profile-msg')).toBeTruthy());
    expect(activeProfileId.value).not.toBe(p.id);
    fireEvent.input(screen.getByTestId('profile-pin-input'), { target: { value: '1234' } });
    fireEvent.click(screen.getByTestId('profile-pin-ok'));
    await waitFor(() => expect(activeProfileId.value).toBe(p.id));
  });
});
