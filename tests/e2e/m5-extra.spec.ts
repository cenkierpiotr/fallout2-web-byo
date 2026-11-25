import { expect, test, type Page } from '@playwright/test';
import { GAME_DIR, collectErrors } from './helpers';
import { startNewGame } from './m4-helpers';

test.skip(!GAME_DIR, 'brak F2_GAME_DIR (testy tylko lokalnie, pliki gry nie sa w repo)');

/**
 * Domkniecie luk z raportu M5 (dokumentacja techniczna):
 * handel przez dialog (gdialog_barter), cykliczny autozapis (fake clock), odpoczynek "do rana".
 */

const CAPS = 0x29;

/** Wykonuje wyrazenie na sesji gry (JSON-owalny wynik). */
function onSession<T>(page: Page, body: string): Promise<T> {
  return page.evaluate(
    `(async () => { const s = window.__f2game.session; ${body} })()`,
  ) as Promise<T>;
}

async function travel(page: Page, name: string): Promise<void> {
  const r = await onSession<{ ok: boolean }>(
    page,
    `return await s.travelTo(${JSON.stringify(name)});`,
  );
  expect(r, `travelTo ${name}`).toMatchObject({ ok: true });
  await expect
    .poll(() => page.evaluate(`window.__f2game.view.currentMap.value.name`), { timeout: 400_000 })
    .toBe(name.toUpperCase());
}

