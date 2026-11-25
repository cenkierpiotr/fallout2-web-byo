import { expForLevel } from '@f2/rules';
import type { Batch4Hooks } from '@f2/vm';
import type { GameMap } from './game-map.js';
import { moveObject } from './game-map.js';
import type { GameObject } from './game-object.js';
import type { InventoryModel } from './inventory-model.js';
import {
  critterHeal,
  critterInjure,
  critterIsFleeing,
  critterSetFlee,
  critterState,
} from './critter-model.js';

export interface Batch4Deps {
  obj(id: number): GameObject | undefined;
  currentMap(): GameMap;
  inventory: InventoryModel;
  /** Doswiadczenie PC (stat 2). */
  experience(): number;
}

/** Statystyka maksymalnych HP w protach krytera (indeks 7, Z: wg tabeli STAT_*). */
const STAT_MAX_HP = 7;
const NO_LIMIT = 9999;

/** Implementacja portu `Batch4Hooks` (host `ScriptRuntime` tylko deleguje). */
export class Batch4Model implements Batch4Hooks {
  /** Zadane animacje (efekt wizualny po stronie renderu; M3 tylko zapisuje). */
  readonly animations: { id: number; code: number; arg: number }[] = [];
  /** Statystyki PC bez dedykowanego modelu: 0 pkt umiejetnosci, 3 reputacja, 4 karma. */
  readonly pcStats = new Map<number, number>();

  constructor(private readonly deps: Batch4Deps) {}

  maxHp(o: GameObject): number {
    const p = o.proto as GameObject['proto'] | undefined;
    return p?.kind === 'critter'
      ? (p.baseStats[STAT_MAX_HP] ?? 0) + (p.bonusStats[STAT_MAX_HP] ?? 0) || NO_LIMIT
      : NO_LIMIT;
  }
  critterHeal(id: number, amount: number): number {
    const o = this.deps.obj(id);
    return o ? critterHeal(o, amount, this.maxHp(o)) : -1;
  }
  critterState(id: number): number {
    const o = this.deps.obj(id);
    return o ? critterState(o) : -1;
  }
  critterIsFleeing(id: number): number {
    const o = this.deps.obj(id);
    return o ? critterIsFleeing(o) : -1;
  }
  critterSetFleeState(id: number, on: boolean): void {
    const o = this.deps.obj(id);
    if (o) critterSetFlee(o, on);
  }
  critterInjure(id: number, flags: number, clear: boolean): void {
    const o = this.deps.obj(id);
    if (o) critterInjure(o, flags, clear);
  }
  pcStat(stat: number): number {
    if (stat === 2) return this.deps.experience();
    if (stat === 1) {
      // poziom PC (get_pc_stat 1): najwyzszy L z exp_for_level(L) <= XP (0x4af9a8), jak petla awansu 0x4afaa8
      const xp = this.deps.experience();
      let level = 1;
      for (;;) {
        const need = expForLevel(level + 1);
        if (need < 0 || xp < need) return level;
        level += 1;
      }
    }
    return this.pcStats.get(stat) ?? 0;
  }
  moveInventory(from: number, to: number): void {
    const src = this.deps.obj(from);
    // 0x45409c: trzymane/zalozone przedmioty najpierw zdejmowane ze zrodla (addObjToInven odrzuca juz trzymane)
    if (src)
      for (const it of [...src.inventory]) {
        this.deps.inventory.rmObjFromInven(from, it.id);
        this.deps.inventory.addObjToInven(to, it.id);
      }
  }
  attemptPlacement(id: number, tile: number, elevation: number): number {
    const o = this.deps.obj(id);
    if (!o || elevation < 0 || elevation > 2) return -1;
    // oryginal (0x49d4d4) szuka najblizszego wolnego kafla; M3 stawia dokladnie na `tile` (Z)
    moveObject(this.deps.currentMap(), o, tile, elevation);
    return 0;
  }
  animate(id: number, code: number, arg: number): void {
    this.animations.push({ id, code, arg });
    if (this.animations.length > 256) this.animations.shift();
  }
}
