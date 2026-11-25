/** Resampling liniowy srcRate -> dstRate (czysta funkcja, wspolna z workletem). */
export function resampleLinear(src: Float32Array, srcRate: number, dstRate: number): Float32Array {
  if (srcRate <= 0 || dstRate <= 0) throw new Error('czestotliwosc probkowania musi byc > 0');
  const n = src.length;
  const outLen = Math.round((n * dstRate) / srcRate);
  const out = new Float32Array(outLen);
  if (n === 0) return out;
  const ratio = srcRate / dstRate;
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const i0 = Math.min(n - 1, Math.floor(pos));
    const i1 = Math.min(n - 1, i0 + 1);
    const frac = pos - i0;
    out[i] = src[i0]! + (src[i1]! - src[i0]!) * frac;
  }
  return out;
}
