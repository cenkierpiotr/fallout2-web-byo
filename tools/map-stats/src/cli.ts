import { writeSync } from 'node:fs';
import {
  buildSubtypeOf,
  listVariants,
  loadLst,
  openGame,
  parseMapBytes,
} from '../../map-dump/src/lib.js';
import { countCritters, renderStats } from './stats.js';

async function run(): Promise<void> {
  const top = Number(process.argv[2] ?? 20);
  const vfs = await openGame();
  try {
    const subtypeOf = await buildSubtypeOf(vfs);
    // jeden wariant na sciezke: warstwa o najnizszym indeksie (najwyzszy priorytet)
    const best = new Map<string, ReturnType<typeof listVariants>[number]>();
    for (const v of listVariants(vfs, 'maps/', '.map')) {
      const cur = best.get(v.path);
      if (!cur || v.layer < cur.layer) best.set(v.path, v);
    }
    const perMap = new Map<string, number[]>();
    for (const [path, v] of best) {
      const m = parseMapBytes(await vfs.layers[v.layer]!.open(v.key), subtypeOf);
      perMap.set(
        path,
        m.objects.flat().map((o) => o.pid),
      );
    }
    const stats = countCritters(perMap);
    const lst = await loadLst(vfs, 1);
    const names = new Map(stats.map((s) => [s.pid, lst[(s.pid & 0xffffff) - 1] ?? '']));
    writeSync(
      1,
      renderStats(stats, names, {
        maps: best.size,
        top,
        date: new Date().toISOString().slice(0, 10),
      }),
    );
  } finally {
    await vfs.close();
  }
}

run().then(
  () => process.exit(0),
  (e: unknown) => {
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  },
);
