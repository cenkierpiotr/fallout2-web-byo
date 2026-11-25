import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { frameToRgba, frmExtensionDirection, parseFrm, parsePal } from '@f2/formats';
import { openGameFolderNode } from '@f2/vfs/node';
import type { VirtualFs } from '@f2/vfs';
import { encodePng } from './png.js';
import { renderSheet } from './render.js';

const USAGE =
  'uzycie: frm2png <gameDir> <sciezkaWDat> -o out.png [--dir N] [--pal color.pal]\n' +
  '        frm2png <gameDir> --write-golden <plik.json>\n';

const GOLDEN_FILES = [
  'art/tiles/edg1001.frm',
  'art/intrface/iface.frm',
  'art/critters/hmjmpsaa.frm',
  'art/critters/hmjmpsab.frm',
  'art/critters/hapowrba.fr0',
  'art/scenery/brndor01.frm',
  'art/scenery/acavedr4.frm',
  'art/inven/firewood.frm',
  'art/intrface/msef000.frm',
  'art/intrface/egg.frm',
  'art/tiles/grid000.frm',
  'art/backgrnd/back1.frm',
];

function usage(): never {
  process.stderr.write(USAGE);
  process.exit(2);
}

async function loadFrm(vfs: VirtualFs, path: string) {
  const single = frmExtensionDirection(path);
  return parseFrm(
    await vfs.open(path),
    single !== undefined ? { singleDirection: single } : undefined,
  );
}

async function run(): Promise<void> {
  const args = process.argv.slice(2);
  const [gameDir, ...rest] = args;
  if (!gameDir) usage();
  const vfs = await openGameFolderNode(gameDir);
  try {
    await runWith(vfs, rest);
  } finally {
    await vfs.close();
  }
}

async function runWith(vfs: VirtualFs, rest: string[]): Promise<void> {
  const palPath = (): string => {
    const i = rest.indexOf('--pal');
    return i >= 0 ? (rest[i + 1] ?? usage()) : 'color.pal';
  };
  const pal = parsePal(await vfs.open(palPath()));
  if (rest[0] === '--write-golden') {
    const out = rest[1] ?? usage();
    const golden: Record<string, unknown> = {};
    for (const path of GOLDEN_FILES) {
      const frm = await loadFrm(vfs, path);
      const frame = frm.directions[frmExtensionDirection(path) ?? 0]![0]!;
      const rgba = frameToRgba(frame, pal.rgba);
      golden[`${vfs.resolve(path)!.name}/${path}`] = {
        sha256: createHash('sha256').update(rgba).digest('hex'),
        width: frame.width,
        height: frame.height,
        fps: frm.fps,
        framesPerDirection: frm.framesPerDirection,
        distinctDirections: frm.distinctDirections,
      };
    }
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, JSON.stringify(golden, null, 2) + '\n');
    process.stderr.write(`zapisano ${GOLDEN_FILES.length} wpisow do ${out}\n`);
    return;
  }
  const path = rest[0];
  if (!path || path.startsWith('-')) usage();
  const oi = rest.indexOf('-o');
  const out = oi >= 0 ? rest[oi + 1] : undefined;
  if (!out) usage();
  const di = rest.indexOf('--dir');
  const dir = di >= 0 ? Number(rest[di + 1]) : (frmExtensionDirection(path) ?? 0);
  const frm = await loadFrm(vfs, path);
  const sheet = renderSheet(frm, pal, dir);
  await writeFile(out, encodePng(sheet.rgba, sheet.width, sheet.height));
  process.stderr.write(`zapisano ${sheet.width}x${sheet.height} do ${out}\n`);
}

run().catch((e: unknown) => {
  process.stderr.write(`blad: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
