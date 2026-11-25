/**
 * Budzet wydajnosci mobile (M9): szacunek kosztu presetu bez GPU. Czysta logika.
 * Model: koszt = piksele bufora renderu * liczba passow pelnoekranowych (fill), plus pamiec
 * FBO (kolor+normalne+glebia, cien, AO, bloom). Czas GPU na telefonie jest Z (SwiftShader go nie
 * oddaje), wiec to bramka konfiguracji, nie pomiar.
 */
import type { QualitySettings } from './QualityPresets.js';

export interface BudgetEnv {
  /** Rozmiar widoku CSS (px). */
  width: number;
  height: number;
  dpr: number;
  mobile: boolean;
}

export interface BudgetLimits {
  /** Maks. pamieci GPU na FBO + tekstury (bajty). */
  vramBytes: number;
  /** Maks. fill pelnoekranowy na klatke (MPx), wzgledem celu fps. */
  fillMpx: number;
}

/** Mobile: 192 MB (design doc), fill ~ 12 MPx/klatke (Z: srednia klasa, 30 fps, ~360 MPx/s). */
export const MOBILE_LIMITS: BudgetLimits = { vramBytes: 192 * 2 ** 20, fillMpx: 12 };
export const DESKTOP_LIMITS: BudgetLimits = { vramBytes: 2048 * 2 ** 20, fillMpx: 60 };

export interface BudgetEstimate {
  /** Rozmiar bufora renderu (px). */
  renderPixels: number;
  /** Passy pelnoekranowe: scena (1) + cien + SSAO(2: AO + bilateral) + bloom(3) + grading/postFx(1). */
  fullscreenPasses: number;
  fillMpx: number;
  fboBytes: number;
  verdict: { fits: boolean; reasons: string[] };
}

const MAX_RENDER_PIXELS = 1.6e6;

export function estimateBudget(
  q: QualitySettings,
  env: BudgetEnv,
  limits: BudgetLimits = env.mobile ? MOBILE_LIMITS : DESKTOP_LIMITS,
): BudgetEstimate {
  const scale = Math.max(0.1, q.renderScale);
  let px = env.width * env.height * scale * scale;
  // render-scale.ts ogranicza bufor do ~1.6 MPx na telefonie
  if (env.mobile) px = Math.min(px, MAX_RENDER_PIXELS);
  const lit = q.shadows !== 'none' || q.ssao;
  let passes = 1;
  let fbo = 0;
  if (lit) fbo += px * (4 + 4 + 4); // kolor + normalne + glebia (RGBA8 + depth)
  if (q.shadows !== 'none') {
    passes += 2; // maska + rozmycie (polowa rozdzielczosci: 0.5 w kosztach)
    fbo += px * 4 * 0.5;
  }
  if (q.shadows === 'sun+points') {
    passes += 2; // maska punktowa (RGBA, do 4 swiatel) + rozmycie
    fbo += px * 4 * 0.5;
  }
  if (q.ssao) {
    passes += 2;
    fbo += px * 2 * 0.5;
  }
  if (q.postfx.bloom) {
    passes += 3;
    fbo += px * 4 * 0.5;
  }
  if (q.postfx.crt || q.lut !== 'neutral' || lit) passes += 1;
  const fillMpx = (px * passes) / 1e6;
  const reasons: string[] = [];
  if (q.vramBudgetBytes + fbo > limits.vramBytes)
    reasons.push(
      `pamiec ${Math.round((q.vramBudgetBytes + fbo) / 2 ** 20)} MB > ${Math.round(limits.vramBytes / 2 ** 20)} MB`,
    );
  if (fillMpx > limits.fillMpx)
    reasons.push(`fill ${fillMpx.toFixed(1)} MPx > ${limits.fillMpx} MPx`);
  return {
    renderPixels: px,
    fullscreenPasses: passes,
    fillMpx,
    fboBytes: fbo,
    verdict: { fits: reasons.length === 0, reasons },
  };
}
