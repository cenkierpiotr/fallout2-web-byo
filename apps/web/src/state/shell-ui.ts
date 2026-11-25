import { signal } from '@preact/signals';

/** Czy trwa rozgrywka (ekran `playing`): panel startowy (onboarding, status, zakladki, kopia) jest wtedy zwiniety. */
export const inGame = signal(false);

/** Reczne rozwiniecie panelu startowego w trakcie gry (przycisk w pasku gornym). */
export const startPanelOpen = signal(false);

/** Hosted: dolny panel kopii zapisow jest domyslnie ukryty; rozwijany przyciskiem w pasku gornym. */
export const backupOpen = signal(false);

/** Reaktywny stan pelnego ekranu dokumentu (Fullscreen API). */
export const fullscreen = signal(typeof document !== 'undefined' && document.fullscreenElement !== null);

if (typeof document !== 'undefined') {
  document.addEventListener('fullscreenchange', () => {
    fullscreen.value = document.fullscreenElement !== null;
  });
}

export function toggleDocumentFullscreen(): void {
  if (typeof document === 'undefined') return;
  if (document.fullscreenElement !== null) void document.exitFullscreen().catch(() => undefined);
  else void document.documentElement.requestFullscreen().catch(() => undefined);
}

export function setInGame(v: boolean): void {
  inGame.value = v;
  if (!v) startPanelOpen.value = false;
}

/** Czy panel startowy ma byc ukryty. */
export const startPanelHidden = (): boolean => inGame.value && !startPanelOpen.value;
