/** Shadery cieni rzucanych (GLSL ES 3.00). Sylwetka sprite'a skosem po plaszczyznie podlogi. */
export const SHADOW_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec2 aUv;
layout(location = 2) in float aHeight;
uniform mat3 uSkew;
uniform vec2 uViewport;
uniform vec2 uCenter;
uniform float uZoom;
out vec2 vUv;
void main() {
  // aPos w swiecie; kamera jak w sprite: (p - uCenter) * uZoom (uZoom musi byc ustawione jawnie)
  vec3 p = uSkew * vec3(aPos - uCenter, aHeight);
  vec2 ndc = p.xy * uZoom * 2.0 / uViewport;
  gl_Position = vec4(ndc.x, -ndc.y, 0.0, 1.0);
  vUv = aUv;
}
`;

export const SHADOW_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uAlphaAtlas;
uniform sampler2D uPalette;
/** 1: atlas indeksowany (R8), alfa z palety (indeks 0 -> paleta[0].a); 0: alfa z kanalu A. */
uniform int uPaletteMode;
uniform float uOpacity;
uniform float uFeather;
/** > 0.5: rysuje tylko piksele sprite'a (alpha >= 0.5), do odtworzenia "bez cienia" pod sylwetka. */
uniform float uCutout;
out float fragShadow;
void main() {
  float a = texture(uAlphaAtlas, vUv).a;
  if (uPaletteMode == 1) {
    int idx = int(texture(uAlphaAtlas, vUv).r * 255.0 + 0.5);
    a = texelFetch(uPalette, ivec2(idx, 0), 0).a;
  }
  if (uCutout > 0.5 && a < 0.5) discard;
  fragShadow = 1.0 - uOpacity * smoothstep(0.0, max(uFeather, 0.0001), a);
}
`;

/** Separowalny gauss maski cienia (R8); sigma jak gaussianKernel: max(radius / 2, 0.5). */
export const SHADOW_BLUR_FRAG = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
uniform sampler2D uMask;
uniform vec2 uDirection;
uniform vec2 uTexel;
uniform int uRadius;
out float fragShadow;
void main() {
  if (uRadius <= 0) {
    fragShadow = texture(uMask, vUv).r;
    return;
  }
  float sigma = max(float(uRadius) / 2.0, 0.5);
  float sum = 0.0;
  float ws = 0.0;
  for (int i = -16; i <= 16; i++) {
    if (i < -uRadius || i > uRadius) continue;
    float w = exp(-0.5 * float(i * i) / (sigma * sigma));
    sum += texture(uMask, clamp(vUv + uDirection * uTexel * float(i), vec2(0.0), vec2(1.0))).r * w;
    ws += w;
  }
  fragShadow = sum / ws;
}
`;

/**
 * Cienie punktowe: wierzcholek (x, y, h) rzutowany radialnie z pozycji swiatla (uLight, wysokosc
 * uLightZ) na podloge: p = L + (x - L) * z / (z - h), h przyciete do 0.8 z. uProject = 0: pozycja
 * bez rzutu (przebieg "bez cienia pod sylwetka"). vGround to pozycja na podlodze (do tlumienia).
 */
export const POINT_SHADOW_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec2 aUv;
layout(location = 2) in float aHeight;
uniform vec2 uLight;
uniform float uLightZ;
uniform float uProject;
uniform vec2 uViewport;
uniform vec2 uCenter;
uniform float uZoom;
out vec2 vUv;
out vec2 vGround;
void main() {
  float h = min(aHeight, uLightZ * 0.8);
  float t = mix(1.0, uLightZ / (uLightZ - h), uProject);
  vec2 g = uLight + (aPos - uLight) * t;
  vec2 ndc = (g - uCenter) * uZoom * 2.0 / uViewport;
  gl_Position = vec4(ndc.x, -ndc.y, 0.0, 1.0);
  vUv = aUv;
  vGround = g;
}
`;

/** Jak SHADOW_FRAG, ale ciemnosc zalezy od odleglosci od swiatla (smoothstep jak w shaderze swiatla). */
export const POINT_SHADOW_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
in vec2 vGround;
uniform sampler2D uAlphaAtlas;
uniform sampler2D uPalette;
uniform int uPaletteMode;
uniform float uOpacity;
uniform float uFeather;
uniform float uCutout;
uniform vec2 uLight;
uniform float uRadius;
uniform float uIntensity;
out vec4 fragShadow;
void main() {
  float a = texture(uAlphaAtlas, vUv).a;
  if (uPaletteMode == 1) {
    int idx = int(texture(uAlphaAtlas, vUv).r * 255.0 + 0.5);
    a = texelFetch(uPalette, ivec2(idx, 0), 0).a;
  }
  if (uCutout > 0.5 && a < 0.5) discard;
  float t = clamp(1.0 - distance(vGround, uLight) / max(uRadius, 1e-6), 0.0, 1.0);
  float att = t * t * (3.0 - 2.0 * t);
  float v = 1.0 - uOpacity * clamp(uIntensity, 0.0, 1.0) * att * smoothstep(0.0, max(uFeather, 0.0001), a);
  fragShadow = vec4(v);
}
`;

/** Gauss maski RGBA (4 kanaly = 4 swiatla), jak SHADOW_BLUR_FRAG. */
export const POINT_SHADOW_BLUR_FRAG = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
uniform sampler2D uMask;
uniform vec2 uDirection;
uniform vec2 uTexel;
uniform int uRadius;
out vec4 fragShadow;
void main() {
  if (uRadius <= 0) {
    fragShadow = texture(uMask, vUv);
    return;
  }
  float sigma = max(float(uRadius) / 2.0, 0.5);
  vec4 sum = vec4(0.0);
  float ws = 0.0;
  for (int i = -16; i <= 16; i++) {
    if (i < -uRadius || i > uRadius) continue;
    float w = exp(-0.5 * float(i * i) / (sigma * sigma));
    sum += texture(uMask, clamp(vUv + uDirection * uTexel * float(i), vec2(0.0), vec2(1.0))) * w;
    ws += w;
  }
  fragShadow = sum / ws;
}
`;

/** Pelnoekranowy trojkat (gl_VertexID), do przejsc blur/SSAO/grading. */
export const FULLSCREEN_VERT = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;