test.describe('M5: luki z raportu smoke', () => {
  test('autozapis cykliczny co 5 min (fake clock Playwright)', async ({ page }) => {
    test.setTimeout(1_500_000);
    const errors = collectErrors(page);
    await startNewGame(page);
    const autos = () =>
      onSession<string[]>(
        page,
        `return (await s.saveCommands.saves.list()).filter(m => m.slot.startsWith('auto-')).map(m => m.slot + '|' + m.location + '|' + m.realTime);`,
      );
    const before = await autos();

    // od tego miejsca czas plynie tylko przez page.clock (Date, rAF, timery)
    await page.clock.install();
    await page.clock.runFor(1000); // kilka klatek petli: AutosaveTimer ustawia pierwszy termin
    await page.clock.fastForward(4 * 60_000);
    await page.clock.runFor(500);
    expect(await autos(), 'po 4 min nie ma jeszcze autozapisu').toEqual(before);

    await page.clock.fastForward(61_000); // lacznie > 5 min
    await page.clock.runFor(500);
    // zapis jest asynchroniczny (IndexedDB), a zegar jest sztuczny: czekamy na stan sesji, nie na czas
    await expect
      .poll(async () => (await autos()).length, { timeout: 60_000 })
      .toBeGreaterThan(before.length);
    const after = await autos();
    const added = after.filter((x) => !before.includes(x));
    expect(added.length).toBeGreaterThan(0);
    expect(added[0]).toMatch(/^auto-\d\|ARTEMPLE\|/i);
    expect(errors).toEqual([]);
  });

  test('odpoczynek "do rana": zegar gry, leczenie, UI', async ({ page }) => {
    test.setTimeout(1_500_000);
    const errors = collectErrors(page);
    await startNewGame(page);
    // wieczor: przesun zegar do 22:00 przez odpoczynek o stala liczbe godzin, ranny gracz
    const prep = await onSession<{ hour: number; hp: number; max: number }>(
      page,
      `const c = s.world.clock.date;
       const toEvening = ((22 - c.hour) + 24) % 24 || 1;
       s.rest({ hours: toEvening });
       s.state.sheet.hp = Math.max(1, s.maxHp() - 8);
       s.syncClock?.();
       return { hour: s.world.clock.date.hour, hp: s.state.sheet.hp, max: s.maxHp() };`,
    );
    expect(prep.hour).toBe(22);
    expect(prep.hp).toBeLessThan(prep.max);

    // UI: przycisk odpoczynku w HUD -> "do rana"
    await page.getByTestId('hud-rest').getByRole('button').click();
    await expect(page.getByTestId('rest-screen')).toBeVisible();
    await page.getByTestId('rest-mode-until-morning').click();
    await expect(page.getByTestId('rest-result')).toContainText(/8 godz|8,0 godz|Odpoczywano/);
    await expect(page.getByTestId('hud-clock')).toContainText('06:00');

    const after = await onSession<{ hour: number; minute: number; hp: number; max: number }>(
      page,
      `const c = s.world.clock.date;
       return { hour: c.hour, minute: c.minute, hp: s.state.sheet.hp, max: s.maxHp() };`,
    );
    expect(after.hour).toBe(6);
    expect(after.minute).toBe(0);
    // 8 h odpoczynku = >= 2 pelne odcinki 180 min leczenia: HP wzroslo, nie przekracza maksimum
    expect(after.hp).toBeGreaterThan(prep.hp);
    expect(after.hp).toBeLessThanOrEqual(after.max);
    expect(errors).toEqual([]);
  });

  test('handel z Maida przez dialog (gdialog_barter), nie przez przycisk "Handel"', async ({
    page,
  }) => {
    test.setTimeout(1_500_000);
    const errors = collectErrors(page);
    await startNewGame(page);
    await travel(page, 'kladwtwn');
    // rozmowa z Maida (skrypt kcmaida), wybor opcji z handlem: bez przycisku "Handel"
    const r = await page.evaluate(`(async () => {
      const g = window.__f2game; const w = g.session.world; const sc = g.scripts;
      const m = w.map.objects.find(o => o.scriptId !== -1 && sc.scheduler.get(o.scriptId)?.script.name === 'kcmaida');
      if (!m) return { err: 'no maida' };
      g.placePlayerNear(m.hex);
      const talk = g.commands.talkTo(m.id);
      const steps = [];
      let opened = false;
      for (let i = 0; i < 14 && !opened; i++) {
        await new Promise(r => setTimeout(r, 400));
        if (g.session.view.barter.value) { opened = true; break; }
        const d = g.view.dialog.value;
        if (!d) { steps.push('closed'); break; }
        const vis = d.options.filter(o => o.visible);
        steps.push(vis.map(o => o.text.slice(0, 60)));
        if (!vis.length) break;
        const pick = vis.find(o => /handl|handel|towar|kupi|buy|trade|barter|zobacz|poka/i.test(o.text)) ?? vis[0];
        g.commands.dialog.choose(pick.index);
      }
      await new Promise(r => setTimeout(r, 400));
      return { talk, opened: opened || !!g.session.view.barter.value, steps };
    })()`);
    console.log('MAIDA ' + JSON.stringify(r));
    expect(r, JSON.stringify(r)).toMatchObject({ opened: true });

    // sesja handlu z kupcem z dialogu: towary Maidy, wycena stolu, anulowanie (nowa gra: gracz bez kapsli)
    const deal = await onSession<{
      merchant: number;
      wanted: number;
      onTable: number;
      params: { barterMod: number };
      mv: unknown;
      afterCancel: boolean;
    }>(
      page,
      `const b = s.view.barter.value;
       const cand = b.merchant.filter(i => i.pid !== ${CAPS} && i.tradeable && i.value > 0)[0];
       const mv = s.barter.move('merchant', cand.id, 1, 'table');
       const t = s.view.barter.value;
       const out = { merchant: b.merchant.length, wanted: t.totals.wanted, onTable: t.tableMerchant.length,
         params: t.params, mv };
       s.barter.cancel(); s.barter.close();
       return { ...out, afterCancel: s.view.barter.value === null };`,
    );
    expect(deal.merchant).toBeGreaterThan(0);
    expect(deal.mv).toEqual({ ok: true });
    expect(deal.onTable).toBe(1);
    expect(deal.wanted).toBeGreaterThan(0);
    expect(typeof deal.params.barterMod).toBe('number');
    expect(deal.afterCancel).toBe(true);
    expect(errors).toEqual([]);
  });
});
