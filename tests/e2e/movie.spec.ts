import { copyFileSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { collectErrors } from './helpers';

const MVE_DIR = process.env['F2_MVE_DIR'];
test.skip(
  !MVE_DIR || !existsSync(join(MVE_DIR, 'afailed.mve')),
  'brak F2_MVE_DIR (filmy MVE nie sa w repo)',
);

interface Dbg {
  frames: number;
  lastIndex: number;
  width: number;
  subtitle: string | null;
  audioChunks: number;
  result: string | null;
}

const debug = (page: Page): Promise<Dbg> =>
  page.evaluate(() => (window as unknown as { __f2movie: { debug(): Dbg } }).__f2movie.debug());

const play = (page: Page, name: string): Promise<string> =>
  page.evaluate(
    (n) =>
      (window as unknown as { __f2movie: { play(n: string): Promise<string> } }).__f2movie.play(n),
    name,
  );

/** Maly podzbior filmow (nie 200 MB z calego folderu) w katalogu tymczasowym (input wymaga katalogu). */
function subset(): string {
  const dir = mkdtempSync(join(tmpdir(), 'f2-movies-'));
  for (const f of ['afailed.mve', 'afailed.sve', 'elder.mve', 'elder.sve', 'elder.cfg']) {
    if (existsSync(join(MVE_DIR!, f))) copyFileSync(join(MVE_DIR!, f), join(dir, f));
  }
  return dir;
}

test.describe('filmy MVE', () => {
  let errors: string[] = [];
  test.beforeEach(async ({ page }) => {
    errors = collectErrors(page);
    await page.addInitScript(() => localStorage.setItem('f2.game', 'f2'));
    await page.goto('/');
    await page.setInputFiles('[data-testid=pick-movies-input]', subset());
    await expect(page.getByTestId('movie-list')).toHaveAttribute('data-count', '2');
  });
  test.afterEach(() => {
    expect(errors, 'bledy konsoli').toEqual([]);
  });

  test('odtwarza film do konca: klatki, audio, ekran znika', async ({ page }) => {
    await page.getByTestId('movie-play-afailed').click();
    await expect(page.getByTestId('movie-screen')).toBeVisible();
    await expect.poll(async () => (await debug(page)).frames).toBeGreaterThan(5);
    const d = await debug(page);
    expect(d.width).toBe(640);
    expect(d.audioChunks).toBeGreaterThan(0);
    // plotno ma niepuste piksele
    const nonBlack = await page.getByTestId('movie-canvas').evaluate((c: HTMLCanvasElement) => {
      const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      for (let i = 0; i < data.length; i += 4)
        if (data[i]! + data[i + 1]! + data[i + 2]! > 30) return true;
      return false;
    });
    expect(nonBlack).toBe(true);
    await expect(page.getByTestId('movie-screen')).toBeHidden({ timeout: 90_000 });
    expect((await debug(page)).result).toBe('finished');
  });

  test('napisy SVE pojawiaja sie i klawisz Esc pomija film', async ({ page }) => {
    await page.getByTestId('movie-play-elder').click();
    await expect(page.getByTestId('movie-subtitle')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('movie-subtitle')).not.toBeEmpty();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('movie-screen')).toBeHidden();
    const d = await debug(page);
    expect(d.result).toBe('skipped');
    expect(d.frames).toBeLessThan(1156);
    // napis znika razem z filmem
    await expect(page.getByTestId('movie-subtitle')).toHaveCount(0);
  });

  test('przycisk Pomin przerywa film', async ({ page }) => {
    await page.getByTestId('movie-play-elder').click();
    await page.getByTestId('movie-skip').click();
    await expect(page.getByTestId('movie-screen')).toBeHidden();
    expect((await debug(page)).result).toBe('skipped');
  });

  test('brak filmu w bibliotece daje wynik missing', async ({ page }) => {
    expect(await play(page, 'intro')).toBe('missing');
    await expect(page.getByTestId('movie-screen')).toBeHidden();
  });
});
