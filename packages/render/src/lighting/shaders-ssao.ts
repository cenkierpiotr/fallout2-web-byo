/** Shadery SSAO polrozdzielczosciowego (GLSL ES 3.00). */
export const SSAO_VERT = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const SSAO_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uDepth;
uniform sampler2D uNormal;
uniform sampler2D uNoise;
uniform vec3 uKernel[8];
uniform float uRadius;
uniform float uStrength;
uniform float uProjScale;
uniform vec2 uTexel;
/** Skala glebi (gl_FragDepth sceny = glebia atlasu * 0.01, wiec potok ustawia 100; testy 1). */
uniform float uDepthScale;
/** 1: tryb pierscienia zgodny z computeAoCpu (offsety uRing w pikselach, uSamples probek). */
uniform int uUseRing;
uniform vec2 uRing[8];
uniform int uSamples;
out float fragAo;
void main() {
  float depth = texture(uDepth, vUv).r * uDepthScale;
  if (uUseRing == 1) {
    float occR = 0.0;
    for (int i = 0; i < 8; i++) {
      if (i >= uSamples) break;
      vec2 suv = clamp(vUv + uRing[i] * uTexel, 0.5 * uTexel, 1.0 - 0.5 * uTexel);
      float sdr = texture(uDepth, suv).r * uDepthScale;
      occR += (sdr > depth + 0.02) ? 1.0 : 0.0;
    }
    fragAo = 1.0 - uStrength * (occR / float(max(uSamples, 1)));
    return;
  }
  vec3 n = normalize(texture(uNormal, vUv).rgb * 2.0 - 1.0);
  vec2 rot = texture(uNoise, vUv / (uTexel * 4.0)).xy * 2.0 - 1.0;
  mat2 R = mat2(rot.x, rot.y, -rot.y, rot.x);
  float occ = 0.0;
  for (int i = 0; i < 8; i++) {
    vec3 k = uKernel[i];
    // probka w ekranie, wychylona wzdluz xy normalnej (orientacja polsfery)
    vec2 off = (R * (k.xy + n.xy * k.z)) * uRadius * uTexel;
    float sd = texture(uDepth, vUv + off).r * uDepthScale;
    float diff = sd - depth;
    float range = smoothstep(0.0, 1.0, uRadius * uProjScale / max(abs(diff), 0.0001));
    occ += (diff > 0.02 ? 1.0 : 0.0) * range;
  }
  fragAo = 1.0 - uStrength * (occ / 8.0);
}
`;

export const BILATERAL_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uAo;
uniform sampler2D uDepth;
uniform vec2 uDirection;
uniform vec2 uTexel;
/** Skala glebi jak w SSAO_FRAG (potok 100, testy 1). */
uniform float uDepthScale;
out float fragAo;
void main() {
  float cd = texture(uDepth, vUv).r * uDepthScale;
  float sum = 0.0;
  float ws = 0.0;
  for (int i = -2; i <= 2; i++) {
    vec2 uv = vUv + uDirection * uTexel * float(i);
    float dz = texture(uDepth, uv).r * uDepthScale - cd;
    float w = exp(-float(i * i) / 8.0) * exp(-dz * dz / (2.0 * 0.05 * 0.05));
    sum += texture(uAo, uv).r * w;
    ws += w;
  }
  fragAo = ws > 0.0 ? sum / ws : texture(uAo, vUv).r;
}
`;
