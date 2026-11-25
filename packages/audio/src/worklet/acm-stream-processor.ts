/** Pierscien PCM float z resamplingiem liniowym; czysta logika procesora (testowalna bez AudioWorklet). */
export class RingResampler {
  private buf: Float32Array;
  private w = 0;
  private r = 0;
  private count = 0;
  private frac = 0;
  done = false;
  underruns = 0;

  constructor(
    readonly sourceRate: number,
    readonly outRate: number,
    readonly channels: number,
    seconds = 2,
  ) {
    this.buf = new Float32Array(Math.ceil(sourceRate * seconds) * channels);
  }

  /** Ile ramek zrodlowych w buforze. */
  get frames(): number {
    return Math.floor(this.count / this.channels);
  }
  get free(): number {
    return this.buf.length - this.count;
  }

  push(samples: Int16Array): number {
    // tylko cale ramki: polowa ramki przesunelaby kanaly (L/R zamienione) do konca strumienia
    const n = Math.min(samples.length, this.free);
    const whole = n - (n % this.channels);
    for (let i = 0; i < whole; i++) {
      this.buf[this.w] = samples[i]! / 32768;
      this.w = (this.w + 1) % this.buf.length;
    }
    this.count += whole;
    return whole;
  }

  /** Wypelnia `out` (jeden kanal wyjsciowy na tablice) dla outFrames; przy braku danych cisza i underrun. */
  pull(out: Float32Array[], outFrames: number): void {
    const step = this.sourceRate / this.outRate;
    for (let i = 0; i < outFrames; i++) {
      if (this.frames < 2 && !(this.done && this.frames >= 1)) {
        for (const ch of out) ch[i] = 0;
        if (!this.done) this.underruns++;
        continue;
      }
      const base = this.r;
      for (let c = 0; c < out.length; c++) {
        const sc = Math.min(c, this.channels - 1);
        const a = this.buf[(base + sc) % this.buf.length]!;
        const nextIdx =
          this.frames >= 2
            ? (base + this.channels + sc) % this.buf.length
            : (base + sc) % this.buf.length;
        const b = this.buf[nextIdx]!;
        out[c]![i] = a + (b - a) * this.frac;
      }
      this.frac += step;
      while (this.frac >= 1 && this.frames >= 1) {
        this.frac -= 1;
        this.r = (this.r + this.channels) % this.buf.length;
        this.count -= this.channels;
      }
    }
  }
}

// Rejestracja tylko w kontekscie AudioWorkletGlobalScope.
declare const registerProcessor: ((name: string, ctor: unknown) => void) | undefined;
declare const AudioWorkletProcessor: { new (): { port: MessagePort } } | undefined;
declare const sampleRate: number | undefined;

if (
  typeof registerProcessor !== 'undefined' &&
  typeof AudioWorkletProcessor !== 'undefined' &&
  typeof sampleRate !== 'undefined'
) {
  const Base = AudioWorkletProcessor;
  class AcmStreamProcessor extends Base {
    private readonly ring: RingResampler;
    private needSent = false;
    constructor(options: { processorOptions: { sourceRate: number; channels: number } }) {
      super();
      const o = options.processorOptions;
      this.ring = new RingResampler(o.sourceRate, sampleRate as number, o.channels);
      this.port.onmessage = (e: MessageEvent): void => {
        const m = e.data as { type: string; samples?: Int16Array; done?: boolean };
        if (m.type === 'push') {
          if (m.samples) this.ring.push(m.samples);
          if (m.done) this.ring.done = true;
          this.needSent = false;
        }
      };
    }
    process(_in: Float32Array[][], outputs: Float32Array[][]): boolean {
      const out = outputs[0]!;
      const frames = out[0]!.length;
      const before = this.ring.underruns;
      this.ring.pull(out, frames);
      if (this.ring.underruns > before) this.port.postMessage({ type: 'underrun' });
      if (!this.ring.done && !this.needSent && this.ring.frames < this.ring.sourceRate * 0.5) {
        this.needSent = true;
        this.port.postMessage({ type: 'need', frames: Math.floor(this.ring.sourceRate) });
      }
      return true;
    }
  }
  registerProcessor('acm-stream-processor', AcmStreamProcessor);
}
