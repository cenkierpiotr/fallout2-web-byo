import { fail, isDoor, ok, toggleDoor, type Result } from './doors.js';
import { exitGridAt } from './exit-grid.js';
import type { ExitGrid, GameMap } from './game-map.js';
import { indexObject, isHexBlocked, moveObject } from './game-map.js';
import type { GameClock } from './game-clock.js';
import type { GameObject } from './game-object.js';
import type { GameView } from './game-view.js';
import { HEX_COUNT } from './hexgrid.js';
import type { Hex } from './hexgrid.js';
import { findPath, isPassableFor } from './pathfinding.js';
import type { MovementSystem } from './movement.js';
import { DEFAULT_RULES, type Rules } from './rules.js';
import type { ScriptRuntime } from './script-runtime.js';

export interface World {
  map: GameMap;
  player: GameObject;
  clock: GameClock;
  movement: MovementSystem;
  loader: { load(mapName: string): Promise<GameMap> };
  view: GameView;
  rules?: Rules;
  /** Opcjonalne skrypty (M3): ladowanie przy travelTo, tick w update, talkTo i dialog. */
  scripts?: ScriptRuntime;
  /** Reguly ruchu gracza (0x41405c): false gdy bieg ma zejsc do chodu (skradanie bez Silent Running). */
  playerMayRun?: () => boolean;
}

export class GameCommands {
  constructor(private readonly world: World) {}

  private syncView(): void {
    const { player, view, map } = this.world;
    view.player.value = {
      hex: player.hex,
      elevation: player.elevation,
      moving: this.world.movement.stateOf(player) !== undefined,
    };
    view.currentMap.value = { name: map.name, elevation: player.elevation };
  }

  moveTo(hex: Hex, run = false): Result {
    const { map, player, movement } = this.world;
    if (!Number.isInteger(hex) || hex < 0 || hex >= HEX_COUNT) return fail('outOfMap');
    if (hex === player.hex) return fail('sameHex');
    if (movement.stateOf(player)) return fail('busy');
    // zablokowany cel dopuszczamy tylko gdy to przechodnie drzwi
    const doorPolicy = movement.doorPolicy;
    if (!isPassableFor(map, player.elevation, hex, player, doorPolicy)) return fail('blocked');
    const path = findPath(map, player.elevation, player.hex, hex, player, {
      rules: this.world.rules ?? DEFAULT_RULES,
      doorPolicy,
    });
    if (!path || path.length === 0) return fail('noPath');
    const r = movement.start(player, path, run && (this.world.playerMayRun?.() ?? true));
    this.syncView();
    return r;
  }

  /** Uzycie obiektu: drzwi sa przelaczane; zamkniete na klucz 'blocked'; reszta 'noPath' (M3). */
  useObject(id: number): Result {
    const obj = this.world.map.objects.find((o) => o.id === id);
    if (!obj || !isDoor(obj)) return fail('noPath');
    return toggleDoor(this.world.map, obj);
  }

  setElevation(e: 0 | 1 | 2): Result {
    const { map, player, movement } = this.world;
    if (movement.stateOf(player)) return fail('busy');
    if (e !== 0 && e !== 1 && e !== 2) return fail('outOfMap');
    if (!map.tiles[e]) return fail('outOfMap');
    if (e === player.elevation) return fail('sameHex');
    if (isHexBlocked(map, e, player.hex, player)) return fail('blocked');
    moveObject(map, player, player.hex, e);
    this.syncView();
    return ok();
  }

  async travelTo(mapName: string, hex?: Hex, elevation?: number): Promise<Result> {
    const w = this.world;
    let next: GameMap;
    try {
      next = await w.loader.load(mapName);
    } catch {
      return fail('outOfMap');
    }
    const h = hex ?? next.header.playerHex;
    const el = (elevation ?? next.header.playerElevation) as 0 | 1 | 2;
    if (!Number.isInteger(h) || h < 0 || h >= HEX_COUNT || ![0, 1, 2].includes(el)) {
      return fail('outOfMap');
    }
    w.movement.cancel(w.player);
    moveObject(w.map, w.player, -1);
    w.map.objects = w.map.objects.filter((o) => o !== w.player);
    w.player.hex = h;
    w.player.elevation = el;
    w.player.rotation = (next.header.playerOrientation % 6) as GameObject['rotation'];
    next.objects.push(w.player);
    indexObject(next, w.player);
    w.map = next;
    w.movement.setMap(next);
    this.syncView();
    if (w.scripts) await w.scripts.loadScriptsForMap(next);
    return ok();
  }

  /** Rozmowa z NPC: uruchamia talk_p_proc; stan w GameView.dialog. */
  talkTo(id: number): Result {
    const s = this.world.scripts;
    return s ? s.talkTo(id) : fail('noScript');
  }

  readonly dialog = {
    choose: (index: number): Result => {
      const s = this.world.scripts;
      return s ? s.dialogChoose(index) : fail('noDialog');
    },
    close: (): Result => {
      const s = this.world.scripts;
      return s ? s.dialogClose() : fail('noDialog');
    },
  };

  /**
   * Krok symulacji: przesuwa zegar i gracza. Gdy gracz wchodzi na exit grid, zwraca go
   * (obsluga przejscia, w tym destMap -1/-2, nalezy do wywolujacego; spec sekcja 5).
   */
  update(dtTicks: number): { exit?: ExitGrid } {
    const w = this.world;
    w.clock.advance(dtTicks);
    const r = w.movement.tick(w.player, dtTicks);
    w.scripts?.tick(dtTicks);
    this.syncView();
    if (r.enteredHex !== undefined) {
      const eg = exitGridAt(w.map, w.player.elevation, r.enteredHex);
      if (eg) {
        w.movement.cancel(w.player);
        this.syncView();
        return { exit: eg };
      }
    }
    return {};
  }
}
