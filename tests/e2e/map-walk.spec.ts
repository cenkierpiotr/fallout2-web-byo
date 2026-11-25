import { expect, test } from '@playwright/test';
import { GAME_DIR, collectErrors } from './helpers';
import { game, openMap, openMapScreen, presetStorage } from './map-helpers';

test.skip(!GAME_DIR, 'brak F2_GAME_DIR (testy tylko lokalnie, pliki gry nie sa w repo)');

test.describe('ekran mapy', () => {
  test('lista map, marsz, sciana, zoom, FPS', async ({ page }, info) => {
    test.setTimeout(240_000);
    const errors = collectErrors(page);
    // Profil dotykowy (Pixel 7): mysz nie wywoluje ruchu, uzywamy tapniecia.
    const clickAt = async (x: number, y: number): Promise<void> => {
      if (info.project.name === 'mobile') await page.touchscreen.tap(x, y);
      else await page.mouse.click(x, y);
    };
    await presetStorage(page, 2);
    await openMapScreen(page);
    await expect(page.getByTestId('map-item-ARTEMPLE')).toBeVisible();
    await expect(page.getByTestId('map-item-ARVILLAG')).toBeVisible();
    await openMap(page, 'ARTEMPLE');

    // marsz: klik w heks 5 od gracza
    const start = await game(page, (g) => g.player.hex);
    const target = await game(page, (g) => g.openHexAt(5));
    expect(target).toBeGreaterThanOrEqual(0);
    const pt = await game(page, (g) => g.hexToClient(g.openHexAt(5)));
    await clickAt(pt.x, pt.y);
    await page.waitForFunction(
      (h) => {
        const g = (
          window as unknown as {
            __f2game: { view: { player: { value: { hex: number; moving: boolean } } } };
          }
        ).__f2game;
        return g.view.player.value.hex === h && !g.view.player.value.moving;
      },
      target,
      { timeout: 3000 + 15_000 },
    );
    expect(await game(page, (g) => g.player.hex)).not.toBe(start);

    // klik w sciane: powiadomienie
    const wall = await game(page, (g) => g.blockedHexNear());
    expect(wall).toBeGreaterThanOrEqual(0);
    const wpt = await game(page, (g) => g.hexToClient(g.blockedHexNear()));
    await clickAt(wpt.x, wpt.y);
    await expect(page.getByTestId('notifications')).toContainText(
      /Tam nie przejdziesz|Nie ma drogi/,
    );

    // zoom klawiszami
    const z0 = await game(page, (g) => g.iso.zoom);
    await page.getByTestId('map-stage').focus();
    await page.keyboard.press('+');
    const z1 = await game(page, (g) => g.iso.zoom);
    expect(z1).toBeGreaterThan(z0);
    await page.keyboard.press('-');
    await page.keyboard.press('-');
    expect(await game(page, (g) => g.iso.zoom)).toBeLessThan(z1);
    await page.keyboard.press('0');
    expect(await game(page, (g) => g.iso.zoom)).toBeCloseTo(2, 5);

    // FPS przez 10 s przy zoomie 2x. Twarda asercja (>= 58) tylko z F2_FPS_STRICT=1 na maszynie
    // z GPU; w headless swiftshader (rasteryzacja CPU) mierzymy koszt klatki po stronie JS.
    const samples: number[] = [];
    const cpu: number[] = [];
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(1000);
      samples.push(await game(page, (g) => g.fps.value));
      cpu.push(await game(page, (g) => g.stats.buildMs + g.stats.submitMs));
    }
    const min = Math.min(...samples.slice(2));
    const cpuMax = [...cpu].sort((a, b) => a - b)[Math.floor(cpu.length / 2)] ?? 0;
    info.annotations.push({
      type: 'fps',
      description: `min=${min} samples=${samples.join(',')} cpuMsMedian=${cpuMax.toFixed(1)}`,
    });
    console.log('FPS ARTEMPLE zoom 2x:', samples.join(','), 'cpu ms median', cpuMax.toFixed(1));
    expect(min).toBeGreaterThan(0);
    expect(cpuMax, 'koszt klatki po stronie JS (ms)').toBeLessThan(20);
    if (process.env['F2_FPS_STRICT']) expect(min).toBeGreaterThanOrEqual(58);
    expect(errors, 'bledy konsoli').toEqual([]);
  });

  test('poziomy i exit grid', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = collectErrors(page);
    await presetStorage(page, 1);
    await openMapScreen(page);

    // poziomy: ARCAVES ma 3
    await openMap(page, 'ARCAVES');
    await page.getByTestId('map-stage').focus();
    await page.keyboard.press('PageUp');
    await page.waitForFunction(
      () =>
        (
          window as unknown as {
            __f2game: { view: { currentMap: { value: { elevation: number } } } };
          }
        ).__f2game.view.currentMap.value.elevation === 1,
    );
    await expect(page.getByTestId('elevation-label')).toContainText('1');
    await page.keyboard.press('PageDown');
    await page.waitForFunction(
      () =>
        (
          window as unknown as {
            __f2game: { view: { currentMap: { value: { elevation: number } } } };
          }
        ).__f2game.view.currentMap.value.elevation === 0,
    );

    // exit grid: ARTEMPLE (0:15686 -> sekcja [Map 003] = ARCAVES)
    await page.getByTestId('map-back').dispatchEvent('click');
    await openMap(page, 'ARTEMPLE');
    await game(page, (g) => g.commands?.moveTo(15686, true));
    await page.waitForFunction(
      () =>
        (window as unknown as { __f2game: { view: { currentMap: { value: { name: string } } } } })
          .__f2game.view.currentMap.value.name !== 'ARTEMPLE',
      undefined,
      { timeout: 60_000 },
    );
    const name = await game(page, (g) => g.view.currentMap.value.name);
    expect(name).toBe('ARCAVES');
    expect(errors, 'bledy konsoli').toEqual([]);
  });
});
