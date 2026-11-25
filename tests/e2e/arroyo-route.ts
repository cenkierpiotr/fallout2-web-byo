import { expect, type Page } from '@playwright/test';

/** Indeksy map w maps.txt (ARCAVES, ARVILLAG). */
export const ARCAVES_INDEX = 3;
export const ARVILLAG_INDEX = 4;

async function mapNameOf(page: Page): Promise<string> {
  return (await page.evaluate(`window.__f2game.view.currentMap.value.name`)) as string;
}

export async function walkCavesToVillage(page: Page): Promise<void> {
  // ARCAVES ma 3 kondygnacje: wyjscia destMap 3 (ta sama mapa) przenosza o poziom wyzej, dopiero z elewacji 2 idzie sie do ARVILLAG
  const steps: string[] = [];
  await page.waitForFunction(`window.__f2game.map.name === 'ARCAVES'`, undefined, {
    timeout: 300_000,
  });
  // zamki drzwi w jaskiniach (bit 0x2) to bramka rozgrywki (wymaga Wlamywania/klucza), tu zdejmowana jak po udanym otwarciu
  // D: jedyne wejscie do komory schodow na el1 (drzwi 0x20003a4, hex 14322) otwiera atak bronia o typie obrazen Explosion
  // (AIBkDor damage_p_proc: metarule(49, target_obj) == 6, target_obj = bron; silnik gry 0x424c04). Zwykly ladunek
  // plastikowy NIE niszczy drzwi (0x412cf4 wola damage_p_proc tylko dla kryterow). Flag drzwi nie ruszamy: wywolujemy
  // prawdziwy damage_p_proc przez silnik skryptow (applyWeaponHit), a skrypt sam podmienia drzwi na 0x20003a5.
  const breached = await page.evaluate(`(() => {
    const g = window.__f2game;
    const door = g.map.objects.find(o => o.pid === 0x20003a4);
    if (!door) return 'brak';
    g.scripts.applyWeaponHit(door.id, door.id, door.id, 6);
    return g.map.objects.some(o => o.pid === 0x20003a4) ? 'nadal' : 'zniszczone';
  })()`);
  expect(breached).toBe('zniszczone');
  // Z: stwor 0x1000112 (skrypt 0x4000005, hex 13728 el2) stoi jedyny przed drzwiami 13528 do wyjscia ARVILLAG; w grze trzeba go zabic.
  // Martwy krytter nie blokuje (Z, flaga martwego niezbadana w exe), wiec tu oznaczamy go jak po zabiciu.
  await page.evaluate(
    `window.__f2game.map.objects.filter(o => o.pid === 0x1000112 && o.elevation === 2).forEach(o => { o.flags |= 0x10; })`,
  );
  for (let i = 0; i < 6 && (await mapNameOf(page)) === 'ARCAVES'; i++) {
    // skrypty drzwi (obj_lock) potrafia zamknac je ponownie przy zmianie kondygnacji, wiec zdejmujemy zamki w kazdej iteracji
    await page.evaluate(
      `window.__f2game.map.objects.filter(o => o.extra && o.extra.kind === 'door' && o.extra.raw).forEach(o => { o.extra.raw[0] &= ~2; })`,
    );
    const st = (await page.evaluate(`(() => { const g = window.__f2game;
        const el = g.view.player.value.elevation;
        const ex = g.map.exitGrids.filter(e => e.elevation === el && (e.destMap === ${ARVILLAG_INDEX} || e.destMap === ${ARCAVES_INDEX}));
        ex.sort((a, b) => (b.destMap === ${ARVILLAG_INDEX} ? 9 : b.destElevation) - (a.destMap === ${ARVILLAG_INDEX} ? 9 : a.destElevation));
        return {el, ex: ex.map(e => ({hex: e.hex, destMap: e.destMap, destElevation: e.destElevation}))}; })()`)) as {
      el: number;
      ex: { hex: number; destMap: number; destElevation: number }[];
    };
    let moved = false;
    for (const e of st.ex) {
      const r = (await page.evaluate(`window.__f2game.commands.moveTo(${e.hex}, true)`)) as {
        ok: boolean;
        reason?: string;
      };
      steps.push(`el${st.el} ${e.hex}->map${e.destMap}/el${e.destElevation}: ${JSON.stringify(r)}`);
      if (!r.ok) continue;
      moved = true;
      await page.waitForFunction(
        (el) => {
          const g = (
            window as unknown as {
              __f2game: {
                view: {
                  currentMap: { value: { name: string } };
                  player: { value: { elevation: number } };
                };
              };
            }
          ).__f2game;
          return g.view.currentMap.value.name !== 'ARCAVES' || g.view.player.value.elevation !== el;
        },
        st.el,
        { timeout: 300_000 },
      );
      break;
    }
    expect(moved, steps.join(' | ')).toBe(true);
  }
  expect(steps.join(' | ')).toMatch(/map4\/el0: \{"ok":true/);
  await page.waitForFunction(
    `String(window.__f2game.map.name).toUpperCase() === 'ARVILLAG'`,
    undefined,
    { timeout: 300_000 },
  );
}
