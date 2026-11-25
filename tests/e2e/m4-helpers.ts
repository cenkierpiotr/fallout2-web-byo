import { expect, type Page } from '@playwright/test';
import { finishCreator, openGame } from './helpers';
import { presetStorage } from './map-helpers';

/** Nowa gra z kreatora na ARTEMPLE (locale pl). */
export async function startNewGame(page: Page): Promise<void> {
  await presetStorage(page, 2);
  await openGame(page);
  await page.getByTestId('tab-play').click();
  await expect(page.getByTestId('main-menu-screen')).toBeVisible();
  await page.getByTestId('menu-new').click();
  await expect(page.getByTestId('creator-screen')).toBeVisible({ timeout: 60_000 });
  await page
    .getByRole('button', { name: /Wybierz postać:/ })
    .first()
    .click();
  await finishCreator(page);
  await expect(page.getByTestId('game-shell')).toBeVisible();
  await expect(page.getByTestId('map-name')).toContainText(/ARTEMPLE/i, { timeout: 90_000 });
}

const SCENERY_PID = 0x2000158; // zwykla dekoracja, przerabiana na zamkniete drzwi
const STIMPAK_PID = 40; // item #40 (Stimpak); typ 0 = przedmiot, wiec pid = indeks

/**
 * ARTEMPLE nie ma drzwi, przedmiotow na ziemi ani kontenerow, wiec scene tworzymy w locie przez
 * `scripts.createObject` (ten sam kod co opkod create_object). Zamkniete drzwi = scenery z
 * `extra.kind='door'` i bitem 0x2 w raw[0] (DOOR_LOCKED_BIT). Zwraca heks drzwi (gracz obok, kamera na nim).
 */
export async function spawnLockedDoor(page: Page): Promise<number> {
  // wolny heks w poblizu gracza: openHexAt bywa -1 w ciasnym starcie ARTEMPLE, wiec kandydaci z przesunieniem siatki
  return page.evaluate(`(() => {
    const g = window.__f2game;
    const w = g.session.world;
    const taken = new Set(g.map.objects.map((o) => o.hex));
    let h = -1;
    for (const off of [-2, 2, -400, 400, -3, 3, -401, 401, -4, 4]) {
      const c = w.player.hex + off;
      if (c > 0 && c < 40000 && !taken.has(c)) { h = c; break; }
    }
    if (h < 0) throw new Error('brak wolnego heksu');
    const id = g.scripts.createObject(${SCENERY_PID}, h, w.player.elevation, 0);
    if (id < 0) throw new Error('createObject zwrocil ' + id);
    const o = g.map.objects.find((q) => q.id === id);
    if (!o) throw new Error('brak spawnowanego obiektu ' + id);
    o.extra = { kind: 'door', subtype: 0, flags: 0, raw: new Int32Array([2, 0, 0, 0, 0, 0, 0, 0, 0, 0]) };
    g.placePlayerNear(h);
    g.centerOn(h);
    return h;
  })()`) as Promise<number>;
}

/** Kladzie na ziemi stimpak i pierwsza bron (podtyp 3) obok gracza; zwraca heksy {stim, weapon, weaponPid}. */
export async function spawnStimpakAndWeapon(
  page: Page,
): Promise<{ stim: number; weapon: number; weaponPid: number }> {
  return page.evaluate(`(async () => {
    const g = window.__f2game;
    const w = g.session.world;
    let weaponPid = -1;
    for (let i = 1; i < 60 && weaponPid < 0; i++) {
      try { const p = await w.loader.protos.get(i); if (p.subtype === 3) weaponPid = i; } catch {}
    }
    await w.loader.protos.get(${STIMPAK_PID});
    const taken = new Set(g.map.objects.map((o) => o.hex));
    const free = [];
    for (const off of [-2, 2, -400, 400, -3, 3, -401, 401, -4, 4]) {
      const h = w.player.hex + off;
      if (h > 0 && h < 40000 && !taken.has(h)) free.push(h);
    }
    if (free.length < 2) throw new Error('brak wolnych heksow');
    const stim = free[0];
    g.scripts.createObject(${STIMPAK_PID}, stim, w.player.elevation, 0);
    const weapon = free[1];
    g.placePlayerNear(stim);
    g.scripts.createObject(weaponPid, weapon, w.player.elevation, 0);
    g.centerOn(stim);
    return { stim, weapon, weaponPid };
  })()`) as Promise<{ stim: number; weapon: number; weaponPid: number }>;
}

/**
 * Otwiera menu kursora w punkcie ekranu: PPM na profilu desktop, dlugi dotyk (CDP) na profilu touch
 * (PointerManager w profilu touch ignoruje zdarzenia myszy, wiec PPM z emulacji mobile nic nie robi).
 */
export async function openCursorMenu(page: Page, x: number, y: number): Promise<void> {
  const touch = await page.evaluate(() => document.documentElement.dataset['profile'] === 'touch');
  if (!touch) {
    await page.mouse.click(x, y, { button: 'right' });
    return;
  }
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y, id: 1 }],
  });
  await page.waitForTimeout(500);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}
