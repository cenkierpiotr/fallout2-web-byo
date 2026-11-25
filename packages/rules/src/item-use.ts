import { removeItem } from './inventory.js';
import { perkRemove, type Perk } from './perks.js';
import {
  DRUG_TABLE,
  ITEM_PARAMS,
  ItemType,
  type DrugProto,
  type GameObject,
  type ItemsContext,
} from './items.js';
import {
  applyStatDeltas,
  type StatDelta,
  type TimedEffectInput,
  type TimedEffectPort,
} from './timed-effects.js';
import type { CritterData } from './types.js';

export interface ItemUseContext extends ItemsContext {
  effects: TimedEffectPort;
}

export interface AppliedEffect {
  stat: number;
  amount: number;
  /** Tick, w ktorym efekt zostanie zastosowany; brak = natychmiast. */
  atTick?: number;
}

export interface UseResult {
  ok: boolean;
  consumed: boolean;
  messageId?: number;
  effects?: AppliedEffect[];
  /** Powod odmowy/pominiecia efektu ('overdose', 'not-usable', ...). */
  reason?: string;
}

/** Planuje efekt czasowy (revert = zmiany statow zastosowane w chwili atTick). */
export function scheduleEffect(
  target: GameObject,
  e: { atTick: number; revert: StatDelta[] },
  ctx: ItemUseContext,
  extra: Partial<Pick<TimedEffectInput, 'drugPid' | 'useId'>> = {},
): void {
  ctx.effects.schedule({
    targetId: target.id,
    atTick: e.atTick,
    kind: 'drug-stage',
    deltas: e.revert,
    drugPid: extra.drugPid ?? -1,
    useId: extra.useId ?? -1,
    addictionIndex: -1,
    withdrawalEffect: -1,
  });
}

function drugEntry(pid: number): (typeof DRUG_TABLE)[number] | undefined {
  return DRUG_TABLE.find((d) => d.drugPid === pid);
}

/** drug_count_ok (0x479ee4): liczba oddzielnych uzyc leku, ktorych efekty sa jeszcze w kolejce. */
function pendingUses(target: GameObject, pid: number, ctx: ItemUseContext): number {
  const ids = new Set<number>();
  for (const e of ctx.effects.pending())
    if (e.targetId === target.id && e.drugPid === pid && e.kind === 'drug-stage') ids.add(e.useId);
  return ids.size;
}

export function isAddicted(target: GameObject, drugPid: number): boolean {
  const idx = drugEntry(drugPid)?.addictionIndex;
  return idx !== undefined && target.addictions[idx] === true;
}

function addictionChance(c: CritterData | undefined, base: number): number {
  let ch = base;
  if (c?.isPlayer) {
    if (c.traits.includes(ITEM_PARAMS.chemReliantTrait)) ch *= 2;
    if (c.traits.includes(ITEM_PARAMS.chemResistantTrait)) ch = Math.trunc(ch / 2);
    if ((c.perkRanks[ITEM_PARAMS.flowerChildPerk] ?? 0) > 0) ch = Math.trunc(ch / 2);
  }
  return ch;
}

/** Rzut uzaleznienia (0x479f60 pkt 5). Zwraca szanse, rzut i czy uzaleznienie nastapilo. */
export function checkAddiction(
  target: GameObject,
  drugProto: DrugProto,
  ctx: ItemUseContext,
): { addicted: boolean; chance: number; roll: number } {
  const entry = drugEntry(drugProto.pid);
  if (!entry || isAddicted(target, drugProto.pid)) return { addicted: false, chance: 0, roll: 0 };
  const chance = addictionChance(target.critter, drugProto.addictionChance);
  const [lo, hi] = ITEM_PARAMS.addictionRollRange as [number, number];
  const roll = ctx.rng.int(lo, hi);
  if (roll > chance) return { addicted: false, chance, roll };
  // Flaga uzaleznienia tylko dla gracza (items.md pkt 5); odstawienie kolejkowane zawsze.
  if (target.critter?.isPlayer) target.addictions[entry.addictionIndex] = true;
  ctx.effects.schedule({
    targetId: target.id,
    atTick: ctx.clock.ticks + drugProto.withdrawalOnset * ITEM_PARAMS.ticksPerMinute,
    kind: 'withdrawal',
    deltas: [],
    drugPid: drugProto.pid,
    useId: -1,
    addictionIndex: entry.addictionIndex,
    withdrawalEffect: drugProto.withdrawalEffect,
  });
  return { addicted: target.critter?.isPlayer === true, chance, roll };
}

