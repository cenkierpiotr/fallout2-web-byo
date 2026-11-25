import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { GAME_DIR, collectErrors, finishCreator, openGame } from './helpers';
import { game } from './map-helpers';

test.use({ actionTimeout: 30_000 });
test.skip(!GAME_DIR, 'brak F2_GAME_DIR (testy tylko lokalnie, pliki gry nie sa w repo)');

interface SessionLike {
  state: { sheet: { hp: number } };
  world: { player: { hex: number } };
  view: { saves: { value: { slot: string; thumbnail: string | null }[] } };
  save(slot: string): Promise<{ ok: boolean }>;
  quickSave(): Promise<{ ok: boolean }>;
  refreshSaves(): Promise<void>;
}

const card = (page: Page, name: string) =>
  page.locator('[data-testid=profile-card]').filter({ hasText: name });

/** Nic nie moze wychodzic poza szerokosc ekranu (poziomy scroll strony lub element poza viewportem). */
async function expectNoOverflow(page: Page, sel: string): Promise<void> {
  const r = await page.evaluate((s) => {
    const vw = document.documentElement.clientWidth;
    const bad: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(`${s}, ${s} *`)) {
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) continue;
      if (b.right > vw + 1 || b.left < -1)
        bad.push(
          `${el.tagName}.${el.className} ${Math.round(b.left)}..${Math.round(b.right)} > ${vw}`,
        );
    }
    return { bad: bad.slice(0, 5), scroll: document.documentElement.scrollWidth, vw };
  }, sel);
  expect(r.bad, 'elementy poza ekranem').toEqual([]);
  expect(r.scroll, 'poziomy scroll strony').toBeLessThanOrEqual(r.vw + 1);
}

async function shot(
  page: Page,
  testInfo: { project: { name: string } },
  name: string,
): Promise<void> {
  await page.screenshot({ path: `test-results/profiles/${testInfo.project.name}-${name}.png` });
}

async function openSwitcher(page: Page): Promise<void> {
  // modal zapisow przykrywa naglowek: zamknij Escape
  if (await page.locator('.f2-modal__backdrop').isVisible()) await page.keyboard.press('Escape');
  await expect(page.locator('.f2-modal__backdrop')).toHaveCount(0);
  await page.getByTestId('profile-switch').click();
  await expect(page.getByTestId('profile-select')).toBeVisible();
}

async function addProfile(page: Page, name: string, pin?: string): Promise<void> {
  await page.getByTestId('profile-add').click();
  await page.getByTestId('profile-add-name').fill(name);
  if (pin) await page.getByTestId('profile-add-pin').fill(pin);
  await page.getByTestId('profile-add-ok').click();
  await expect(page.getByTestId('profile-select')).toHaveCount(0);
  await expect(page.getByTestId('profile-switch')).toContainText(name);
}

async function chooseProfile(page: Page, name: string, pin?: string): Promise<void> {
  await card(page, name).getByTestId('profile-choose').click();
  if (pin !== undefined) {
    await page.getByTestId('profile-pin-input').fill(pin);
    await page.getByTestId('profile-pin-ok').click();
  }
}

