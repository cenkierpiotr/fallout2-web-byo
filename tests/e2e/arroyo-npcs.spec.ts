import { expect, test } from '@playwright/test';
import { GAME_DIR, collectErrors } from './helpers';
import { ACCEPTED_UNSUPPORTED, Macro } from './macro';

test.skip(!GAME_DIR, 'brak F2_GAME_DIR (testy tylko lokalnie, pliki gry nie sa w repo)');

/** NPC Arroyo: Klint (acklint) w ARTEMPLE; trzech NPC z ARVILLAG (acmynoc nie wystepuje w ARVILLAG). */
const CASES: { map: string; sid: number; label: string }[] = [
  { map: 'ARTEMPLE', sid: 0x4000001, label: 'Klint' },
  { map: 'ARVILLAG', sid: 0x400000e, label: 'mieszkaniec wioski (acvillgr)' },
  { map: 'ARVILLAG', sid: 0x400000a, label: 'wojownik (acwarior)' },
  { map: 'ARVILLAG', sid: 0x4000014, label: 'Nagor (acnagor)' },
];

for (const c of CASES) {
  test(`rozmowa: ${c.label} (${c.map}), kazda opcja pierwszego poziomu`, async ({ page }) => {
    test.setTimeout(420_000);
    const errors = collectErrors(page);
    const m = await Macro.start(page, c.map);

    await m.talkTo(c.sid);
    const first = await m.options();
    expect(first.length).toBeGreaterThan(0);

    for (const idx of first) {
      // kazda galaz: swieza rozmowa, wybor opcji, zamkniecie
      if (!(await page.getByTestId('dialog-screen').isVisible())) await m.talkTo(c.sid);
      const avail = await m.options();
      if (!avail.includes(idx)) continue;
      await m.choose(idx);
      // po wyborze: dialog trwa (nowe opcje), lub tryb message z Zamknij, lub zniknal
      await page.waitForTimeout(300);
      for (
        let depth = 0;
        depth < 6 && (await page.getByTestId('dialog-screen').isVisible());
        depth++
      ) {
        const opts = await m.options();
        if (opts.length === 0) break;
        await m.choose(opts[0]!);
        await page.waitForTimeout(200);
      }
      if (await page.getByTestId('dialog-screen').isVisible()) await m.closeDialog();
    }

    expect(await m.vmErrors()).toEqual([]);
    const uns = await m.unsupported();
    expect(uns.filter((u) => !ACCEPTED_UNSUPPORTED.some((re) => re.test(u)))).toEqual([]);
    expect(errors.filter((e) => !/WebGL|swiftshader|GPU/i.test(e))).toEqual([]);
  });
}
