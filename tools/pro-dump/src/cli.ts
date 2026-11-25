import { readFileSync, writeSync } from 'node:fs';
import { parseProto } from '@f2/formats';
import {
  buildProGolden,
  loadLst,
  openGame,
  openGameFile,
  PROTO_DIRS,
  stringifyGolden,
} from '../../map-dump/src/lib.js';

function usage(): never {
  process.stderr.write(
    'uzycie: pro-dump <pid (0x01000001 lub dziesietnie)|plik.pro> | pro-dump --golden\n',
  );
  process.exit(2);
}

const out = (s: string): void => {
  writeSync(1, s);
};

async function run(): Promise<void> {
  const arg = process.argv[2];
  if (!arg) usage();
  if (arg === '--golden') {
    const vfs = await openGame();
    try {
      out(stringifyGolden(await buildProGolden(vfs)));
    } finally {
      await vfs.close();
    }
    return;
  }
  let bytes: Uint8Array;
  if (/^(0x[0-9a-f]+|\d+)$/i.test(arg)) {
    const pid = Number(arg) >>> 0;
    const type = pid >>> 24;
    const idx = pid & 0xffffff;
    const vfs = await openGame();
    try {
      const name = (await loadLst(vfs, type))[idx - 1];
      if (!name) throw new Error(`brak pid ${arg} w lst`);
      bytes = await openGameFile(vfs, `proto/${PROTO_DIRS[type]}/${name}`);
    } finally {
      await vfs.close();
    }
  } else bytes = new Uint8Array(readFileSync(arg));
  const p = parseProto(bytes);
  out(
    `${JSON.stringify(p, (_k, v: unknown) => (ArrayBuffer.isView(v) ? Array.from(v as unknown as ArrayLike<number>) : v), 2)}\n`,
  );
}

run().then(
  () => process.exit(0),
  (e: unknown) => {
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  },
);
