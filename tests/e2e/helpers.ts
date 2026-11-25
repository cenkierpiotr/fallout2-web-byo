import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, type Page } from '@playwright/test';

export const GAME_DIR = process.env['F2_GAME_DIR'];

/** Zbiera bledy konsoli i wyjatki strony; wywolaj wcesnie (przed goto). */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

/**
 * Wskazuje folder gry przez input webkitdirectory i czeka na koniec indeksowania (30266 wpisow dla pelnego folderu; brief podawal 23120).
 * Fail-fast: gdy status zaczyna sie od "Blad"/"Error" (np. sporadyczny NotFoundError z setInputFiles), nie czekamy
 * calego limitu, tylko ponawiamy import raz (swiezy goto + nowe obiekty File).
 */
export async function openGame(page: Page): Promise<void> {
  if (!GAME_DIR) throw new Error('Brak F2_GAME_DIR');
  const timeout = Number(process.env['F2_OPEN_TIMEOUT'] ?? 240_000);
  for (let attempt = 0; ; attempt++) {
    await page.goto('/');
    await page.setInputFiles('[data-testid=pick-folder-input]', GAME_DIR);
    const status = page.getByTestId('status-text');
    const handle = await page.waitForFunction(
      () => {
        const t = document.querySelector('[data-testid=status-text]')?.textContent ?? '';
        if (t.includes('Zaindeksowano') || t.includes('30266') || t.includes('40377')) return 'ok';
        return /^(Błąd|Blad|Error)/.test(t.trim()) ? 'error' : false;
      },
      undefined,
      { timeout, polling: 250 },
    );
    const outcome = (await handle.jsonValue()) as 'ok' | 'error';
    if (outcome === 'ok') return;
    const msg = await status.innerText();
    if (attempt >= 1) throw new Error(`Import gry nie powiodl sie dwukrotnie: ${msg}`);
    console.warn(`openGame: ${msg}; ponawiam import`);
    // porzucamy dokument (zwolnienie referencji do File) i chwila oddechu przed swiezym importem
    await page.goto('about:blank');
    await page.waitForTimeout(3000);
  }
}

/** Katalog tymczasowy z pustym master.dat (bez critter.dat). */
export function makeBrokenGameDir(): string {
  const root = mkdtempSync(join(tmpdir(), 'f2-broken-'));
  writeFileSync(join(root, 'master.dat'), '');
  return root;
}

export interface F2Debug {
  frameIndex: number;
  fps: number;
  spriteCount: number;
  lastFrameMs: number;
  frameDeltaMs: number;
}

export async function debugState(page: Page): Promise<F2Debug> {
  return page.evaluate(() => (window as unknown as { __f2debug: F2Debug }).__f2debug);
}

/** Konczy kreator: na profilu touch przechodzi kroki przyciskiem "Dalej" do podsumowania, potem klika "Zakoncz i zacznij gre". */
export async function finishCreator(page: Page): Promise<void> {
  const creator = page.getByTestId('creator-screen');
  const finish = page.getByRole('button', { name: 'Zakończ i zacznij grę' });
  const next = creator.getByRole('button', { name: 'Dalej' });
  for (let i = 0; i < 5 && !(await finish.isVisible()); i++) {
    await next.click();
  }
  await expect(finish).toBeEnabled();
  await finish.click();
}
