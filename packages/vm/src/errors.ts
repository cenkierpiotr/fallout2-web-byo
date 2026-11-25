/** Blad wykonania skryptu: niesie miejsce (skrypt, procedura, pc = offset w pliku, opkod). */
export class VmError extends Error {
  readonly script: string;
  readonly proc: string;
  readonly pc: number;
  readonly op: number | undefined;

  constructor(msg: string, script: string, proc: string, pc: number, op?: number) {
    const opText = op === undefined ? '' : ` op=0x${op.toString(16)}`;
    super(`${script}:${proc}@${pc}${opText}: ${msg}`);
    this.name = 'VmError';
    this.script = script;
    this.proc = proc;
    this.pc = pc;
    this.op = op;
  }
}

/** Blad prymitywow stosu (przepelnienie, niedomiar, zly typ); interpreter opakowuje go w VmError z miejscem. */
export class StackError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'StackError';
  }
}
