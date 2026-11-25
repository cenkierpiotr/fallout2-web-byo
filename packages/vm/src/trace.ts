import type { Value } from './stack.js';

export interface StepEvent {
  script: string;
  proc: string;
  pc: number;
  op: number;
  name?: string;
  stackDepth: number;
}

export interface TraceSink {
  step?(e: StepEvent): void;
  call?(e: { script: string; proc: string; args: Value[] }): void;
  hook?(e: { name: string; args: Value[]; result?: Value }): void;
}

export interface ExecOptions {
  /** Limit instrukcji na jedno wywolanie run/resume (domyslnie 1_000_000). */
  maxSteps?: number;
  trace?: TraceSink;
}

export const DEFAULT_MAX_STEPS = 1_000_000;
