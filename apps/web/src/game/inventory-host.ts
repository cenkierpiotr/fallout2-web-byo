import { parsePal, parseFrm } from '@f2/formats';
import { hexDistance, objectsAt, openGameFile, type GameObject } from '@f2/engine-core';
import type { VirtualFs } from '@f2/vfs';
import type { SpriteUrl } from '@f2/ui';
import { FidResolver } from '../screens/map/fid-path';
import {
  createWorldInventory,
  REACH_RANGE,
  isItem,
  subtypeOf,
  type WorldInventory,
} from './inventory-world';
import { canvasToUrl, createIconSprites } from './icon-sprites';
import { ObjectTextSource, httpPackReader } from './object-text';
import { takeChem } from './chem';
import { fusePrompt, plantFromHost } from './explosive-host';
import type { GameSession } from './game-session';

export interface InventoryHostDeps {
  vfs: VirtualFs;
  locale(): 'pl' | 'en';
  /** Wolane po zmianie stanu (odswiezenie UI / Pip-Boya). */
  onChange?(): void;
  /**
   * Bramka walki dla uzycia chemii (null = poza walka). `canSpend` sprawdza ture gracza i AP,
   * `spend` pobiera AP (po udanym uzyciu), `after` synchronizuje HP/AP walki z arkuszem.
   */
  combatGate?(): { canSpend(): boolean; spend(): void; after(): void } | null;
}

export interface InventoryHost extends WorldInventory {
  sprite: SpriteUrl;
  /**
   * Tap na heks: przedmiot w zasiegu jest podnoszony, pojemnik otwierany; true = obsluzone
   * (poza zasiegiem false: normalny ruch). `opened` ustawione, gdy otwarto pojemnik.
   */
  tapAt(hex: number): { handled: boolean; opened: boolean };
}

const SUBTYPE_CONTAINER = 1;
const ID_BASE = 0x40000000;

/** Inwentarz gry podpiety do sesji: nazwy z pro_item.msg, ikony z FRM (inven), podnoszenie z mapy. */
export function createInventoryHost(session: GameSession, d: InventoryHostDeps): InventoryHost {
  const texts = new ObjectTextSource(d.vfs, { pack: httpPackReader() });
  const names = new Map<number, string>();
  const asked = new Set<number>();
  let nid = ID_BASE;
  const ref: { inv?: WorldInventory } = {};

  const nameOf = (o: GameObject): string | undefined => {
    const hit = names.get(o.pid);
    if (hit !== undefined) return hit;
    if (!asked.has(o.pid)) {
      asked.add(o.pid);
      void texts
        .describe(d.locale(), 0, o.proto.textId)
        .then((t) => {
          if (t?.name) {
            names.set(o.pid, t.name);
            ref.inv?.refresh();
          }
        })
        .catch(() => undefined);
    }
    return undefined;
  };

  const fids = new FidResolver(d.vfs);
  let palette: Uint8Array | null = null;
  let spriteFn: SpriteUrl = () => undefined;
  const ready = (async () => {
    await fids.load();
    palette = parsePal(await openGameFile(d.vfs, 'color.pal')).rgba;
    spriteFn = createIconSprites({
      pathFor: (fid) => fids.pathFor(fid),
      loadFrm: async (p) => parseFrm(await openGameFile(d.vfs, p)),
      paletteRgba: palette,
      toUrl: canvasToUrl,
      onLoaded: () => ref.inv?.refresh(),
    });
    ref.inv?.refresh();
  })().catch(() => undefined);
  void ready;

  const world = session.world;
  const inv = createWorldInventory({
    world,
    sheet: () => session.state.sheet,
    nameOf,
    allocId: () => nid++,
    // rysunek postaci: aktualny FID gracza (Z: oryginal ma tabele pancerz -> postac); brak = ukryty podglad
    paperdollFid: () => world.player.fid,
    useDrug: (o) => {
      const gate = d.combatGate?.() ?? null;
      if (gate && !gate.canSpend()) return { ok: false, reason: 'no-ap' };
      const r = takeChem(session.chemEnv(), o.pid, o.proto.kind === 'item' ? o.proto.data : []);
      if (!r.ok) return { ok: false, reason: r.reason === 'dead' ? 'dead' : 'not-usable' };
      if (gate) {
        gate.spend();
        gate.after();
      }
      return { ok: true, consumed: true };
    },
    useExplosive: (o, takeOne) => {
      const gate = d.combatGate?.() ?? null;
      if (gate && !gate.canSpend()) return { ok: false, reason: 'no-ap' };
      fusePrompt.value = {
        itemId: o.id,
        onConfirm: (seconds) => {
          fusePrompt.value = null;
          // jedna sztuka ze stosu; zamiast wlasnego id stosu planujemy wybuch dla wydzielonej sztuki
          const one = takeOne();
          const r = plantFromHost(session, one.id, seconds);
          if (r.ok && gate) {
            gate.spend();
            gate.after();
          }
          d.onChange?.();
        },
      };
      return { ok: true };
    },
    ...(d.onChange ? { onChange: d.onChange } : {}),
  });
  ref.inv = inv;

  const tapAt = (hex: number): { handled: boolean; opened: boolean } => {
    const p = world.player;
    if (hexDistance(p.hex, hex) > REACH_RANGE) return { handled: false, opened: false };
    const o = objectsAt(world.map, p.elevation, hex).find((x) => x !== p && !x.hidden && isItem(x));
    if (!o) return { handled: false, opened: false };
    if (subtypeOf(o) === SUBTYPE_CONTAINER) {
      const r = inv.openContainer(o);
      return { handled: r.ok, opened: r.ok };
    }
    return { handled: inv.pickup(o).ok, opened: false };
  };

  return { ...inv, sprite: (fid) => spriteFn(fid), tapAt };
}
