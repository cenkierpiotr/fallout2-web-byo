import { expect, test, type Page } from '@playwright/test';
import { GAME_DIR, collectErrors, openGame, finishCreator } from './helpers';
import { game, presetStorage } from './map-helpers';

test.skip(!GAME_DIR, 'brak F2_GAME_DIR (testy tylko lokalnie, pliki gry nie sa w repo)');

/**
 * Kryteria M5 (plan Z35): Swiatynia Prob -> Arroyo -> Klamath -> Den z zapisami.
 * Zapis/odczyt w kazdym punkcie, autozapis przy zmianie mapy, zegar gry, handel, odpoczynek.
 * Przejscia miedzy mapami przez `session.travelTo` (jak `debug.travelTo` z planu); sama droga
 * ARTEMPLE -> ARCAVES -> ARVILLAG po exit gridach ma osobny test (artemple-run.spec.ts).
 */

interface SaveMetaLike {
  slot: string;
  location: string;
  gameDate: string;
}

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

/** Wykonuje wyrazenie na sesji gry (JSON-owalny wynik). */
function onSession<T>(page: Page, body: string): Promise<T> {
  return page.evaluate(
    `(async () => { const s = window.__f2game.session; ${body} })()`,
  ) as Promise<T>;
}

async function mapName(page: Page): Promise<string> {
  return game(page, (g) => g.view.currentMap.value.name);
}

async function travel(page: Page, name: string): Promise<void> {
  const r = await onSession<{ ok: boolean; reason?: string }>(
    page,
    `return await s.travelTo(${JSON.stringify(name)});`,
  );
  expect(r, `travelTo ${name}`).toMatchObject({ ok: true });
  await expect.poll(() => mapName(page), { timeout: 120_000 }).toBe(name.toUpperCase());
}

const snapshotState = (page: Page) =>
  onSession<{ map: string; hex: number; ticks: number; dateText: string; inv: string }>(
    page,
    `const p = s.world.player;
     return { map: s.world.map.name, hex: p.hex, ticks: s.world.clock.ticks,
       dateText: s.view.clock.value.dateText,
       inv: JSON.stringify(p.inventory.map(i => [i.pid, i.quantity ?? 1]).sort()) };`,
  );

