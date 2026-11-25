import { genOpcodes } from './gen-opcodes.js';

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'gen-opcodes') {
    const n = genOpcodes('docs/specs/int-opcodes.md', 'packages/vm/src/opcode-table.generated.ts');
    process.stdout.write(`wygenerowano ${n} opkodow\n`);
  } else if (cmd === 'int-disasm') {
    const { runIntDisasm } = await import('./int-disasm-cli.js');
    await runIntDisasm(rest);
  } else if (cmd === 'vm-trace') {
    const { runVmTrace } = await import('./vm-trace.js');
    await runVmTrace(rest);
  } else if (cmd === 'opcode-impl') {
    const { runOpcodeImpl } = await import('./opcode-impl.js');
    runOpcodeImpl(rest);
  } else if (cmd === 'check-dist-clean') {
    const { checkDistClean } = await import('./release-checks.js');
    const r = checkDistClean(rest[0] ?? 'apps/web/dist', process.cwd());
    process.stdout.write(`dist: ${r.bytes} B, ${r.ok ? 'czysty' : r.problems.join('; ')}\n`);
    process.exit(r.ok ? 0 : 1);
  } else if (cmd === 'docs-check') {
    const { checkDocs } = await import('./release-checks.js');
    const r = checkDocs(
      process.cwd(),
      ['README.md', 'docs/user/README.pl.md', 'docs/user/README.en.md'],
      [['docs/user/README.pl.md', 'docs/user/README.en.md']],
    );
    process.stdout.write(r.ok ? 'docs-check: OK\n' : `docs-check: ${r.problems.join('\n')}\n`);
    process.exit(r.ok ? 0 : 1);
  } else if (cmd === 'check-deviations') {
    const { checkDeviations } = await import('./check-deviations.js');
    const r = checkDeviations(process.cwd());
    process.stdout.write(
      r.ok
        ? `check-deviations: OK (${r.devIds.length} DEV, ${r.fixIds.length} poprawek)\n`
        : `check-deviations:\n${r.problems.join('\n')}\n`,
    );
    process.exit(r.ok ? 0 : 1);
  } else if (cmd === 'save-migrate') {
    const { runSaveMigrate } = await import('./save-migrate.js');
    runSaveMigrate(rest);
  } else if (cmd === 'tooltips-coverage') {
    const { runTooltipsCoverage } = await import('./tooltips-coverage.js');
    await runTooltipsCoverage();
  } else {
    process.stderr.write(
      'uzycie: tools <gen-opcodes|int-disasm|vm-trace|opcode-impl|check-dist-clean|docs-check|check-deviations|save-migrate|tooltips-coverage> ...\n',
    );
    process.exit(2);
  }
}
void main();
