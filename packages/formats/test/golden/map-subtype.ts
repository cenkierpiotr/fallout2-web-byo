import { lstName, parseLst } from '../../src/lst/index.js';
import type { NodeVfs } from '../../../vfs/src/node.js';

/**
 * Buduje synchroniczne subtypeOf(pid) dla parseMap: podtyp = u32 BE pod offsetem 0x20 w .pro
 * (items.lst / scenery.lst, numer linii od 1 = pid & 0xffffff).
 */
export async function buildSubtypeOf(vfs: NodeVfs): Promise<(pid: number) => number> {
  const table = new Map<number, number>();
  for (const [type, dir] of [
    [0, 'items'],
    [2, 'scenery'],
  ] as const) {
    const names = parseLst(await vfs.open(`proto/${dir}/${dir}.lst`)).map(lstName);
    for (let i = 0; i < names.length; i++) {
      const name = names[i]!;
      if (name === '') continue;
      const pro = await vfs.open(`proto/${dir}/${name}`);
      const dv = new DataView(pro.buffer, pro.byteOffset, pro.byteLength);
      table.set(type * 0x1000000 + i + 1, dv.getUint32(0x20, false));
    }
  }
  return (pid) => {
    const v = table.get(pid);
    if (v === undefined) throw new Error(`brak prototypu pid ${pid.toString(16)}`);
    return v;
  };
}