/** f2_item_d_take_drug (0x479f60) bez usuwania przedmiotu z inwentarza. */
export function takeDrug(target: GameObject, drugProto: DrugProto, ctx: ItemUseContext): UseResult {
  const c = target.critter;
  if (!c) return { ok: false, consumed: false, reason: 'no-critter' };
  const consumes = ITEM_PARAMS.overdoseConsumesItem;

  if (drugProto.pid === ITEM_PARAMS.antidotePid) {
    const had = Object.keys(target.addictions).length > 0;
    target.addictions = {};
    for (const perk of Object.values(target.withdrawalPerks ?? {})) perkRemove(c, perk as Perk);
    target.withdrawalPerks = {};
    ctx.effects.cancel((e) => e.targetId === target.id && e.kind === 'withdrawal');
    return { ok: true, consumed: true, ...(had ? {} : { reason: 'not-addicted' }) };
  }

  const entry = drugEntry(drugProto.pid);
  if (entry && entry.maxCount !== 0 && pendingUses(target, drugProto.pid, ctx) >= entry.maxCount)
    return { ok: true, consumed: consumes, reason: 'overdose' };

  const effects: AppliedEffect[] = [];
  const stats: number[] = [];
  const [rlo, rhi] = ITEM_PARAMS.randomStatRange as [number, number];
  for (let i = 0; i < 3; i++) {
    let stat = drugProto.statId[i] ?? -1;
    if (stat === ITEM_PARAMS.randomStatId) stat = ctx.rng.int(rlo, rhi);
    stats.push(stat);
    const amount = drugProto.instantAmount[i] ?? 0;
    if (stat < 0 || amount === 0) continue;
    applyStatDeltas(c, [{ stat, amount }], ctx);
    effects.push({ stat, amount });
  }

  const useId = ctx.effects.newUseId();
  const halve = c.isPlayer && c.traits.includes(ITEM_PARAMS.chemResistantTrait);
  const stages: [number, readonly number[]][] = [
    [drugProto.duration1, drugProto.delayed1Amount],
    [drugProto.duration2, drugProto.delayed2Amount],
  ];
  for (const [duration, amounts] of stages) {
    if (amounts.every((a) => a === 0)) continue;
    const minutes = halve ? Math.trunc(duration / 2) : duration;
    const atTick = ctx.clock.ticks + minutes * ITEM_PARAMS.ticksPerMinute;
    const deltas: StatDelta[] = [];
    amounts.forEach((amount, i) => {
      const stat = stats[i] ?? -1;
      if (stat >= 0 && amount !== 0) {
        deltas.push({ stat, amount });
        effects.push({ stat, amount, atTick });
      }
    });
    if (deltas.length > 0)
      scheduleEffect(target, { atTick, revert: deltas }, ctx, { drugPid: drugProto.pid, useId });
  }

  checkAddiction(target, drugProto, ctx);
  return { ok: true, consumed: true, effects };
}

/** Uzycie przedmiotu. Leki: stosuje na `target` (domyslnie uzytkownik) i zuzywa jedna sztuke. */
export function useItem(
  user: GameObject,
  obj: GameObject,
  target: GameObject | null,
  ctx: ItemUseContext,
): UseResult {
  const p = ctx.protos(obj.pid);
  if (p?.type !== ItemType.Drug) return { ok: false, consumed: false, reason: 'not-usable' };
  const r = takeDrug(target ?? user, p, ctx);
  if (r.ok && r.consumed && user.inventory.some((e) => e.obj === obj))
    removeItem(user, obj, 1, ctx);
  return r;
}