test.describe('M5: Swiatynia -> Arroyo -> Klamath -> Den z zapisami', () => {
  test('zapis/odczyt w kazdym punkcie, autozapis, zegar, odpoczynek, handel', async ({ page }) => {
    test.setTimeout(900_000);
    const errors = collectErrors(page);
    await startNewGame(page);

    // --- ARTEMPLE: zegar tyka, zapis manual-0 ---
    const t0 = await snapshotState(page);
    expect(t0.map).toBe('ARTEMPLE');
    await page.waitForTimeout(1500);
    const tTick = await snapshotState(page);
    expect(tTick.ticks, 'zegar gry idzie do przodu w czasie rzeczywistym').toBeGreaterThan(
      t0.ticks,
    );
    expect(await onSession(page, `return await s.save('manual-0');`)).toMatchObject({ ok: true });

    // --- ARVILLAG (Arroyo) ---
    await travel(page, 'arvillag');
    const arroyo = await snapshotState(page);
    expect(arroyo.map).toBe('ARVILLAG');
    expect(await onSession(page, `return await s.save('manual-1');`)).toMatchObject({ ok: true });
    const metas1 = await onSession<SaveMetaLike[]>(
      page,
      `return await s.saveCommands.saves.list();`,
    );
    // autozapis przy zmianie mapy: wpis auto-N z lokacja docelowa
    expect(metas1.some((m) => m.slot.startsWith('auto-') && /ARVILLAG/i.test(m.location))).toBe(
      true,
    );

    // --- KLAMATH ---
    await travel(page, 'kladwtwn');
    const klamath = await snapshotState(page);
    expect(klamath.map).toBe('KLADWTWN');
    expect(klamath.ticks).toBeGreaterThanOrEqual(arroyo.ticks);
    expect(await onSession(page, `return await s.save('manual-2');`)).toMatchObject({ ok: true });

    // handel: kupiec z towarem w Klamath; gracz dostaje kapsle i kupuje najtanszy przedmiot
    const preTrade = await snapshotState(page);
    const trade = await onSession<Record<string, unknown>>(
      page,
      `const w = s.world, sc = window.__f2game.scripts;
       const CAPS = 0x29;
       const cands = w.map.objects.filter(o => o.type === 1 && !o.hidden && o.hex >= 0 && o !== w.player
         && o.inventory.some(i => i.pid !== CAPS && i.proto.kind === 'item' && i.proto.cost > 0));
       if (!cands.length) return { err: 'brak kupca' };
       const m = cands[0];
       const item = m.inventory.filter(i => i.pid !== CAPS && i.proto.kind === 'item' && i.proto.cost > 0)
         .sort((a, b) => a.proto.cost - b.proto.cost)[0];
       const capsId = sc.createObject(CAPS, w.player.hex, w.player.elevation, 0);
       sc.addMultObjsToInven(w.player.id, capsId, 3000);
       const capsBefore = w.player.inventory.filter(i => i.pid === CAPS).reduce((n, i) => n + (i.quantity ?? 1), 0);
       const snap = s.openBarter(m, { merchantName: 'Kupiec' });
       const vitem = (snap.merchant ?? []).filter(i => i.pid === item.pid)[0];
       const mv = vitem ? s.barter.move('merchant', vitem.id, 1, 'table') : { ok: false, reason: 'brak w snapshot: ' + Object.keys(snap) };
       const bal = s.barter.balance();
       const acc = s.barter.accept();
       s.barter.close();
       const capsAfter = w.player.inventory.filter(i => i.pid === CAPS).reduce((n, i) => n + (i.quantity ?? 1), 0);
       return { mv, bal, acc, capsBefore, capsAfter, pid: item.pid, cost: item.proto.cost,
         owned: w.player.inventory.some(i => i.pid === item.pid),
         merchantHas: m.inventory.some(i => i.id === item.id) };`,
    );
    console.log('TRADE ' + JSON.stringify(trade));
    expect(trade['err']).toBeUndefined();
    expect(trade['mv']).toMatchObject({ ok: true });
    expect(trade['acc']).toMatchObject({ ok: true });
    expect(trade['owned']).toBe(true);
    expect(trade['capsAfter'] as number).toBeLessThan(trade['capsBefore'] as number);
    expect(await snapshotState(page).then((x) => x.inv)).not.toBe(preTrade.inv);
    // zapis po handlu zachowuje zakupiony przedmiot
    expect(await onSession(page, `return await s.save('manual-3');`)).toMatchObject({ ok: true });
    const afterTrade = await snapshotState(page);

    // odpoczynek: zegar idzie do przodu
    const beforeRest = await snapshotState(page);
    const rest = await onSession<Record<string, unknown>>(page, `return s.rest({ hours: 3 });`);
    const afterRest = await snapshotState(page);
    expect(afterRest.ticks, JSON.stringify(rest)).toBeGreaterThan(beforeRest.ticks);

    // --- DEN ---
    await travel(page, 'denbus1');
    const den = await snapshotState(page);
    expect(den.map).toBe('DENBUS1');

    // --- wczytaj manual-1: wracamy do Arroyo ze stanem z zapisu ---
    expect(await onSession(page, `return await s.load('manual-1');`)).toMatchObject({ ok: true });
    await expect.poll(() => mapName(page), { timeout: 120_000 }).toBe('ARVILLAG');
    const back = await snapshotState(page);
    expect(back.hex).toBe(arroyo.hex);
    expect(back.inv).toBe(arroyo.inv);
    // zegar z zapisu (petla gry po wczytaniu juz tyka: tolerancja 1 min gry = 600 tickow)
    expect(back.ticks).toBeGreaterThanOrEqual(arroyo.ticks);
    expect(back.ticks - arroyo.ticks).toBeLessThan(600);

    // --- odczyt manual-2 (Klamath) i manual-0 (Swiatynia): mapa i heks wracaja ---
    expect(await onSession(page, `return await s.load('manual-2');`)).toMatchObject({ ok: true });
    await expect.poll(() => mapName(page), { timeout: 120_000 }).toBe('KLADWTWN');
    const k2 = await snapshotState(page);
    expect(k2.hex).toBe(klamath.hex);
    expect(k2.inv, 'inwentarz sprzed handlu').toBe(klamath.inv);
    expect(await onSession(page, `return await s.load('manual-3');`)).toMatchObject({ ok: true });
    await expect.poll(() => mapName(page), { timeout: 120_000 }).toBe('KLADWTWN');
    expect((await snapshotState(page)).inv, 'inwentarz po handlu').toBe(afterTrade.inv);
    expect(await onSession(page, `return await s.load('manual-0');`)).toMatchObject({ ok: true });
    await expect.poll(() => mapName(page), { timeout: 120_000 }).toBe('ARTEMPLE');
    const t2 = await snapshotState(page);
    expect(t2.hex).toBe(t0.hex);
    expect(t2.inv).toBe(t0.inv);

    expect(errors.filter((e) => !/favicon|WebGL|GPU/i.test(e))).toEqual([]);
  });
});
