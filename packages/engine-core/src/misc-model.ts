import type { GameObject } from './game-object.js';
import { DOOR_LOCKED_BIT, DOOR_OPEN_BIT, isDoor, isDoorLocked, isDoorOpen } from './doors.js';

const FLAG_HIDDEN = 0x1;
const FLAG_NO_BLOCK = 0x10;
const TYPE_CRITTER = 1;

/** set_obj_visibility: bit Hidden; dla krytera dodatkowo NoBlock (jak w handlerze 0x45741c). */
export function setObjHidden(obj: GameObject, hide: boolean): void {
  if (hide) {
    if (obj.flags & FLAG_HIDDEN) return;
    obj.flags |= FLAG_HIDDEN;
    if (obj.type === TYPE_CRITTER) obj.flags |= FLAG_NO_BLOCK;
  } else {
    if (!(obj.flags & FLAG_HIDDEN)) return;
    obj.flags &= ~FLAG_HIDDEN;
    if (obj.type === TYPE_CRITTER) obj.flags &= ~FLAG_NO_BLOCK;
  }
}

function bits(obj: GameObject): Int32Array | undefined {
  if (!isDoor(obj) || obj.extra.kind !== 'door') return undefined;
  if (obj.extra.raw.length === 0) obj.extra.raw = new Int32Array(1);
  return obj.extra.raw;
}

export function setObjLocked(obj: GameObject, locked: boolean): void {
  const r = bits(obj);
  if (!r) return;
  r[0] = locked ? (r[0] ?? 0) | DOOR_LOCKED_BIT : (r[0] ?? 0) & ~DOOR_LOCKED_BIT;
}

export const objIsLocked = (obj: GameObject): number => (isDoorLocked(obj) ? 1 : 0);
export const objIsOpen = (obj: GameObject): number => (isDoorOpen(obj) ? 1 : 0);

/** obj_open / obj_close: ustawia bit otwarcia, klatke i NoBlock (zamek nie blokuje skryptu). */
export function setObjOpen(obj: GameObject, open: boolean): void {
  const r = bits(obj);
  if (!r) return;
  if (open) {
    r[0] = (r[0] ?? 0) | DOOR_OPEN_BIT;
    obj.frame = 1;
    obj.flags |= FLAG_NO_BLOCK;
  } else {
    r[0] = (r[0] ?? 0) & ~DOOR_OPEN_BIT;
    obj.frame = 0;
    obj.flags &= ~FLAG_NO_BLOCK;
  }
}
