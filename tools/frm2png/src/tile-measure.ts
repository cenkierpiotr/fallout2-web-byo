import { frmExtensionDirection, parseFrm, parseLst, lstName } from '@f2/formats';
import { openGameFolderNode } from '@f2/vfs/node';

const vfs = await openGameFolderNode(process.argv[2] as string);
const lst = parseLst(await vfs.open('art/tiles/tiles.lst'));
let n = 0,
  full = 0,
  bbox = 0,
  rows = 0;
const K = [2, 3, 4, 6, 9];
const band: number[] = K.map(() => 0);
for (let i = 2; i < lst.length; i++) {
  const name = lst[i] as string;
  const nm = lstName(name);
  try {
    const p = 'art/tiles/' + nm.toLowerCase();
    const frm = parseFrm(
      await vfs.open(p),
      frmExtensionDirection(p) !== undefined
        ? { singleDirection: frmExtensionDirection(p)! }
        : undefined,
    );
    const f = frm.directions[0]![0]!;
    const spans: [number, number][] = [];
    let x0 = 1e9,
      x1 = -1,
      y0 = 1e9,
      y1 = -1,
      r = 0;
    for (let y = 0; y < f.height; y++) {
      let a = -1,
        b = -1;
      for (let x = 0; x < f.width; x++)
        if (f.pixels[y * f.width + x] !== 0) {
          if (a < 0) a = x;
          b = x;
        }
      spans.push([a, b]);
      if (a >= 0) {
        x0 = Math.min(x0, a);
        x1 = Math.max(x1, b);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
        r += b - a + 1;
      }
    }
    if (y1 < 0) {
      n++;
      K.forEach((_, k) => {
        band[k]! += 0;
      });
      full += f.width * f.height;
      continue;
    }
    K.forEach((k, ki) => {
      const h = Math.ceil(f.height / k);
      for (let y = 0; y < f.height; y += h) {
        let a = 1e9,
          b = -1;
        for (let yy = y; yy < Math.min(f.height, y + h); yy++) {
          const sp = spans[yy]!;
          if (sp[0] >= 0) {
            a = Math.min(a, sp[0]);
            b = Math.max(b, sp[1]);
          }
        }
        if (b >= 0) band[ki]! += (b - a + 1) * (Math.min(f.height, y + h) - y);
      }
    });
    n++;
    full += f.width * f.height;
    bbox += (x1 - x0 + 1) * (y1 - y0 + 1);
    rows += r;
  } catch {
    /* brak */
  }
}
console.log({
  n,
  full: full / n,
  bbox: bbox / n,
  rowSpan: rows / n,
  bands: K.map((k, i) => [k, band[i]! / n]),
});
await vfs.close();
