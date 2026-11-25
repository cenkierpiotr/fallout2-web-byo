import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { openGameFolderNode } from '@f2/vfs/node';
import { collectInventory } from './inventory.js';
import { renderReport } from './report.js';

function usage(): never {
  process.stderr.write('uzycie: inventory <gameDir> [--patch <dir>] -o <plik.md>\n');
  process.exit(2);
}

async function run(): Promise<void> {
  const args = process.argv.slice(2);
  const gameDir = args.shift();
  if (!gameDir) usage();
  let patch: string | undefined;
  let out: string | undefined;
  while (args.length > 0) {
    const flag = args.shift();
    const val = args.shift();
    if (val === undefined) usage();
    if (flag === '--patch') patch = val;
    else if (flag === '-o') out = val;
    else usage();
  }
  if (!out) usage();
  const vfs = await openGameFolderNode(gameDir, patch);
  let errors = 0;
  let stats;
  try {
    stats = await collectInventory(vfs.layers, (name, msg) => {
      errors++;
      process.stderr.write(`blad: ${name}: ${msg}\n`);
    });
  } finally {
    await vfs.close();
  }
  const sources = vfs.layers.map((l) => l.name);
  const md = renderReport(stats, { date: new Date().toISOString().slice(0, 10), sources });
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, md);
  process.stderr.write(`zapisano ${out} (${stats.length} kategorii, ${errors} bledow)\n`);
}

run().then(
  () => process.exit(0),
  (e: unknown) => {
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  },
);
