import { expect, test, type Page } from '@playwright/test';
import { GAME_DIR, collectErrors, openGame, finishCreator } from './helpers';
import { presetStorage } from './map-helpers';

test.skip(!GAME_DIR, 'brak F2_GAME_DIR (testy tylko lokalnie, pliki gry nie sa w repo)');

async function startNewGame(page: Page): Promise<void> {
  await presetStorage(page, 2);
  await page.addInitScript(() => localStorage.setItem('locale', 'pl'));
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

test.describe('mapa swiata na prawdziwym VFS', () => {
  test('FRM mapy swiata sa dekodowane, a grupa spotkania powstaje na mapie spotkania', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const errors = collectErrors(page);
    await startNewGame(page);
    await page.getByTestId('worldmap-open').click();
    await expect(page.getByTestId('worldmap-screen')).toBeVisible({ timeout: 60_000 });

    // grafika: kafle WRLDMP00..19, miasta, cel, pozycja, samochod
    const art = await page.evaluate(() => {
      type Img = { width: number; height: number } | null;
      const a = (
        window as unknown as {
          __f2wmArt?: {
            tiles: Img[];
            city: Record<string, Img>;
            target: Img;
            loc: Img;
            car: Img[];
          };
        }
      ).__f2wmArt;
      if (!a) return null;
      const dim = (i: Img): [number, number] | null => (i ? [i.width, i.height] : null);
      return {
        tiles: a.tiles.map(dim),
        city: Object.values(a.city).map(dim),
        target: dim(a.target),
        loc: dim(a.loc),
        car: a.car.map(dim),
      };
    });
    expect(art, 'loadWorldmapArt zwrocil null').not.toBeNull();
    expect(art!.tiles).toHaveLength(20);
    for (const t of art!.tiles) {
      expect(t).not.toBeNull();
      expect(t![0]).toBeGreaterThan(0);
      expect(t![1]).toBeGreaterThan(0);
    }
    for (const t of [...art!.city, art!.target, art!.loc]) {
      expect(t).not.toBeNull();
      expect(t![0]).toBeGreaterThan(0);
      expect(t![1]).toBeGreaterThan(0);
    }
    expect(art!.car.length).toBeGreaterThan(0);

    // wpis tabeli z grupa NPC i mapa, ktora da sie wczytac
    const picked = await page.evaluate(() => {
      const ctl = (
        window as unknown as {
          __f2wm: {
            data: {
              cfg: {
                tables: {
                  index: number;
                  entries: {
                    special: boolean;
                    encounters: { name: string; min: number; max: number }[];
                  }[];
                }[];
              };
              maps: { name: string; lookup: string }[];
            };
          };
        }
      ).__f2wm;
      for (const t of ctl.data.cfg.tables) {
        for (let e = 0; e < t.entries.length; e++) {
          const ent = t.entries[e]!;
          if (ent.special || ent.encounters.length === 0) continue;
          const map = ctl.data.maps.find(
            (m) => /^(desert|mountn|city|ocean)/i.test(m.name) || /desert|mount/i.test(m.lookup),
          );
          if (map)
            return {
              tableIndex: t.index,
              entryIndex: e,
              mapName: map.name,
              groups: ent.encounters,
            };
        }
      }
      return null;
    });
    expect(picked).not.toBeNull();

    const before = await page.evaluate(
      () =>
        (
          window as unknown as { __f2game: { map: { objects: { type: number }[] } } }
        ).__f2game.map.objects.filter((o) => o.type === 1).length,
    );
    await page.evaluate((p) => {
      const enter = (window as unknown as { __f2wmEnter: (n: string, ev: unknown) => void })
        .__f2wmEnter;
      enter(p!.mapName, {
        kind: 'encounter',
        prompt: false,
        xp: 0,
        tableIndex: p!.tableIndex,
        entryIndex: p!.entryIndex,
        mapName: p!.mapName,
        special: false,
        groups: p!.groups,
      });
    }, picked);
    await expect(page.getByTestId('map-name')).toContainText(
      new RegExp(picked!.mapName.replace(/\.map$/i, ''), 'i'),
      { timeout: 90_000 },
    );
    // grupa tworzona po wejsciu na mape (asynchronicznie)
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              (
                window as unknown as { __f2game: { map: { objects: { type: number }[] } } }
              ).__f2game.map.objects.filter((o) => o.type === 1).length,
          ),
        { timeout: 60_000 },
      )
      .toBeGreaterThanOrEqual(2); // gracz + >= 1 krytter grupy
    expect(before).toBeGreaterThanOrEqual(1);
    expect(errors.filter((e) => !/favicon|WebGL|GPU/i.test(e))).toEqual([]);
  });
});
