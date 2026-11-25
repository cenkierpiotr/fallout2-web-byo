import {
  LightField,
  ParallaxState,
  LightPass,
  buildLitFrameState,
  postProcessFromQuality,
  resolveAutoPreset,
  resolvePreset,
  type ResolvedPreset,
  type GfxDevice,
  type LitFrameState,
  type MapLightSource,
  type PostProcessConfig,
  type QualityEnv,
  type QualitySettings,
} from '@f2/render';
import type { Settings } from '../../settings';
import { collectLightSources, pickVisibleLights, type EmitterLike } from './light-sources';

/** Kierunek slonca (znormalizowany w LightPass): z lewej-gory, lekko od przodu. */
const SUN_DIR: [number, number, number] = [-0.45, -0.55, 0.7];

/** Srodowisko do wyboru presetu 'auto': telefon (waski ekran albo dotyk) vs komputer. */
export function detectQualityEnv(w: {
  innerWidth: number;
  devicePixelRatio?: number;
  matchMedia?: (q: string) => { matches: boolean };
}): QualityEnv {
  let coarse = false;
  try {
    coarse = !!w.matchMedia?.('(pointer: coarse)').matches;
  } catch {
    /* brak matchMedia */
  }
  return { mobile: coarse || w.innerWidth <= 820, dpr: w.devicePixelRatio || 1 };
}

export interface GraphicsPlan {
  preset: ResolvedPreset;
  quality: QualitySettings;
  /** Czy w ogole cos jest wlaczone (false = sciezka klasyczna, zadnych wywolan GL). */
  active: boolean;
  lighting: boolean;
  parallax: boolean;
  /** Swiatla punktowe z obiektow mapy (preset z cieniami 'sun+points'; wymaga oswietlenia). */
  points: boolean;
  postProcess: PostProcessConfig | null;
  pixelated: boolean;
}

/**
 * Czysta funkcja: ustawienia + srodowisko -> plan renderu. Domyslne ustawienia (postFx i lighting
 * wylaczone) daja plan nieaktywny, czyli render jak dotad. Cienie i SSAO wymagaja oswietlenia,
 * wiec wlaczone postFx z presetem z cieniem/SSAO wlacza je automatycznie.
 */
export function planGraphics(
  s: Pick<Settings, 'graphicsPreset' | 'postFx' | 'lighting'>,
  env: QualityEnv,
  time = 0,
): GraphicsPlan {
  const quality = resolvePreset(s.graphicsPreset, env);
  const postProcess = postProcessFromQuality(quality, { enabled: s.postFx, time });
  const lighting = s.lighting || !!postProcess?.shadows || !!postProcess?.ssao;
  return {
    preset: s.graphicsPreset === 'auto' ? resolveAutoPreset(env) : s.graphicsPreset,
    quality,
    active: lighting || postProcess !== null,
    lighting,
    parallax: lighting && quality.parallax,
    points: lighting && quality.shadows === 'sun+points',
    postProcess,
    pixelated: s.postFx && quality.pixelated,
  };
}

/**
 * Podlacza ustawienia grafiki do urzadzenia: przy zmianie ustawien przelacza setLighting /
 * setPostProcess, co klatke uaktualnia tylko lekki stan (kamera, czas). Przy planie nieaktywnym nie
 * wola GL (po powrocie do domyslnych raz czysci stan: null).
 */
/**
 * Mapowanie ambientu mapy (0.25..1, liniowy mnoznik oryginalu) na kolor otoczenia w sciezce lit.
 * Klasyk cieniuje paleta (jasniej niz liniowy mnoznik), a LUT bg3-warm z kontrastem przyciemnia i
 * mocno czerwieni ciemne tony, wiec: (1) gamma 0.58 (0.25 -> ok. 0.45, 1 -> 1), (2) kanal R x0.84
 * przy 0.25 (liniowo do 1 przy ambiencie 1). Dobrane na zrzutach ARVILLAG 08:24 (Z): srednia
 * jasnosc tla zblizona do klasyka, R:G:B jak w klasyku. Tylko sciezka lit; flaga wylaczona jej nie dotyka.
 */
export function litAmbient(amb: number): [number, number, number] {
  const a = Math.min(1, Math.max(0, amb));
  const g = Math.pow(a, 0.58);
  const w = Math.min(1, Math.max(0, (1 - a) / 0.75));
  return [g * (1 - 0.16 * w), g, g];
}

