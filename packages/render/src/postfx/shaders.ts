/** Shadery post-fx (GLSL ES 3.00); ta sama matematyka co referencja CPU w PostFx.ts. */

export const POSTFX_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uGamma;
uniform float uVignette;
uniform float uGrain;
uniform float uTime;
uniform float uCrtScanlines;
uniform float uCrtCurvature;
uniform float uCrtMask;
uniform float uCrtEnabled;
uniform vec2 uResolution;
uniform sampler2D uLut;
uniform float uLutSize;
uniform float uMix;

float hash(vec2 p, float t) {
  vec3 a = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973) + t * 0.0137);
  a += dot(a, a.yzx + 33.33);
  return fract((a.x + a.y) * a.z) * 2.0 - 1.0;
}

// LUT 3D jako pasek 2D (N*N x N), probkowanie ze srodka teksela
vec3 lutLookup(vec3 c) {
  float n = uLutSize;
  vec3 s = clamp(c, 0.0, 1.0) * (n - 1.0);
  float b0 = floor(s.b);
  float b1 = min(b0 + 1.0, n - 1.0);
  float fb = s.b - b0;
  vec2 uv0 = vec2((b0 * n + s.r + 0.5) / (n * n), (s.g + 0.5) / n);
  vec2 uv1 = vec2((b1 * n + s.r + 0.5) / (n * n), (s.g + 0.5) / n);
  return mix(texture(uLut, uv0).rgb, texture(uLut, uv1).rgb, fb);
}

void main() {
  vec2 uv = vUv;
  vec2 d = uv - 0.5;
  if (uCrtEnabled > 0.5) {
    uv = 0.5 + d * (1.0 + uCrtCurvature * dot(d, d) * 4.0);
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      fragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }
  }
  vec3 c = texture(uScene, uv).rgb + texture(uBloom, uv).rgb;
  c = pow(max(c, vec3(0.0)), vec3(1.0 / uGamma));
  c *= 1.0 - uVignette * smoothstep(0.4, 0.9, length(vUv - 0.5) * 1.41421356);
  c += hash(gl_FragCoord.xy, floor(uTime / 40.0)) * uGrain * 0.5;
  if (uCrtEnabled > 0.5) {
    c *= 1.0 - uCrtScanlines * mod(floor(gl_FragCoord.y), 2.0);
    float col = mod(floor(gl_FragCoord.x), 3.0);
    vec3 on = vec3(col < 0.5 ? 1.0 : 0.0, abs(col - 1.0) < 0.5 ? 1.0 : 0.0, col > 1.5 ? 1.0 : 0.0);
    c *= 1.0 - uCrtMask * (1.0 - on);
  }
  if (uMix > 0.0 && uLutSize > 1.0) c = mix(c, lutLookup(c), uMix);
  fragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;

export const BLOOM_EXTRACT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uScene;
uniform float uThreshold;
uniform float uStrength;
void main() {
  vec3 c = texture(uScene, vUv).rgb;
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  fragColor = vec4(c * max(0.0, lum - uThreshold) * uStrength, 1.0);
}
`;

export const BLOOM_BLUR_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform vec2 uDir;
void main() {
  vec2 o = uDir * uTexel;
  vec4 c = texture(uSrc, vUv) * 0.2270270270;
  c += (texture(uSrc, vUv + o) + texture(uSrc, vUv - o)) * 0.3162162162;
  c += (texture(uSrc, vUv + 2.0 * o) + texture(uSrc, vUv - 2.0 * o)) * 0.0702702703;
  fragColor = c;
}
`;

export const POSTFX_UNIFORM_NAMES = [
  'uScene',
  'uBloom',
  'uGamma',
  'uVignette',
  'uGrain',
  'uTime',
  'uCrtScanlines',
  'uCrtCurvature',
  'uCrtMask',
  'uCrtEnabled',
  'uResolution',
  'uLut',
  'uLutSize',
  'uMix',
] as const;
