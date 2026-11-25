import { existsSync, readFileSync } from 'node:fs';
import { parseInt as parseIntScript, type IntScript } from '@f2/formats';
import { openGameFolderNode } from '@f2/vfs/node';
import { OPCODES } from '@f2/vm';
import { gameOpcodeImpl, renderImplSection } from './opcode-impl.js';
import { disassemble, formatInstr, opcodeStats, type OpStat } from './int-disasm.js';

const ARROYO = ['arbridge', 'arcaves', 'ardead', 'argarden', 'artemple', 'arvillag'];

function toBuf(u: Uint8Array): ArrayBuffer {
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
}

function hex(op: number): string {
  return `0x${op.toString(16).padStart(4, '0')}`;
}

function statusOf(op: number): string {
  return OPCODES.get(op)?.status ?? '-';
}

function table(rows: [number, OpStat][]): string {
  const out = ['| opkod | nazwa | uzycia | skrypty | status |', '|---|---|---|---|---|'];
  for (const [op, st] of rows)
    out.push(
      `| ${hex(op)} | ${st.name ?? '(nieznany)'} | ${st.count} | ${st.scripts} | ${statusOf(op)} |`,
    );
  return out.join('\n');
}

export function renderStatsMarkdown(
  all: { name: string; script: IntScript }[],
  failed: string[],
  date: string,
): string {
  const scripts = all.map((a) => a.script);
  const { byOp, unknownCore } = opcodeStats(scripts);
  const total = [...byOp.values()].reduce((s, v) => s + v.count, 0);
  const sorted = [...byOp.entries()].sort((a, b) => b[1].count - a[1].count || a[0] - b[0]);
  const game = sorted.filter(
    ([op]) =>
      OPCODES.get(op)?.kind === 'game' || (op >= 0x804c && !OPCODES.has(op) && (op & 0x3ff) !== 1),
  );
  const unknown = sorted
    .filter(([op]) => !OPCODES.has(op) && (op & 0x3ff) !== 1)
    .sort((a, b) => a[0] - b[0]);
  // wersja efektywna: all jest w kolejnosci warstw od najwyzszego priorytetu, bierzemy pierwsze wystapienie
  const seen = new Set<string>();
  const arroyo: IntScript[] = [];
  for (const a of all) {
    const base = a.name.replace(/\.int$/i, '').toLowerCase();
    if (!ARROYO.includes(base) || seen.has(base)) continue;
    seen.add(base);
    arroyo.push(a.script);
  }
  const ar = opcodeStats(arroyo);
  const arSorted = [...ar.byOp.entries()].sort((a, b) => b[1].count - a[1].count || a[0] - b[0]);
  const lines = [
    '# Statystyka opkodow INT',
    `Wygenerowano: ${date} przez \`pnpm tools int-disasm --all --stats\` (Zadanie 26). Nie edytuj recznie.`,
    '',
    `- skrypty (wszystkie warstwy: MASTER.DAT + PATCH000 + patch nieoficjalny): ${scripts.length}`,
    `- bledy parsowania/dezasemblacji: ${failed.length}${failed.length ? ` (${failed.join(', ')})` : ''}`,
    `- instrukcji: ${total}, roznych opkodow: ${byOp.size}`,
    `- nieznane opkody core (0x8000-0x804B poza tabela): ${unknownCore.length}${unknownCore.length ? ` (${unknownCore.map(hex).join(', ')})` : ''}`,
    `- opkody uzyte w danych, a nieobecne w tabeli specyfikacji (poza push): ${unknown.length}${unknown.length ? ` (${unknown.map(([o]) => hex(o)).join(', ')})` : ''}`,
    '',
    renderImplSection(gameOpcodeImpl()),
    '',
    '## Top 100 opkodow game',
    table(game.slice(0, 100)),
    '',
    `## Skrypty Arroyo (${arroyo.length}, wersje efektywne: ${ARROYO.join(', ')})`,
    `Roznych opkodow: ${ar.byOp.size}; opkodow game: ${arSorted.filter(([o]) => (OPCODES.get(o)?.kind ?? 'x') === 'game').length}; nieznane core: ${ar.unknownCore.length}.`,
    '',
    table(arSorted),
    '',
  ];
  return lines.join('\n');
}

export async function runIntDisasm(argv: string[]): Promise<void> {
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const target = argv.find((a) => !a.startsWith('--'));
  if (flags.has('--list-opcodes')) {
    for (const d of [...OPCODES.values()].sort((a, b) => a.op - b.op)) {
      process.stdout.write(
        `${hex(d.op)}  ${d.name}  pops=${d.pops} pushes=${d.pushes} ${d.kind} ${d.status}\n`,
      );
    }
    return;
  }
  if (!target && !flags.has('--all')) {
    process.stderr.write(
      'uzycie: tools int-disasm <plik.int|--all> [--stats] [--list-opcodes] [--unknown]\n',
    );
    process.exit(2);
  }
  const gameDir = process.env.F2_GAME_DIR;
  if (!gameDir && (flags.has('--all') || (target && !existsSync(target)))) {
    process.stderr.write('ustaw F2_GAME_DIR (i opcjonalnie F2_PATCH_DIR)\n');
    process.exit(2);
  }
  const vfs = gameDir ? await openGameFolderNode(gameDir, process.env.F2_PATCH_DIR) : undefined;
  try {
    if (flags.has('--all')) {
      const all: { name: string; script: IntScript }[] = [];
      const failed: string[] = [];
      for (const layer of vfs!.layers) {
        for (const key of layer.keys()) {
          if (!key.endsWith('.int')) continue;
          const name = key.slice(key.lastIndexOf('/') + 1);
          try {
            const script = parseIntScript(toBuf(await layer.open(key)), name);
            disassemble(script);
            all.push({ name, script });
          } catch (e) {
            failed.push(`${layer.name}:${key}`);
            process.stderr.write(`blad: ${layer.name}:${key}: ${(e as Error).message}\n`);
          }
        }
      }
      if (flags.has('--stats') || !flags.has('--unknown')) {
        process.stdout.write(
          renderStatsMarkdown(all, failed, new Date().toISOString().slice(0, 10)),
        );
      }
      if (flags.has('--unknown')) {
        const { byOp } = opcodeStats(all.map((a) => a.script));
        for (const [op, st] of byOp) {
          if (!OPCODES.has(op) && (op & 0x3ff) !== 1)
            process.stdout.write(`${hex(op)}  uzycia=${st.count} skrypty=${st.scripts}\n`);
        }
      }
      return;
    }
    const buf = existsSync(target!)
      ? toBuf(readFileSync(target!))
      : toBuf(await vfs!.open(`scripts/${target!.replace(/^.*\//, '')}`));
    const script = parseIntScript(buf, target!.replace(/^.*\//, ''));
    const instr = disassemble(script);
    if (flags.has('--stats')) {
      const { byOp } = opcodeStats([script]);
      process.stdout.write(
        table([...byOp.entries()].sort((a, b) => b[1].count - a[1].count)) + '\n',
      );
    } else if (flags.has('--unknown')) {
      for (const i of instr)
        if (!i.def && (i.op & 0x3ff) !== 1) process.stdout.write(formatInstr(i) + '\n');
    } else {
      for (const i of instr) process.stdout.write(formatInstr(i) + '\n');
    }
  } finally {
    await vfs?.close?.();
  }
}
