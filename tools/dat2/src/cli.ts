import { writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { nodeFileSource } from '@f2/vfs/node';
import type { NodeFileSource } from '@f2/vfs/node';
import { extractDat, listDat } from './commands.js';

const USAGE = 'uzycie: dat2 list <plik.dat> | dat2 extract <plik.dat> <nazwa> [-o <out>]\n';

function usage(): never {
  process.stderr.write(USAGE);
  process.exit(2);
}

async function run(): Promise<void> {
  const [cmd, datPath, name, ...rest] = process.argv.slice(2);
  if (!datPath) usage();
  let src: NodeFileSource | undefined;
  try {
    if (cmd === 'list') {
      if (name !== undefined) usage();
      src = await nodeFileSource(datPath);
      const { lines, summary } = await listDat(src);
      process.stdout.write(lines.concat(summary).join('\n') + '\n');
    } else if (cmd === 'extract') {
      if (!name) usage();
      let out = basename(name.replace(/\\/g, '/'));
      if (rest.length === 2 && rest[0] === '-o') out = rest[1]!;
      else if (rest.length !== 0) usage();
      src = await nodeFileSource(datPath);
      const data = await extractDat(src, name);
      await writeFile(out, data);
      process.stderr.write(`zapisano ${data.length} B do ${out}\n`);
    } else {
      usage();
    }
  } finally {
    await src?.close();
  }
}

run().catch((e: unknown) => {
  process.stderr.write(`blad: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
