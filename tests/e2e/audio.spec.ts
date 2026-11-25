import { expect, test } from '@playwright/test';
import { GAME_DIR, collectErrors, openGame } from './helpers';

test.skip(!GAME_DIR, 'brak F2_GAME_DIR (testy tylko lokalnie, pliki gry nie sa w repo)');

interface AudioDbg {
  system: { mixer: { getVolume(ch: string): number } };
  rvfs: { has(p: string): boolean; keys(p: string): string[] };
  dialog: { mouth: { value: number }; speaking: { value: boolean }; durationMs: { value: number } };
  music: { current: { value: string | null }; error: { value: string | null } };
}

test.describe('audio: lokalne odtwarzanie ACM z master.dat', () => {
  test.setTimeout(240_000);

  test('efekt dzwiekowy: dekodowanie ACM w workerze, odtwarzanie do konca', async ({ page }) => {
    const errors = collectErrors(page);
    await openGame(page);
    await page.getByTestId('tab-sound').click();
    await expect(page.getByTestId('sound-count')).not.toContainText(': 0');
    await page.getByTestId('sound-search').fill('sfx/ammo.acm');
    const item = page.getByTestId('frm-item-SFX/AMMO.ACM');
    await expect(item).toBeVisible();
    await item.click();
    await expect(page.getByTestId('sound-state')).toHaveAttribute('data-state', 'playing');
    const dur = await page.evaluate(
      () => (window as unknown as { __f2audio: AudioDbg }).__f2audio.dialog.durationMs.value,
    );
    expect(dur).toBeGreaterThan(100);
    await expect(page.getByTestId('sound-state')).toHaveAttribute('data-state', 'stopped', {
      timeout: 30_000,
    });
    expect(errors, 'bledy konsoli').toEqual([]);
  });

  test('mowa z LIP: klatki ust zmieniaja sie w czasie, stop zeruje usta', async ({ page }) => {
    const errors = collectErrors(page);
    await openGame(page);
    await page.getByTestId('tab-sound').click();
    await expect(page.getByTestId('sound-count')).not.toContainText(': 0');
    await page.getByTestId('sound-search').fill('bosss/ssa4a');
    await page.getByTestId('frm-item-SPEECH/BOSSS/SSA4A.ACM').click();
    await expect(page.getByTestId('sound-state')).toHaveAttribute('data-state', 'playing');
    await expect(page.getByTestId('sound-lip')).toHaveAttribute('data-has-lip', 'true');
    const seen = new Set<number>();
    for (let i = 0; i < 40; i++) {
      seen.add(
        await page.evaluate(
          () => (window as unknown as { __f2audio: AudioDbg }).__f2audio.dialog.mouth.value,
        ),
      );
      await page.waitForTimeout(150);
    }
    expect(seen.size, 'rozne klatki ust').toBeGreaterThan(1);
    await page.getByTestId('sound-stop').click();
    await expect(page.getByTestId('sound-state')).toHaveAttribute('data-state', 'stopped');
    expect(
      await page.evaluate(
        () => (window as unknown as { __f2audio: AudioDbg }).__f2audio.dialog.mouth.value,
      ),
    ).toBe(0);
    expect(errors, 'bledy konsoli').toEqual([]);
  });

  test('muzyka: brak plikow w sound/music daje cisze bez bledu', async ({ page }) => {
    const errors = collectErrors(page);
    await openGame(page);
    await page.getByTestId('tab-sound').click();
    await expect(page.getByTestId('sound-count')).not.toContainText(': 0');
    const res = await page.evaluate(async () => {
      const a = (window as unknown as { __f2audio: AudioDbg }).__f2audio;
      const m = a.music as unknown as { onMap(n: string): Promise<void> };
      await m.onMap('07desert');
      return { current: a.music.current.value, error: a.music.error.value };
    });
    // pliki muzyki nie sa w master.dat (na CD); gdy ich brak, jest cisza i komunikat
    if (res.current === null) expect(res.error).toContain('07desert');
    expect(errors, 'bledy konsoli').toEqual([]);
  });

  test('strumien muzyki: ACM -> worker -> AudioWorklet (plik testowy z SFX)', async ({ page }) => {
    const errors = collectErrors(page);
    await openGame(page);
    await page.getByTestId('tab-sound').click();
    await expect(page.getByTestId('sound-count')).not.toContainText(': 0');
    const res = await page.evaluate(async () => {
      const a = (window as unknown as { __f2audio: { system: AudioSys } }).__f2audio;
      await a.system.resume();
      await a.system.music.play('sound/sfx/ammo.acm', { loop: true, crossfadeMs: 0 });
      const cur = a.system.music.current;
      await new Promise((r) => setTimeout(r, 1500)); // worklet prosi o dane i petla seek(0)
      const still = a.system.music.current;
      await a.system.music.stop(0);
      return { cur, still, after: a.system.music.current };
    });
    expect(res).toEqual({ cur: 'sound/sfx/ammo.acm', still: 'sound/sfx/ammo.acm', after: null });
    expect(errors, 'bledy konsoli').toEqual([]);
  });
});
interface AudioSys {
  resume(): Promise<void>;
  music: {
    current: string | null;
    play(p: string, o: { loop: boolean; crossfadeMs: number }): Promise<void>;
    stop(ms: number): Promise<void>;
  };
}
