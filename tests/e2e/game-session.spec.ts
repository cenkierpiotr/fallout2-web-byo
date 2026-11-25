import { expect, test } from '@playwright/test';
import { GAME_DIR, collectErrors } from './helpers';
import { openMap, openMapScreen, presetStorage } from './map-helpers';

test.skip(!GAME_DIR, 'brak F2_GAME_DIR (testy tylko lokalnie, pliki gry nie sa w repo)');

interface Sess {
  view: {
    clock: { value: { ticks: number; dateText: string } };
    saves: { value: { slot: string }[] };
    barter: { value: { tablePlayer: unknown[]; merchant: { id: number }[] } | null };
  };
  world: { player: { hex: number; inventory: unknown[] }; clock: { ticks: number } };
  quickSave(): Promise<{ ok: boolean }>;
  quickLoad(): Promise<{ ok: boolean }>;
  openBarter(m: unknown, o?: unknown): { merchant: { id: number; pid: number }[] };
  barter: { move(...a: unknown[]): { ok: boolean } };
}
interface G {
  session: Sess;
  player: { hex: number };
  commands: { moveTo(h: number): { ok: boolean } };
}

test.describe('GameSession: zapis i handel w prawdziwej grze', () => {
  test('quicksave/quickload przywraca pozycje i zegar; handel z przedmiotem z mapy', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const errors = collectErrors(page);
    await presetStorage(page, 2);
    await openMapScreen(page);
    await openMap(page, 'ARTEMPLE');

    // czas gry idzie petla
    const t0 = await page.evaluate(
      () => (window as unknown as { __f2game: G }).__f2game.session.view.clock.value.ticks,
    );
    await page.waitForFunction(
      (t) => (window as unknown as { __f2game: G }).__f2game.session.view.clock.value.ticks > t,
      t0,
      { timeout: 10_000 },
    );

    const startHex = await page.evaluate(
      () => (window as unknown as { __f2game: G }).__f2game.player.hex,
    );
    const saved = await page.evaluate(async () => {
      const g = (window as unknown as { __f2game: G }).__f2game;
      const r = await g.session.quickSave();
      return {
        ok: r.ok,
        ticks: g.session.world.clock.ticks,
        slots: g.session.view.saves.value.length,
      };
    });
    expect(saved.ok).toBe(true);

    // przesun gracza i zegar, potem wczytaj
    const target = await page.evaluate(() => {
      const g = (window as unknown as { __f2game: G & { openHexAt(n: number): number } }).__f2game;
      const h = g.openHexAt(4);
      g.commands.moveTo(h);
      return h;
    });
    await page.waitForFunction(
      (h) => (window as unknown as { __f2game: G }).__f2game.player.hex === h,
      target,
      { timeout: 20_000 },
    );
    const loaded = await page.evaluate(async () => {
      const g = (window as unknown as { __f2game: G }).__f2game;
      const r = await g.session.quickLoad();
      return { ok: r.ok, hex: g.player.hex, ticks: g.session.world.clock.ticks };
    });
    expect(loaded.ok).toBe(true);
    expect(loaded.hex).toBe(startHex);
    expect(loaded.ticks).toBeLessThanOrEqual(saved.ticks + 5);

    // handel: gracz z kapslami i przedmiotem kupca z reguly @f2/rules
    const barter = await page.evaluate(() => {
      const g = (window as unknown as { __f2game: G }).__f2game;
      const mk = (pid: number, qty: number, cost: number) => ({
        id: pid,
        pid,
        fid: 0,
        type: 0,
        hex: -1,
        elevation: 0,
        rotation: 0,
        frame: 0,
        flags: 0,
        protoFlags: 0,
        scriptId: -1,
        localVars: new Int32Array(0),
        inventory: [],
        quantity: qty,
        proto: { kind: 'item', cost, weight: pid === 0x29 ? 0 : 1, subtype: 5 },
        extra: { kind: 'item' },
        hidden: false,
      });
      const p = g.session.world.player as unknown as { inventory: unknown[] };
      p.inventory = [mk(0x29, 500, 1)];
      const merchant = { ...mk(1, 1, 1), type: 1, inventory: [mk(0x40, 1, 30)] };
      const snap = g.session.openBarter(merchant, { merchantName: 'Vic' });
      const id = snap.merchant[0]!.id;
      const m = g.session.barter.move('merchant', id, 1, 'table');
      const b = (g.session.barter as unknown as { balance(): { ok: boolean } }).balance();
      const a = (g.session.barter as unknown as { accept(): { ok: boolean } }).accept();
      return { m: m.ok, b: b.ok, a: a.ok, inv: p.inventory.length };
    });
    expect(barter).toEqual({ m: true, b: true, a: true, inv: 2 });
    expect(errors.filter((e) => !/favicon|swiftshader|GPU stall/i.test(e))).toEqual([]);
  });
});
