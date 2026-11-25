import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { describe, expect, it } from 'vitest';
import { frmExtensionDirection, parseFrm } from '../../src/frm/index.js';
import { frameToRgba } from '../../src/frm/to-rgba.js';
import { lstName, parseLst } from '../../src/lst/index.js';
import { parsePal } from '../../src/pal/index.js';
import { openGameFolderNode } from '../../../vfs/src/node.js';

const dir = process.env.F2_GAME_DIR;
const patchDir = process.env.F2_PATCH_DIR;
const reportMd = process.env.F2_ART_REPORT_MD;

/** Katalogi art/ z listami (fid.md); `new.lst` to dodatkowe listy MASTER (items/scenery/walls/inven). */
const ART_DIRS = [
  'items',
  'critters',
  'scenery',
  'walls',
  'tiles',
  'misc',
  'intrface',
  'inven',
  'heads',
  'backgrnd',
  'skilldex',
] as const;
const FRM_RE = /\.(frm|fr[0-5])$/i;

interface DirStat {
  dir: string;
  lstEntries: number;
  lstMissing: string[]; // wpis listy bez pliku
  files: number;
  decoded: number;
  errors: { path: string; message: string }[];
  orphans: string[]; // plik FRM bez wpisu w liscie
  zeroSize: string[]; // klatki o wymiarze 0
}

function critterBase(path: string): string {
  return path.slice('art/critters/'.length, 'art/critters/'.length + 6);
}

