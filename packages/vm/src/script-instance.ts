import { ScriptInstance as VmInstance, type IntScriptLike } from './interpreter.js';

/**
 * Wpis rejestru Schedulera: instancja VM plus metadane gry (brief Z29).
 * Odchylenie od briefu: stan zawieszenia (`suspended`) trzyma sama instancja VM (state/pc/stack),
 * wiec nie ma osobnego pola. Instancja VM to klasa `ScriptInstance` z interpreter.ts.
 */
export interface ScriptEntry {
  sid: number;
  script: IntScriptLike;
  /** Id obiektu wlasciciela (self_obj) lub -1 dla skryptu mapy. */
  ownerObjectId: number;
  localVars: Int32Array;
  fixedParam: number;
  sourceObj: number;
  targetObj: number;
  actionBeingUsed: number;
  instance: VmInstance;
  /** Czy `start` zostal juz uruchomiony. */
  started: boolean;
  /** Potomek czeka na pierwsze uruchomienie `start` (dodany przez adopt). */
  pendingStart: boolean;
}

export interface NewEntry {
  sid: number;
  script: IntScriptLike;
  ownerObjectId?: number;
  localVarCount?: number;
  /** Gotowa instancja VM (np. potomek z Hooks.execScript); domyslnie nowa. */
  instance?: VmInstance;
}

export function createEntry(o: NewEntry): ScriptEntry {
  const owner = o.ownerObjectId ?? -1;
  return {
    sid: o.sid,
    script: o.script,
    ownerObjectId: owner,
    localVars: new Int32Array(o.localVarCount ?? 0),
    fixedParam: 0,
    sourceObj: 0,
    targetObj: 0,
    actionBeingUsed: -1,
    instance: o.instance ?? new VmInstance(o.script, owner === -1 ? 0 : owner),
    started: false,
    pendingStart: false,
  };
}
