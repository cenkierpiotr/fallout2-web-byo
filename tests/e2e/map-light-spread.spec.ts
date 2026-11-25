import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { GAME_DIR, collectErrors } from './helpers';
import { game, openMap, openMapScreen, presetStorage } from './map-helpers';

test.skip(!GAME_DIR, 'brak F2_GAME_DIR (testy tylko lokalnie, pliki gry nie sa w repo)');

interface Dbg {
  centerOn(hex: number): void;
  lighting: {
    setSources(on: boolean): void;
    setAmbient(v: number | undefined): void;
    litHexes(): number;
    tileLight(t: number): number;
  };
}

/** Mapy z lampami/ogniem (poziom 0) i hex zrodla swiatla do wycentrowania widoku. */
const CASES = [
  { map: 'ARCAVES', hex: 11304 },
  { map: 'VCTYCOCL', hex: 12502 },
];
/** Katalog zrzutow poza repo (opcjonalnie): F2_LIGHT_SHOTS=/tmp/f2light. */
const SHOTS = process.env['F2_LIGHT_SHOTS'];

test.describe('swiatlo zrodel (f2_obj_light_apply) w renderze', () => {
  for (const c of CASES) {
    test(`${c.map}: zrodla rozjasniaja kafle w nocy`, async ({ page }) => {
      test.setTimeout(240_000);
      const errors = collectErrors(page);
      await presetStorage(page, 2);
      await openMapScreen(page);
      await openMap(page, c.map);
      if (SHOTS) mkdirSync(SHOTS, { recursive: true });

      const lit = await game(page, (g) => (g as unknown as Dbg).lighting.litHexes());
      expect(lit).toBeGreaterThan(0);

      await game(page, (g) => {
        const d = g as unknown as Dbg;
        d.lighting.setAmbient(0.25);
        d.lighting.setSources(false);
      });
      await page.evaluate(
        (h) => (window as unknown as { __f2game: Dbg }).__f2game.centerOn(h),
        c.hex,
      );
      await page.waitForTimeout(1200);
      const before = await page.screenshot(SHOTS ? { path: `${SHOTS}/${c.map}-before.png` } : {});

      await game(page, (g) => (g as unknown as Dbg).lighting.setSources(true));
      await page.waitForTimeout(1200);
      const after = await page.screenshot(SHOTS ? { path: `${SHOTS}/${c.map}-after.png` } : {});

      expect(Buffer.compare(before, after)).not.toBe(0);
      if (SHOTS) writeFileSync(`${SHOTS}/${c.map}-lit-hexes.txt`, String(lit));
      expect(errors.filter((e) => !/favicon/i.test(e))).toEqual([]);
    });
  }
});