export class GraphicsController {
  private readonly pass = new LightPass({ sunDir: SUN_DIR, ambient: [1, 1, 1] });
  private readonly parallax = new ParallaxState();
  private key = '';
  private plan: GraphicsPlan | null = null;
  private applied = false;
  private anchor: [number, number] | null = null;
  private sources: MapLightSource[] = [];
  private field: LightField | null = null;
  private fieldElevation = 0;
  /** Ostatnio zastosowany plan (podglad dla testow/diagnostyki). */
  get current(): GraphicsPlan | null {
    return this.plan;
  }

  constructor(
    private readonly device: GfxDevice,
    private readonly getSettings: () => Settings,
    private readonly env: QualityEnv,
    private readonly canvas?: { style: { imageRendering: string } },
  ) {}

  /**
   * Podaje obiekty aktualnego poziomu (zrodla swiatla: flaga 0x20). Wolac po zaladowaniu mapy i
   * zmianie pietra; tanie, bez GL. Bez skutku, dopoki plan nie wlacza swiatel punktowych.
   */
  setLightObjects(objects: readonly EmitterLike[], elevation: number): void {
    this.sources = collectLightSources(objects, elevation);
    this.field = null;
    this.fieldElevation = elevation;
  }

  resetAnchor(): void {
    this.anchor = null;
  }

  /** `ambient` 0..1: swiatlo otoczenia mapy (skrypt/zegar, LightMap.ambientLevel); domyslnie 1 = bez przyciemnienia. */
  update(camX: number, camY: number, timeMs: number, zoom = 1, ambient = 1): void {
    const s = this.getSettings();
    const key = `${s.graphicsPreset}|${s.postFx}|${s.lighting}`;
    if (key !== this.key) {
      this.key = key;
      this.plan = planGraphics(s, this.env, timeMs);
      this.pass.enabled = this.plan.lighting;
      this.pass.setNormalStrength(this.plan.quality.normalStrength);
      this.parallax.enabled = this.plan.parallax;
      if (this.canvas) this.canvas.style.imageRendering = this.plan.pixelated ? 'pixelated' : '';
      if (!this.plan.active && this.applied) {
        this.device.setLighting?.(null);
        this.device.setPostProcess?.(null);
        this.applied = false;
      }
    }
    const plan = this.plan;
    if (!plan || !plan.active) return;
    this.applied = true;
    const amb = Number.isFinite(ambient) ? Math.min(1, Math.max(0, ambient)) : 1;
    this.pass.setAmbient(litAmbient(amb));
    if (!this.anchor) this.anchor = [camX, camY];
    let state: LitFrameState | null = null;
    let field: LightField | null = null;
    if (plan.points) {
      if (!this.field) {
        // ambient 1: mapa swiatla neutralna (mnoznik 1), blask dodaja UBO swiatel punktowych
        this.field = new LightField();
        this.field.update(this.sources, 1, this.fieldElevation);
      }
      field = this.field;
      const z = Math.max(0.01, zoom);
      const dpr = this.device.dpr || 1;
      this.pass.setLights(
        pickVisibleLights(
          this.sources,
          camX,
          camY,
          this.device.width / dpr / z / 2,
          this.device.height / dpr / z / 2,
        ),
      );
    } else if (this.pass.lightCount > 0) {
      this.pass.setLights([]);
    }
    if (plan.lighting) {
      state = buildLitFrameState(
        this.pass,
        field,
        this.parallax,
        [camX - this.anchor[0], camY - this.anchor[1]],
        timeMs,
      );
    }
    this.device.setLighting?.(state);
    // postFx zmienia sie w czasie (ziarno): odswiez tylko `time`, reszta konfiguracji z planu
    this.device.setPostProcess?.(plan.postProcess ? { ...plan.postProcess, time: timeMs } : null);
  }

  dispose(): void {
    if (this.applied) {
      this.device.setLighting?.(null);
      this.device.setPostProcess?.(null);
    }
    if (this.canvas) this.canvas.style.imageRendering = '';
  }
}

/** Klucze i18n skutkow aktywnego planu (podglad w ustawieniach). */
export function previewKeys(p: GraphicsPlan): string[] {
  if (!p.active) return [];
  const k: string[] = [];
  if (p.lighting) k.push('gfx.fx.lighting');
  if (p.parallax) k.push('gfx.fx.parallax');
  if (p.postProcess?.shadows) k.push('gfx.fx.shadows');
  if (p.postProcess?.ssao) k.push('gfx.fx.ssao');
  if (p.quality.postfx.bloom) k.push('gfx.fx.bloom');
  if (p.postProcess?.grading) k.push('gfx.fx.grading');
  if (p.quality.postfx.crt) k.push('gfx.fx.crt');
  if (p.pixelated) k.push('gfx.fx.pixelated');
  return k;
}
