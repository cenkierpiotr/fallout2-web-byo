import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  OPCODES,
  GAME_CONTEXT_OPCODES,
  batch4Handlers,
  coreHandlers,
  battleHandlers,
  combatHandlers,
  dialogHandlers,
  implementedGameOpcodes,
  inventoryHandlers,
  miscHandlers,
  gapHandlers,
} from '@f2/vm';

/**
 * Realny licznik zaimplementowanych opkodow gry (0x804C-0x8155) po nazwie.
 * Zrodla: rejestry handlerow w @f2/vm (po numerze opkodu) oraz obsluga po nazwie w ScriptRuntime.unsupported
 * i ExtraOpsB (skan zrodel, bo ScriptRuntime nie wystawia listy nazw).
 */

export interface GameImpl {
  total: number;
  implemented: number;
  /** opkod -> zrodlo implementacji (klucz to opkod, bo nazwy sie powtarzaja: animate_stand_obj, attack) */
  byOp: Map<number, string>;
  /** zbior nazw zaimplementowanych opkodow */
  byName: Set<string>;
  /** nazwy obslugiwane jako no-op (oryginal wykonuje, silnik nie ma odpowiednika) */
  noopNames: string[];
  noop: number;
  missing: string[];
}

/** Zwraca posortowane, unikalne nazwy z zrodla: 'runtime' = `opName === 'x'`, 'all' = kazdy literal nalezacy do zbioru. */
export function scanNamedOps(
  src: string,
  mode: 'runtime' | 'all',
  known: ReadonlySet<string>,
): string[] {
  const re = mode === 'runtime' ? /opName\s*===\s*'([a-z0-9_]+)'/g : /'([a-z0-9_]+)'/g;
  const out = new Set<string>();
  for (const m of src.matchAll(re)) if (known.has(m[1] as string)) out.add(m[1] as string);
  return [...out].sort();
}

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE_SRC = resolve(HERE, '../../engine-core/src');

export function gameOpcodeImpl(): GameImpl {
  const game = [...OPCODES.values()].filter((d) => d.kind === 'game');
  const names = new Set(game.map((d) => d.name));
  const byOp = new Map<number, string>();
  const markOp = (op: number, src: string): void => {
    if (OPCODES.get(op)?.kind === 'game' && !byOp.has(op)) byOp.set(op, src);
  };
  const mark = (name: string, src: string): void => {
    for (const d of game) if (d.name === name) markOp(d.op, src);
  };
  const regs: [string, Iterable<number>][] = [
    ['vm/core', coreHandlers.keys()],
    ['vm/game', implementedGameOpcodes],
    ['vm/context', Object.values(GAME_CONTEXT_OPCODES)],
    ['vm/dialog', dialogHandlers.keys()],
    ['vm/inventory', inventoryHandlers.keys()],
    ['vm/misc', miscHandlers.keys()],
    ['vm/combat', combatHandlers.keys()],
    ['vm/batch4', batch4Handlers.keys()],
    ['vm/battle', battleHandlers.keys()],
    ['vm/gaps', gapHandlers.keys()],
  ];
  // timery 0x80f0/0x80f1 nadpisywane w createGameHandlers (zawsze zaimplementowane)
  regs.push(['vm/timers', [0x80f0, 0x80f1]]);
  for (const [src, ops] of regs) for (const op of ops) markOp(op, src);

  const rt = readFileSync(resolve(ENGINE_SRC, 'script-runtime.ts'), 'utf8');
  for (const n of scanNamedOps(rt, 'runtime', names))
    mark(n, 'engine-core/ScriptRuntime.unsupported');
  const bSrc = readFileSync(resolve(ENGINE_SRC, 'script-ops-b.ts'), 'utf8');
  for (const n of scanNamedOps(bSrc, 'all', names)) mark(n, 'engine-core/script-ops-b');

  const nop = /const NOP_OPS = new Set\(\[([^\]]*)\]\)/.exec(bSrc);
  const byName = new Set([...byOp.keys()].map((op) => OPCODES.get(op)?.name as string));
  const noopNames = nop
    ? scanNamedOps(nop[1] as string, 'all', names).filter((n) => byName.has(n))
    : [];
  const missing = game
    .filter((d) => !byOp.has(d.op))
    .map((d) => d.name)
    .sort();
  return {
    total: game.length,
    implemented: byOp.size,
    byOp,
    byName,
    noopNames,
    noop: noopNames.length,
    missing,
  };
}

export const IMPL_BEGIN = '<!-- impl:begin -->';
export const IMPL_END = '<!-- impl:end -->';

export function renderImplSection(r: GameImpl): string {
  const bySrc = new Map<string, number>();
  for (const s of r.byOp.values()) bySrc.set(s, (bySrc.get(s) ?? 0) + 1);
  const lines = [
    IMPL_BEGIN,
    '## Implementacja VM (liczone po nazwie)',
    'Generowane przez `pnpm tools opcode-impl --write` (packages/tools/src/opcode-impl.ts): rejestry handlerow `@f2/vm` plus obsluga po nazwie w `ScriptRuntime.unsupported` i `script-ops-b.ts`.',
    '',
    `- zaimplementowane opkody gry: ${r.implemented}/${r.total} (w tym ${r.noop} jako no-op bez skutku: ${r.noopNames.join(', ') || '-'})`,
    `- obslugujace realny skutek: ${r.implemented - r.noop}/${r.total}`,
    `- nieobslugiwane (tylko log \`hooks.unsupported\`): ${r.total - r.implemented}/${r.total}`,
    '',
    '| zrodlo | opkody |',
    '|---|---|',
    ...[...bySrc.entries()].sort().map(([s, n]) => `| ${s} | ${n} |`),
    '',
    `Nieobslugiwane (${r.missing.length}): ${r.missing.join(', ')}`,
    IMPL_END,
  ];
  return lines.join('\n');
}

/** Wstawia/zamienia sekcje implementacji w tekscie statystyk (przed `## Top 100`). */
export function injectImplSection(md: string, section: string): string {
  const a = md.indexOf(IMPL_BEGIN);
  const b = md.indexOf(IMPL_END);
  if (a >= 0 && b > a) return md.slice(0, a) + section + md.slice(b + IMPL_END.length);
  const at = md.indexOf('## Top 100');
  return at < 0 ? md + '\n' + section + '\n' : md.slice(0, at) + section + '\n\n' + md.slice(at);
}

export function runOpcodeImpl(argv: string[]): void {
  const r = gameOpcodeImpl();
  process.stdout.write(
    `${r.implemented}/${r.total} (no-op: ${r.noop}, realny skutek: ${r.implemented - r.noop})\n`,
  );
  if (argv.includes('--missing')) process.stdout.write(r.missing.join('\n') + '\n');
  if (argv.includes('--list')) {
    for (const [op, src] of [...r.byOp].sort((a, b) => a[0] - b[0]))
      process.stdout.write(`0x${op.toString(16)} ${OPCODES.get(op)?.name} ${src}\n`);
  }
  if (argv.includes('--write')) {
    const p = 'docs/status/int-opcode-stats.md';
    writeFileSync(p, injectImplSection(readFileSync(p, 'utf8'), renderImplSection(r)));
  }
}
