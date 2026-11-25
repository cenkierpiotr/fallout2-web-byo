import { existsSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { GAME_DIR, collectErrors } from './helpers';
import { game, openMap, openMapScreen, presetStorage } from './map-helpers';

test.skip(!GAME_DIR, 'brak F2_GAME_DIR (testy tylko lokalnie, pliki gry nie sa w repo)');

const KLINT_SID = 0x4000001;

// Z pakietem PL (F2_LANG_PACK_DIR, poza repo) dialogi w locale 'pl' sa po polsku (msg 123 acklint.msg).
const PACK_PL = !!process.env['F2_LANG_PACK_DIR'] && existsSync(process.env['F2_LANG_PACK_DIR']);

test.describe('dialog z Klintem (ARTEMPLE)', () => {
  for (const locale of ['pl', 'en'] as const) {
    test(`rozmowa, wybor opcji, zakonczenie (${locale})`, async ({ page }, info) => {
      test.setTimeout(240_000);
      const errors = collectErrors(page);
      await presetStorage(page, 1);
      await page.addInitScript((l) => localStorage.setItem('locale', l), locale);
      await openMapScreen(page);
      await openMap(page, 'ARTEMPLE');

      // gracz stoi obok Klinta (marsz do swiatyni to osobny test), widok wysrodkowany na nim
      await game(page, (g) => {
        const k = (g as unknown as { objectByScript(s: number): { hex: number } }).objectByScript(
          0x4000001,
        );
        (g as unknown as { placePlayerNear(h: number): boolean }).placePlayerNear(k.hex);
      });
      await game(page, (g) => {
        const k = (g as unknown as { objectByScript(s: number): { hex: number } }).objectByScript(
          0x4000001,
        );
        (g as unknown as { centerOn(h: number): void }).centerOn(k.hex);
      });
      const pt = await game(page, (g) => {
        const k = (g as unknown as { objectByScript(s: number): { hex: number } }).objectByScript(
          0x4000001,
        );
        return g.hexToClient(k.hex);
      });
      expect(KLINT_SID).toBe(0x4000001);
      if (info.project.name === 'mobile') await page.touchscreen.tap(pt.x, pt.y);
      else await page.mouse.click(pt.x, pt.y);

      const screen = page.getByTestId('dialog-screen');
      await expect(screen).toBeVisible({ timeout: 15_000 });
      const npcText = page.getByTestId('dialog-npc-text');
      await expect(npcText).not.toHaveText('');
      const first = (await npcText.textContent()) ?? '';
      expect(first).not.toMatch(/^\[MSG/);

      // dostepnosc: 0 bledow krytycznych
      const axe = await new AxeBuilder({ page }).include('[data-testid=dialog-screen]').analyze();
      expect(axe.violations.filter((v) => v.impact === 'critical')).toEqual([]);

      // cele dotyku na mobile >= 48 px
      const options = page.locator('[data-testid^=dialog-option-]');
      expect(await options.count()).toBeGreaterThan(0);
      if (info.project.name === 'mobile') {
        for (const b of await options.all()) {
          const box = await b.boundingBox();
          expect(box!.height).toBeGreaterThanOrEqual(47.5);
        }
      }

      // Klint na starcie gry: "Me say hi" (IQ<4) jest ukryta, widoczna jest jedna opcja (msg 123).
      // Opcja 107 ("I have some questions for you.") zalezy od stanu zmiennych gry i na starcie jej nie ma.
      expect(await options.filter({ hasText: 'Me say hi. That all.' }).count()).toBe(0);
      const helloText =
        locale === 'pl' && PACK_PL
          ? 'Po prostu chciałem się przywitać'
          : "Just thought I'd say hello.";
      const hello = options.filter({ hasText: helloText });
      await expect(hello).toHaveCount(1);
      if (info.project.name === 'mobile') await hello.tap();
      else await hello.click();

      // odpowiedz NPC: tryb 'message' z przyciskiem Zamknij, historia zawiera wybor gracza
      await expect(npcText).not.toHaveText(first, { timeout: 15_000 });
      await expect(page.getByTestId('dialog-history')).toContainText(helloText);
      const close = page.getByTestId('dialog-close');
      await expect(close).toBeVisible();
      await expect(close).toHaveText(locale === 'pl' ? 'Zamknij' : 'Close');
      if (info.project.name === 'mobile') {
        expect((await close.boundingBox())!.height).toBeGreaterThanOrEqual(47.5);
      }
      if (info.project.name === 'mobile') await close.tap();
      else await close.click();
      await expect(screen).toBeHidden({ timeout: 15_000 });

      // klik w opcje nie wywolal marszu (zdarzenia dialogu nie docieraja do mapy)
      expect(await game(page, (g) => g.view.player.value.moving)).toBe(false);
      expect(errors.filter((e) => !/WebGL|swiftshader|GPU/i.test(e))).toEqual([]);
    });
  }
});
