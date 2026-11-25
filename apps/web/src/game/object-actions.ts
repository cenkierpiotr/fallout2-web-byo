import { hexDistance, type GameObject, type ScriptRuntime } from '@f2/engine-core';
import { REACH_RANGE, isItem } from './inventory-world';
import {
  defaultPush,
  defaultUse,
  hasDefaultUse,
  isChestItem,
  isLiveCritter,
  type DefaultUseDeps,
} from './default-actions';
import type { MenuTarget } from '../screens/map/touch-menu';

const TYPE_ITEM = 0;
const TYPE_CRITTER = 1;
const EQUIP_MASK = 0x07000000;

export interface ObjectActionDeps {
  player(): GameObject;
  scripts(): ScriptRuntime | undefined;
  /** Podniesienie przedmiotu (lub otwarcie pojemnika) po tym, jak skrypt nie nadpisal akcji. */
  pickup?(o: GameObject): { ok: boolean; reason?: string };
  /** Mapa swiata (domyslne drzwi/pojemniki/pchniecie); bez niej tylko akcje skryptowe. */
  map?(): import('@f2/engine-core').GameMap;
  /** Otwarcie pojemnika z mapy (okno lootu). */
  openContainer?: DefaultUseDeps['openContainer'];
  /** Przejscie schodami/drabina do celu zapisanego w proto. */
  travel?: DefaultUseDeps['travel'];
  /** Czy krytyk jest w druzynie gracza (domyslne Pchnij zamienia miejsca). */
  isParty?(o: GameObject): boolean;
}

export interface ActionMessage {
  key: string;
  params?: Record<string, string | number>;
}

export type ObjectActionKind = 'use' | 'pickup' | 'push';

const PROC = { use: 'use_p_proc', pickup: 'pickup_p_proc', push: 'push_p_proc' } as const;

/** Przedmioty gracza mozliwe do uzycia na obiekcie (bez zalozonych i bez pojemnikow z zawartoscia). */
export function usableItems(player: GameObject): GameObject[] {
  return player.inventory.filter((i) => i.type === TYPE_ITEM && (i.flags & EQUIP_MASK) === 0);
}

/** Flagi menu zalezne od obiektu: co pokazac (Use/Pickup/Push/Use item on). */
export function actionFlags(
  obj: GameObject | undefined,
  d: Pick<ObjectActionDeps, 'player' | 'scripts'> & Partial<Pick<ObjectActionDeps, 'isParty'>>,
): Pick<MenuTarget, 'use' | 'pickup' | 'push' | 'useItem'> {
  if (!obj) return {};
  const rt = d.scripts();
  const has = (p: Parameters<ScriptRuntime['hasObjectProc']>[1]): boolean =>
    !!rt && rt.hasObjectProc(obj.id, p);
  const out: Pick<MenuTarget, 'use' | 'pickup' | 'push' | 'useItem'> = {};
  if (isItem(obj) && obj.hex >= 0 && !isChestItem(obj)) out.pickup = true;
  if (has('use_p_proc') || hasDefaultUse(obj)) out.use = true;
  if (
    obj.type === TYPE_CRITTER &&
    obj !== d.player() &&
    (has('push_p_proc') || (isLiveCritter(obj) && !!d.isParty?.(obj)))
  )
    out.push = true;
  if (has('use_obj_on_p_proc') && usableItems(d.player()).length > 0) out.useItem = true;
  return out;
}

export const tooFar = (d: ObjectActionDeps, o: GameObject): boolean =>
  o.elevation !== d.player().elevation || hexDistance(d.player().hex, o.hex) > REACH_RANGE;

/** Look: uruchamia look_at_p_proc; true = skrypt nadpisal domyslny opis (nie pokazuj go). */
export function runLook(obj: GameObject, d: ObjectActionDeps): boolean {
  const r = d.scripts()?.runObjectProc('look_at_p_proc', obj.id, d.player().id);
  return !!r?.overridden;
}

/** Use / Pickup / Push: procedura skryptu, potem akcja domyslna (drzwi, pojemniki, podniesienie, pchniecie). */
export function runObjectAction(
  kind: ObjectActionKind,
  obj: GameObject,
  d: ObjectActionDeps,
): ActionMessage | null {
  if (tooFar(d, obj)) return { key: 'menu.tooFar' };
  const r = d.scripts()?.runObjectProc(PROC[kind], obj.id, d.player().id);
  if (r?.error) return { key: 'menu.scriptError' };
  if (r?.overridden) return null;
  if (kind === 'pickup') {
    const p = d.pickup?.(obj);
    if (p && !p.ok)
      return { key: p.reason === 'too-heavy' ? 'menu.tooHeavy' : 'menu.pickupFailed' };
    return null;
  }
  const map = d.map;
  if (kind === 'use' && map) {
    const dd: DefaultUseDeps = {
      map,
      player: d.player,
      ...(d.openContainer ? { openContainer: d.openContainer } : {}),
      ...(d.travel ? { travel: d.travel } : {}),
    };
    const m = defaultUse(obj, dd);
    if (m !== undefined) return m;
  }
  if (kind === 'push' && map) {
    if (r?.ran) return null;
    return defaultPush(obj, {
      map,
      player: d.player,
      ...(d.isParty ? { isParty: d.isParty } : {}),
    });
  }
  return r?.ran ? null : { key: 'menu.noEffect' };
}

/** Uzycie przedmiotu na obiekcie (use_obj_on_p_proc celu). */
export function runUseItemOn(
  itemId: number,
  obj: GameObject,
  d: ObjectActionDeps,
): ActionMessage | null {
  if (tooFar(d, obj)) return { key: 'menu.tooFar' };
  if (!d.player().inventory.some((i) => i.id === itemId)) return { key: 'menu.noEffect' };
  const r = d.scripts()?.useItemOn(d.player().id, itemId, obj.id);
  if (r?.error) return { key: 'menu.scriptError' };
  return r?.ran ? null : { key: 'menu.noEffect' };
}
