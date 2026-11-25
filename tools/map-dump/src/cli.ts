import { writeSync } from 'node:fs';
import {
  buildMapGolden,
  buildSubtypeOf,
  listVariants,
  openGame,
  parseMapBytes,
  stringifyGolden,
} from './lib.js';

function usage(): never {
  process.stderr.write('uzycie: map-dump <MAP|sciezka maps/x.map> [--json] | map-dump --golden\n');
  process.exit(2);
}

function out(s: string): void {
  writeSync(1, s);
}

async function run(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0) usage();
  const golden = args.includes('--golden');
  const json = args.includes('--json');
  const name = args.find((a) => !a.startsWith('--'));
  const vfs = await openGame();
  try {
    if (golden) {
      out(stringifyGolden(await buildMapGolden(vfs)));
      return;
    }
    if (!name) usage();
    let path = name.toLowerCase().replace(/^data\//, '');
    if (!path.includes('/')) path = `maps/${path}`;
    if (!path.endsWith('.map')) path += '.map';
    const variants = listVariants(vfs, 'maps/', '.map').filter((v) => v.path === path);
    const v = variants[0] && variants.reduce((a, b) => (b.layer < a.layer ? b : a));
    if (!v) throw new Error(`nie znaleziono mapy ${path}`);
    const m = parseMapBytes(await vfs.layers[v.layer]!.open(v.key), await buildSubtypeOf(vfs));
    const summary = {
      layer: v.layerName,
      header: m.header,
      objectCounts: m.objects.map((o) => o.length),
      scripts: m.scripts.length,
      endOffset: m.endOffset,
    };
    if (json) out(`${JSON.stringify(summary, null, 2)}\n`);
    else {
      out(`${path} (warstwa ${v.layerName})\n`);
      for (const [k, val] of Object.entries(m.header)) out(`  ${k}: ${String(val)}\n`);
      out(`  obiekty: ${summary.objectCounts.join('/')}, skrypty: ${summary.scripts}\n`);
    }
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