async function analyse(
  patch: boolean,
): Promise<{ stats: DirStat[]; pals: string[]; palErrors: string[]; fromOverlay: number }> {
  const vfs = await openGameFolderNode(dir!, patch && patchDir ? patchDir : undefined);
  try {
    const colorPal = parsePal(await vfs.open('color.pal'));
    const stats: DirStat[] = [];
    let fromOverlay = 0;
    for (const d of ART_DIRS) {
      const prefix = `art/${d}/`;
      const allFiles = vfs.list(prefix);
      const bases = new Set<string>();
      for (const p of allFiles)
        if (FRM_RE.test(p)) bases.add(p.slice(prefix.length, prefix.length + 6));
      // wpis heads/critters (np. `mrcus`, `hmjmps`) = prefiks nazwy pliku (do 6 znakow)
      const hasBase = (base: string): boolean =>
        d === 'critters'
          ? bases.has(base)
          : allFiles.some((p) => p.startsWith(prefix + base) && FRM_RE.test(p));
      const listFiles = allFiles.filter((p) => p.endsWith('.lst'));
      const entries = new Set<string>();
      let lstEntries = 0;
      const lstMissing: string[] = [];
      for (const lf of listFiles) {
        const lines = parseLst(await vfs.open(lf)).map(lstName);
        lstEntries += lines.length;
        for (const name of lines) {
          if (name === '') continue;
          if (d === 'critters') {
            // wpis = baza 6 znakow; pliki to baza + 2 znaki animacji
            const base = name.toLowerCase();
            entries.add(base);
            if (!hasBase(base)) lstMissing.push(name);
          } else if (d === 'heads') {
            const base = name.toLowerCase();
            entries.add(base);
            if (!hasBase(base)) lstMissing.push(name);
          } else {
            const f = (prefix + name).toLowerCase();
            entries.add(f);
            if (!vfs.resolve(f)) lstMissing.push(name);
          }
        }
      }
      const headsEntries = [...entries];
      const frms = allFiles.filter((p) => FRM_RE.test(p));
      const errors: DirStat['errors'] = [];
      const orphans: string[] = [];
      const zeroSize: string[] = [];
      let decoded = 0;
      for (const p of frms) {
        const referenced =
          d === 'critters'
            ? entries.has(critterBase(p))
            : d === 'heads'
              ? headsEntries.some((b) => p.startsWith(prefix + b))
              : entries.has(p);
        if (!referenced) orphans.push(p);
        if (vfs.resolve(p)?.name === 'overlay') fromOverlay++;
        try {
          const single = frmExtensionDirection(p);
          const frm = parseFrm(
            await vfs.open(p),
            single !== undefined ? { singleDirection: single } : undefined,
          );
          const dirs =
            single !== undefined
              ? [single]
              : [...Array(frm.distinctDirections === 1 ? 1 : 6).keys()];
          for (const di of dirs) {
            const frames = frm.directions[di]!;
            if (frames.length !== frm.framesPerDirection)
              throw new Error(`kierunek ${di}: ${frames.length} klatek`);
            for (const fr of frames) {
              if (fr.width === 0 || fr.height === 0) zeroSize.push(p);
              frameToRgba(fr, colorPal.rgba);
            }
          }
          decoded++;
        } catch (e) {
          errors.push({ path: p, message: e instanceof Error ? e.message : String(e) });
        }
      }
      stats.push({
        dir: d,
        lstEntries,
        lstMissing,
        files: frms.length,
        decoded,
        errors,
        orphans,
        zeroSize,
      });
    }
    const pals = vfs.list('art/').filter((p) => p.endsWith('.pal'));
    pals.push('color.pal');
    const palErrors: string[] = [];
    for (const p of pals) {
      try {
        parsePal(await vfs.open(p));
      } catch (e) {
        palErrors.push(`${p}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return { stats, pals, palErrors, fromOverlay };
  } finally {
    await vfs.close();
  }
}

function md(title: string, r: Awaited<ReturnType<typeof analyse>>): string {
  const out = [
    `## ${title}`,
    '',
    '| katalog | wpisy lst | pliki FRM | zdekodowane | bledy | wpisy bez pliku | pliki bez wpisu | klatki 0x0 |',
    '|---|---|---|---|---|---|---|---|',
  ];
  for (const s of r.stats) {
    out.push(
      `| ${s.dir} | ${s.lstEntries} | ${s.files} | ${s.decoded} | ${s.errors.length} | ${s.lstMissing.length} | ${s.orphans.length} | ${new Set(s.zeroSize).size} |`,
    );
  }
  const lines = (label: string, xs: string[]): void => {
    if (xs.length === 0) return;
    out.push('', `${label} (${xs.length}):`, '', ...xs.slice(0, 40).map((x) => `- \`${x}\``));
    if (xs.length > 40) out.push(`- ... (+${xs.length - 40})`);
  };
  for (const s of r.stats) {
    lines(
      `${s.dir}: bledy dekodowania`,
      s.errors.map((e) => `${e.path}: ${e.message}`),
    );
    lines(`${s.dir}: wpisy listy bez pliku`, s.lstMissing);
    lines(`${s.dir}: pliki bez wpisu w liscie`, s.orphans);
    lines(`${s.dir}: klatki 0x0`, [...new Set(s.zeroSize)]);
  }
  out.push(
    '',
    `Pliki FRM serwowane z nakladki: ${r.fromOverlay}`,
    '',
    `PAL: ${r.pals.length} plikow, bledy: ${r.palErrors.length}`,
  );
  for (const e of r.palErrors) out.push(`- ${e}`);
  return out.join('\n');
}

describe.skipIf(!dir)('art coverage: wszystkie FRM z art/*.lst', () => {
  it(
    'MASTER+CRITTER (vanilla): zero bledow dekodowania, lista a pliki',
    { timeout: 600_000 },
    async () => {
      const r = await analyse(false);
      let text =
        `# Pokrycie grafik art/ (FRM/PAL/LST)\n\nData: ${new Date().toISOString().slice(0, 10)}. Test: \`packages/formats/test/golden/art-coverage.test.ts\` (F2_GAME_DIR, opcjonalnie F2_PATCH_DIR, raport przez F2_ART_REPORT_MD).\n\n` +
        md('Vanilla (MASTER+CRITTER)', r);
      if (patchDir) {
        const p = await analyse(true);
        text += '\n\n' + md('Vanilla + unofficial patch (nakladka DATA)', p);
        expect(p.stats.flatMap((s) => s.errors)).toEqual([]);
        expect(p.fromOverlay, 'nakladka patcha aktywna').toBeGreaterThan(0);
      }
      if (reportMd) {
        await mkdir(dirname(reportMd), { recursive: true });
        await writeFile(reportMd, text + '\n');
      }
      expect(r.stats.flatMap((s) => s.errors)).toEqual([]);
      expect(r.palErrors).toEqual([]);
      expect(
        r.stats.reduce((n, s) => n + s.lstMissing.length, 0),
        'wpisy listy bez pliku',
      ).toBeLessThan(1000);
    },
  );
});
