/** Minimalne fake'i Web Audio do testow (bez zmian lockfile). */
export interface Target {
  value: number;
  time: number;
  tc: number;
}
export class FakeParam {
  value = 1;
  targets: Target[] = [];
  setTargetAtTime(value: number, time: number, tc: number): this {
    this.targets.push({ value, time, tc });
    this.value = value;
    return this;
  }
  cancelScheduledValues(): this {
    return this;
  }
}
export class FakeNode {
  connected: unknown[] = [];
  connect(n: unknown): unknown {
    this.connected.push(n);
    return n;
  }
  disconnect(): void {
    this.connected = [];
  }
}
export class FakeGain extends FakeNode {
  gain = new FakeParam();
}
export class FakeBuffer {
  readonly data: Float32Array[];
  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.data = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  get duration(): number {
    return this.length / this.sampleRate;
  }
  getChannelData(i: number): Float32Array {
    return this.data[i]!;
  }
}
export class FakeSource extends FakeNode {
  buffer: FakeBuffer | null = null;
  onended: (() => void) | null = null;
  started: number | null = null;
  stopCalls = 0;
  start(when = 0): void {
    this.started = when;
  }
  stop(): void {
    this.stopCalls++;
  }
  /** Symuluje naturalny koniec odtwarzania. */
  finish(): void {
    this.onended?.();
  }
}
export class FakeAudioContext {
  currentTime = 0;
  sampleRate = 22050;
  state: 'suspended' | 'running' = 'suspended';
  resumeCalls = 0;
  destination = new FakeNode();
  gains: FakeGain[] = [];
  sources: FakeSource[] = [];
  createGain(): FakeGain {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }
  createBuffer(ch: number, len: number, rate: number): FakeBuffer {
    return new FakeBuffer(ch, len, rate);
  }
  createBufferSource(): FakeSource {
    const s = new FakeSource();
    this.sources.push(s);
    return s;
  }
  async resume(): Promise<void> {
    this.resumeCalls++;
    this.state = 'running';
  }
}
