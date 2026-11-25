import { expect, type Page } from '@playwright/test';
import { openMap, openMapScreen, presetStorage } from './map-helpers';

/** Wpis logu skryptow (ScriptRuntime.log). */
export interface ScriptLogEntry {
  kind: string;
  message: string;
}

interface DevGame {
  commands: {
    moveTo(hex: number, run?: boolean): { ok: boolean; reason?: string };
    talkTo(id: number): { ok: boolean; reason?: string };
    dialog: {
      choose(i: number): { ok: boolean; reason?: string };
      close(): { ok: boolean; reason?: string };
    };
  };
  view: {
    dialog: {
      value: {
        mode?: string;
        options: { index: number; text?: string; visible?: boolean }[];
      } | null;
    };
    player: { value: { hex: number; moving: boolean } };
    currentMap: { value: { name: string } };
  };
  scripts: {
    log: ScriptLogEntry[];
    scheduler: { get(sid: number): { script: { name: string } } | undefined };
    globalVar?(i: number): number;
  };
  map: { objects: { id: number; hex: number; scriptId: number; type: number }[] };
  objectByScript(sid: number): { id: number; hex: number } | undefined;
  placePlayerNear(hex: number): boolean;
}

/** Zestaw krokow makra: ruch na heks, rozmowa, wybor opcji, asercje stanu. Bledy VM zbierane z logu skryptow. */
export class Macro {
  constructor(readonly page: Page) {}

  static async start(page: Page, map: string): Promise<Macro> {
    await presetStorage(page, 1);
    await openMapScreen(page);
    await openMap(page, map);
    return new Macro(page);
  }

  /** Marsz na heks; czeka az gracz dojdzie (lub zwraca blad sciezki). */
  async moveTo(hex: number, timeoutMs = 120_000): Promise<{ ok: boolean; reason?: string }> {
    const mapBefore = await this.mapName();
    const r = await this.page.evaluate(`(window.__f2game.commands.moveTo(${hex}, true))`);
    const result = r as { ok: boolean; reason?: string };
    if (!result.ok) return result;
    // koniec marszu: dotarcie na heks albo zmiana mapy (wejscie na exit grid)
    await this.page.waitForFunction(
      ({ h, before }) => {
        const g = (window as unknown as { __f2game: DevGame }).__f2game;
        const p = g.view.player.value;
        return g.view.currentMap.value.name !== before || (p.hex === h && !p.moving);
      },
      { h: hex, before: mapBefore },
      { timeout: timeoutMs },
    );
    return result;
  }

  async mapName(): Promise<string> {
    return (await this.page.evaluate(`window.__f2game.view.currentMap.value.name`)) as string;
  }

  /** Ustawia gracza obok obiektu o danym sid i rozpoczyna rozmowe (talk_p_proc). */
  async talkTo(sid: number): Promise<void> {
    const ok = await this.page.evaluate(`(() => {
      const g = window.__f2game; const o = g.objectByScript(${sid});
      if (!o) return 'brak obiektu';
      g.placePlayerNear(o.hex);
      const r = g.commands.talkTo(o.id);
      return r.ok ? 'ok' : 'blad: ' + r.reason;
    })()`);
    expect(ok).toBe('ok');
    await expect(this.page.getByTestId('dialog-screen')).toBeVisible({ timeout: 15_000 });
  }

  /** Indeksy opcji aktualnego dialogu. */
  async options(): Promise<number[]> {
    return (await this.page.evaluate(
      `(window.__f2game.view.dialog.value?.mode === 'message' ? [] : (window.__f2game.view.dialog.value?.options ?? [])).map((o, i) => o.visible ? i : -1).filter(i => i >= 0)`,
    )) as number[];
  }

  /** Wybiera opcje po indeksie przez UI (klik w przycisk). */
  async choose(index: number): Promise<void> {
    await this.page.getByTestId(`dialog-option-${index}`).click({ timeout: 10_000 });
  }

  async closeDialog(): Promise<void> {
    const btn = this.page.getByTestId('dialog-close');
    if (await btn.isVisible()) await btn.click();
    else await this.page.evaluate(`window.__f2game.commands.dialog.close()`);
    await expect(this.page.getByTestId('dialog-screen')).toBeHidden({ timeout: 15_000 });
  }

  /** Zmienna globalna gry (mapowa tablica globalVars aktualnej mapy). */
  async globalVar(i: number): Promise<number> {
    return (await this.page.evaluate(`(window.__f2game.map.globalVars?.[${i}] ?? 0)`)) as number;
  }

  async expectGlobal(i: number, value: number): Promise<void> {
    expect(await this.globalVar(i)).toBe(value);
  }

  async log(): Promise<ScriptLogEntry[]> {
    return (await this.page.evaluate(
      `window.__f2game.scripts.log.map(l => ({kind: l.kind, message: l.message}))`,
    )) as ScriptLogEntry[];
  }

  async vmErrors(): Promise<string[]> {
    return (await this.log()).filter((l) => l.kind === 'vmError').map((l) => l.message);
  }

  /** Unikalne komunikaty "unsupported" z logu. */
  async unsupported(): Promise<string[]> {
    return [
      ...new Set((await this.log()).filter((l) => l.kind === 'unsupported').map((l) => l.message)),
    ].sort();
  }
}

/**
 * Zaakceptowane nieobslugiwane opcody w przebiegu e2e M3 (uzasadnienie: dokumentacja techniczna,
 * sekcja "Zaakceptowane nieobslugiwane w e2e"). Kazdy z nich jest kosmetyczny lub dotyczy walki/animacji (M4+).
 */
export const ACCEPTED_UNSUPPORTED: RegExp[] = [
  /reg_anim/,
  /critter_add_trait/,
  /get_critter_stat/,
  /obj_can_see_obj/,
  /metarule/,
  /obj_lock/,
  /cur_map_index/,
  /critter_state/,
  /mouse_state_flag/,
  /play_gmovie/,
];
