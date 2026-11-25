import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type MsgMap = ReadonlyMap<number, string>;

export interface CoverageCategory {
  name: string;
  total: number;
  withText: number;
  /** Progi: perk/stat/skill/trait 100 %, items 98 %. */
  threshold: number;
  missing: string[];
}

export interface CoverageReport {
  ok: boolean;
  categories: CoverageCategory[];
}

export interface CoverageInput {
  perks: { index: number; msgId: number; descMsgId: number }[];
  traits: { index: number; msgId: number; descMsgId: number }[];
  statCount: number;
  skillCount: number;
  perkMsg: MsgMap;
  traitMsg: MsgMap;
  statMsg: MsgMap;
  skillMsg: MsgMap;
  /** pid -> textId dla przedmiotow (opcjonalnie; brak = kategoria pominieta). */
  items?: { pid: number; textId: number; key: string }[];
  itemMsg?: MsgMap;
  /** Wyjatki (klucz kategorii:id), np. obiekty techniczne bez tekstu. */
  exceptions?: ReadonlySet<string>;
}

const has = (m: MsgMap, id: number): boolean => (m.get(id) ?? '').trim().length > 0;

export function computeCoverage(i: CoverageInput): CoverageReport {
  const ex = i.exceptions ?? new Set<string>();
  const cats: CoverageCategory[] = [];
  const add = (name: string, threshold: number, entries: { key: string; ok: boolean }[]): void => {
    const rel = entries.filter((e) => !ex.has(`${name}:${e.key}`));
    cats.push({
      name,
      total: rel.length,
      withText: rel.filter((e) => e.ok).length,
      threshold,
      missing: rel.filter((e) => !e.ok).map((e) => e.key),
    });
  };
  add(
    'perk',
    1,
    i.perks.map((p) => ({
      key: String(p.index),
      ok: has(i.perkMsg, p.msgId) && has(i.perkMsg, p.descMsgId),
    })),
  );
  add(
    'trait',
    1,
    i.traits.map((p) => ({
      key: String(p.index),
      ok: has(i.traitMsg, p.msgId) && has(i.traitMsg, p.descMsgId),
    })),
  );
  // Statystyki i skille: nazwa 100+i, opis 200+i (stat.msg, skill.msg) wg docs/specs/stats.md.
  add(
    'stat',
    1,
    Array.from({ length: i.statCount }, (_, n) => ({
      key: String(n),
      ok: has(i.statMsg, 100 + n) && has(i.statMsg, 200 + n),
    })),
  );
  add(
    'skill',
    1,
    Array.from({ length: i.skillCount }, (_, n) => ({
      key: String(n),
      ok: has(i.skillMsg, 100 + n) && has(i.skillMsg, 200 + n),
    })),
  );
  if (i.items && i.itemMsg) {
    const im = i.itemMsg;
    add(
      'item',
      0.98,
      i.items.map((it) => ({
        key: it.key,
        ok: has(im, it.textId) && has(im, it.textId + 1),
      })),
    );
  }
  const ok = cats.every((c) => c.total === 0 || c.withText / c.total >= c.threshold);
  return { ok, categories: cats };
}

export function formatCoverage(r: CoverageReport): string {
  const lines = r.categories.map((c) => {
    const pct = c.total === 0 ? 100 : (100 * c.withText) / c.total;
    const miss = c.missing.length
      ? ` brak: ${c.missing.slice(0, 15).join(',')}${c.missing.length > 15 ? ',...' : ''}`
      : '';
    return `${c.name}: ${c.withText}/${c.total} z opisem (${pct.toFixed(1)}%, prog ${(c.threshold * 100).toFixed(0)}%)${miss}`;
  });
  return lines.join('\n');
}

/** Wczytuje dane regul z repo (`packages/rules/data`). */
export function loadRuleData(
  root: string,
): Pick<CoverageInput, 'perks' | 'traits' | 'statCount' | 'skillCount'> {
  const j = (f: string): unknown =>
    JSON.parse(readFileSync(join(root, 'packages/rules/data', f), 'utf8'));
  const perks = (j('perks.json') as { perks: CoverageInput['perks'] }).perks;
  const traits = (j('traits.json') as { traits: CoverageInput['traits'] }).traits;
  const stats = (j('stats.json') as { stats: unknown[] }).stats;
  const skills = (j('skills.json') as { skills: unknown[] }).skills;
  // opisy (200+i) maja tylko 7 SPECIAL i pochodne do 37; liczymy wszystkie wpisy statow z rules
  return { perks, traits, statCount: stats.length, skillCount: skills.length };
}

/** CLI: wymaga F2_GAME_DIR (pliki MSG). Kod 1 gdy pokrycie ponizej progow. */
export async function runTooltipsCoverage(): Promise<void> {
  const gameDir = process.env['F2_GAME_DIR'];
  if (!gameDir) {
    process.stderr.write('tooltips-coverage: ustaw F2_GAME_DIR (pliki MSG gry)\n');
    process.exit(2);
  }
  const { parseMsg, parseLst, lstName, parseProto } = await import('@f2/formats');
  const { openGameFolderNode } = await import('@f2/vfs/node');
  const vfs = await openGameFolderNode(gameDir, process.env['F2_PATCH_DIR']);
  try {
    const msg = async (n: string): Promise<MsgMap> => {
      const b = await vfs.open(`text/english/game/${n}.msg`);
      const m = new Map<number, string>();
      for (const [id, e] of parseMsg(
        b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer,
      ))
        m.set(id, e.text);
      return m;
    };
    const root = process.cwd();
    const data = loadRuleData(root);
    const items: { pid: number; textId: number; key: string }[] = [];
    const lst = parseLst(await vfs.open('proto/items/items.lst'));
    for (let n = 0; n < lst.length; n++) {
      const name = lstName(lst[n]!);
      try {
        const p = parseProto(await vfs.open(`proto/items/${name}`));
        items.push({ pid: p.pid, textId: p.textId, key: name });
      } catch {
        /* uszkodzony PRO: pomijany */
      }
    }
    const exFile = join(root, 'tools/tooltips-exceptions.json');
    let exceptions = new Set<string>();
    try {
      exceptions = new Set(JSON.parse(readFileSync(exFile, 'utf8')) as string[]);
    } catch {
      /* brak pliku wyjatkow = pusta lista */
    }
    const r = computeCoverage({
      ...data,
      perkMsg: await msg('perk'),
      traitMsg: await msg('trait'),
      statMsg: await msg('stat'),
      skillMsg: await msg('skill'),
      items,
      itemMsg: await msg('pro_item'),
      exceptions,
    });
    process.stdout.write(`${formatCoverage(r)}\n`);
    process.exitCode = r.ok ? 0 : 1;
  } finally {
    await vfs.close();
  }
}
