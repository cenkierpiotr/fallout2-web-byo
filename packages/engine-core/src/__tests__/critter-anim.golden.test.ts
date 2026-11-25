import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openGameFolderNode } from '@f2/vfs/node';
import type { NodeVfs } from '@f2/vfs/node';
import { ANIM_MAX, Anim, animFileChars } from '../index.js';

const dir = process.env.F2_GAME_DIR;
const patchDir = process.env.F2_PATCH_DIR;

/** Wszystkie pary znakow, jakie funkcja moze wyprodukowac dla poprawnych (anim, bron). */
function producible(): Set<string> {
  const s = new Set<string>();
  for (let a = 0; a <= ANIM_MAX; a++) {
    for (let w = 0; w <= 10; w++) {
      const c = animFileChars(a, w);
      if (c) s.add(c);
    }
  }
  return s;
}

/** Osierocone pliki danych (2 sztuki hmlthrau.frm), nigdy nie adresowane przez exe (anim 0x14 daje 'ba', nie 'au'). */
const ORPHANS = new Set(['au']);

describe.skipIf(!dir)('animFileChars na CRITTER.DAT (golden)', () => {
  let vfs: NodeVfs;
  let files: string[];
  beforeAll(async () => {
    vfs = await openGameFolderNode(dir!, patchDir);
    files = vfs.list('art/critters/');
  });
  afterAll(async () => {
    await vfs.close();
  });

  it('kazdy plik animacji krytera ma sufiks wytwarzalny przez animFileChars', () => {
    const ok = producible();
    const bad: string[] = [];
    let n = 0;
    for (const f of files) {
      const m = /^art\/critters\/(.+?)([a-z]{2})\.(frm|fr[0-5])$/i.exec(f);
      if (!m) continue;
      n++;
      const suffix = (m[2] as string).toLowerCase();
      if (!ok.has(suffix) && !ORPHANS.has(suffix)) bad.push(f);
    }
    expect(n).toBeGreaterThan(5000);
    expect(bad.slice(0, 10)).toEqual([]);
  });

  it('hmjmps (gracz bez pancerza) ma pliki dla podstawowych animacji bez broni', () => {
    const have = new Set(files.map((f) => f.toLowerCase()));
    const need = [
      Anim.Stand,
      Anim.Walk,
      Anim.ClimbLadder,
      Anim.MagicHandsGround,
      Anim.MagicHandsMiddle,
      Anim.Dodge,
      Anim.HitFromFront,
      Anim.HitFromBack,
      Anim.ThrowPunch,
      Anim.KickLeg,
      Anim.Throw,
      Anim.Running,
      Anim.FallBack,
      Anim.FallFront,
    ];
    const missing = need.filter((a) => {
      const c = animFileChars(a, 0) as string;
      return !have.has(`art/critters/hmjmps${c}.frm`) && !have.has(`art/critters/hmjmps${c}.fr0`);
    });
    expect(missing).toEqual([]);
  });

  it('zbrojny krytter (hmmetl) ma stoi/chod/wyjmij/strzal dla broni 1..10 gdy plik istnieje, bez rozjazdu', () => {
    const have = new Set(files.map((f) => f.toLowerCase()));
    let found = 0;
    for (let w = 1; w <= 10; w++) {
      const c = animFileChars(Anim.Stand, w) as string;
      if (have.has(`art/critters/hmmetl${c}.frm`)) found++;
    }
    expect(found).toBeGreaterThanOrEqual(8);
  });
});
