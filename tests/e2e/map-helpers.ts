import { expect, type Page } from '@playwright/test';
import { openGame } from './helpers';

export interface Game {
  view: {
    player: { value: { hex: number; elevation: number; moving: boolean } };
    currentMap: { value: { name: string; elevation: number } };
    notifications: { value: string[] };
  };
  iso: { x: number; y: number; zoom: number };
  fps: { value: number };
  player: { hex: number };
  commands: { moveTo(hex: number, run?: boolean): unknown } | null;
  openHexAt(dist: number): number;
  blockedHexNear(): number;
  hexToClient(hex: number): { x: number; y: number };
  batch: { count: number };
  stats: {
    buildMs: number;
    submitMs: number;
    sprites: number;
    drawCalls: number;
    uploadedBytes: number;
    fillPixels: number;
  };
}

/** Ustawia locale pl i widoczny licznik FPS (przed goto). */
export async function presetStorage(page: Page, zoom = 2): Promise<void> {
  await page.addInitScript((z) => {
    localStorage.setItem('locale', 'pl');
    localStorage.setItem('f2.game', 'f2');
    localStorage.setItem('f2.persist', '0');
    localStorage.setItem('f2.onboarding', JSON.stringify({ step: 5, done: true, v: 2 }));
    localStorage.setItem('f2-settings', JSON.stringify({ debugOverlay: true, defaultZoom: z }));
  }, zoom);
}

export async function openMapScreen(page: Page): Promise<void> {
  // Przy ponownym imporcie folderu w tym samym kontekscie Chromium bywa trwale zwracac NotFound/NotReadableError
  // dla plikow z setInputFiles (artefakt testu, nie bug aplikacji). Import ponawia openGame (fail-fast na status
  // "Blad"), a blad widoczny juz na ekranie map (map-error) ponawiamy tu jednokrotnie zamiast czekac caly limit.
  for (let attempt = 0; ; attempt++) {
    await openGame(page);
    await page.getByTestId('tab-maps').click();
    const ok = page.getByTestId('map-list');
    const err = page.getByTestId('map-error');
    await expect(ok.or(err)).toBeVisible({ timeout: 60_000 });
    if (await ok.isVisible()) return;
    const msg = await err.innerText();
    if (attempt >= 1) throw new Error(`Ekran map nie wstal dwukrotnie: ${msg}`);
    console.warn(`openMapScreen: ${msg}; ponawiam import`);
  }
}

export async function openMap(page: Page, name: string): Promise<void> {
  await page.getByTestId(`map-item-${name}`).click();
  await page.waitForFunction(
    (n) => {
      const g = (window as unknown as { __f2game?: Game }).__f2game;
      return !!g && g.view.currentMap.value.name === n && g.batch.count > 0;
    },
    name,
    { timeout: 90_000 },
  );
}

export function game<T>(page: Page, fn: (g: Game) => T): Promise<T> {
  return page.evaluate(`(${fn.toString()})(window.__f2game)`) as Promise<T>;
}