async function startNewGame(page: Page): Promise<void> {
  await page.getByTestId('tab-play').click();
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

/** Menu glowne -> lista zapisow aktywnego profilu (po przeladowaniu/przelaczeniu). */
async function openMenuSaves(page: Page): Promise<void> {
  // menu glowne (pelnoekranowe) przykrywa zakladki: klikamy Graj tylko gdy jeszcze go nie widac
  if (!(await page.getByTestId('main-menu-screen').isVisible()))
    await page.getByTestId('tab-play').click();
  await expect(page.getByTestId('main-menu-screen')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('menu-load').click();
  await expect(page.getByTestId('saves-screen')).toBeVisible();
}

const filledSlots = (page: Page) => page.locator('[data-testid=save-card][data-empty=false]');

test('profile graczy: wybor, PIN, izolacja zapisow, autozapis, eksport/import, usuwanie', async ({
  page,
}, testInfo) => {
  test.setTimeout(900_000);
  const errors = collectErrors(page);
  // przyspieszany zegar (autozapis co 5 min) i jezyk PL
  await page.addInitScript(() => {
    localStorage.setItem('locale', 'pl');
    const real = Date.now.bind(Date);
    Object.defineProperty(window, '__shift', { value: { ms: 0 }, writable: true });
    Date.now = () => real() + (window as unknown as { __shift: { ms: number } }).__shift.ms;
  });
  const mobile = testInfo.project.name.endsWith('mobile');

  // 1. start: tylko profil domyslny, wchodzi bez ekranu wyboru
  await openGame(page);
  await expect(page.getByTestId('profile-select')).toHaveCount(0);

  // 2. ekran wyboru + tworzenie dwoch profili
  await openSwitcher(page);
  await expect(page.getByTestId('profile-card')).toHaveCount(1);
  await shot(page, testInfo, '1-select-one');
  await addProfile(page, 'Alfa');
  await openSwitcher(page);
  await expect(page.getByTestId('profile-card')).toHaveCount(2);
  // duplikat nazwy (bez wzgledu na wielkosc liter) odrzucony
  await page.getByTestId('profile-add').click();
  await page.getByTestId('profile-add-name').fill('alfa');
  await page.getByTestId('profile-add-ok').click();
  await expect(page.getByTestId('profile-msg')).toBeVisible();
  await shot(page, testInfo, '2-add-form-error');
  if (mobile) await expectNoOverflow(page, '[data-testid=profile-select]');
  await page.getByTestId('profile-add-name').fill('Beta');
  await page.getByTestId('profile-add-pin').fill('1234');
  await page.getByTestId('profile-add-ok').click();
  await expect(page.getByTestId('profile-switch')).toContainText('Beta');

  // 3. gra w Becie: zapis reczny, quicksave, miniatura
  await startNewGame(page);
  const hp = await game(
    page,
    (g) => (g as unknown as { session: SessionLike }).session.state.sheet.hp,
  );
  expect(
    await game(page, (g) => (g as unknown as { session: SessionLike }).session.save('manual-0')),
  ).toMatchObject({ ok: true });
  expect(
    await game(page, (g) => (g as unknown as { session: SessionLike }).session.quickSave()),
  ).toMatchObject({ ok: true });
  const metas = await game(page, async (g) => {
    const s = (g as unknown as { session: SessionLike }).session;
    await s.refreshSaves();
    return s.view.saves.value.map((m) => ({
      slot: m.slot,
      thumb: (m.thumbnail ?? '').slice(0, 15),
    }));
  });
  expect(metas.map((m) => m.slot)).toEqual(expect.arrayContaining(['manual-0', 'quick']));
  for (const m of metas.filter((x) => x.slot === 'manual-0'))
    expect(m.thumb).toBe('data:image/jpeg');

  // 4. autozapis okresowy: przesuniecie zegara o 6 min -> slot auto-N + wskaznik
  await game(page, (g) => g.iso.zoom);
  await page.waitForTimeout(1500); // timer ustawia pierwszy deadline na biezacym ticku
  await page.evaluate(
    () => ((window as unknown as { __shift: { ms: number } }).__shift.ms += 6 * 60_000),
  );
  await expect
    .poll(
      () =>
        game(page, async (g) => {
          const s = (g as unknown as { session: SessionLike }).session;
          await s.refreshSaves();
          return s.view.saves.value.some((m) => m.slot.startsWith('auto-'));
        }),
      { timeout: 30_000 },
    )
    .toBe(true);
  await expect(page.getByTestId('autosave-indicator')).toBeVisible();
  await shot(page, testInfo, '3-ingame-header');
  if (mobile) await expectNoOverflow(page, '.topbar');

  // 5. przelaczenie na Alfe: zapisy Bety niewidoczne
  await openSwitcher(page);
  await shot(page, testInfo, '4-select-two');
  if (mobile) await expectNoOverflow(page, '[data-testid=profile-select]');
  await chooseProfile(page, 'Alfa');
  await expect(page.getByTestId('profile-switch')).toContainText('Alfa');
  await openMenuSaves(page);
  await expect(filledSlots(page)).toHaveCount(0);
  await shot(page, testInfo, '5-alfa-empty-saves');

  // 6. Beta: zly PIN, potem dobry
  await openSwitcher(page);
  await chooseProfile(page, 'Beta', '0000');
  await expect(page.getByTestId('profile-msg')).toBeVisible();
  await expect(page.getByTestId('profile-select')).toBeVisible();
  await shot(page, testInfo, '6-wrong-pin');
  if (mobile) await expectNoOverflow(page, '[data-testid=profile-select]');
  await page.getByTestId('profile-pin-input').fill('1234');
  await page.getByTestId('profile-pin-ok').click();
  await expect(page.getByTestId('profile-select')).toHaveCount(0);
  await expect(page.getByTestId('profile-switch')).toContainText('Beta');

  // 7. przeladowanie strony (prawdziwy IndexedDB): bramka wyboru, Beta z PIN-em, wczytanie zapisu
  await page.reload();
  await expect(page.getByTestId('profile-select')).toBeVisible({ timeout: 60_000 });
  await expect(card(page, 'Beta').getByText('🔒')).toBeVisible();
  await chooseProfile(page, 'Beta', '1234');
  await expect(page.getByTestId('profile-select')).toHaveCount(0);
  await expect(page.getByTestId('status-text')).toContainText('30266', { timeout: 90_000 });
  await openMenuSaves(page);
  const manual = page.locator('[data-testid=save-card][data-slot="manual-0"]');
  await expect(manual).toHaveAttribute('data-empty', 'false');
  await expect(manual.locator('[data-testid=save-thumb] img')).toBeVisible();
  await expect(page.locator('[data-testid=save-card][data-slot="quick"]')).toHaveAttribute(
    'data-empty',
    'false',
  );
  await expect(filledSlots(page).first()).toBeVisible();
  await shot(page, testInfo, '7-beta-saves-after-reload');
  if (mobile) await expectNoOverflow(page, '[data-testid=saves-screen]');
  await manual.getByRole('button', { name: /^Wczytaj/ }).click();
  await expect(page.getByTestId('game-shell')).toBeVisible();
  await expect(page.getByTestId('map-name')).toContainText(/ARTEMPLE/i, { timeout: 90_000 });
  await expect
    .poll(
      () => game(page, (g) => (g as unknown as { session: SessionLike }).session.state.sheet.hp),
      { timeout: 30_000 },
    )
    .toBe(hp);

  // 8. eksport Bety i import jako nowy profil
  await openSwitcher(page);
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    card(page, 'Beta').getByTestId('profile-export').click(),
  ]);
  expect(dl.suggestedFilename()).toMatch(/\.f2profile$/);
  const exported = await dl.path();
  expect(readFileSync(exported).length).toBeGreaterThan(100);
  const bytes = readFileSync(exported);
  const idsBefore = await page
    .locator('[data-testid=profile-card]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-profile')));
  await page
    .getByTestId('profile-import')
    .setInputFiles({ name: 'beta.f2profile', mimeType: 'application/octet-stream', buffer: bytes });
  await expect(page.getByTestId('profile-card')).toHaveCount(4, { timeout: 30_000 });
  await expect(page.getByTestId('profile-msg')).toBeVisible();
  await shot(page, testInfo, '8-imported');
  if (mobile) await expectNoOverflow(page, '[data-testid=profile-select]');
  // uszkodzony plik
  await page.getByTestId('profile-import').setInputFiles({
    name: 'zly.f2profile',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('nie profil'),
  });
  await expect(page.getByTestId('profile-msg')).toBeVisible();
  await expect(page.getByTestId('profile-card')).toHaveCount(4);
  // zaimportowany profil (nowa nazwa, bez PIN-u) ma zapisy
  const idsAfter = await page
    .locator('[data-testid=profile-card]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-profile')));
  const newId = idsAfter.find((i) => !idsBefore.includes(i))!;
  const imported = page.locator(`[data-testid=profile-card][data-profile="${newId}"]`);
  await imported.getByTestId('profile-choose').click();
  await expect(page.getByTestId('profile-select')).toHaveCount(0);
  await openMenuSaves(page);
  await expect(page.locator('[data-testid=save-card][data-slot="manual-0"]')).toHaveAttribute(
    'data-empty',
    'false',
  );

  // 9. usuwanie z potwierdzeniem
  await openSwitcher(page);
  await card(page, 'Alfa').getByTestId('profile-delete').click();
  await expect(page.getByTestId('profile-delete-confirm')).toBeVisible();
  await shot(page, testInfo, '9-delete-confirm');
  if (mobile) await expectNoOverflow(page, '[data-testid=profile-select]');
  await page.getByTestId('profile-delete-confirm').getByRole('button', { name: 'Anuluj' }).click();
  await expect(page.getByTestId('profile-card')).toHaveCount(4);
  await card(page, 'Alfa').getByTestId('profile-delete').click();
  await page.getByTestId('profile-delete-yes').click();
  await expect(page.getByTestId('profile-card')).toHaveCount(3);
  await expect(card(page, 'Alfa')).toHaveCount(0);

  expect(errors.filter((e) => !/favicon|WebGL|GPU|GroupMarker/i.test(e))).toEqual([]);
});
