/** Shadery sprite'ow z normal mappingiem (GLSL ES 3.00). Uzywane tylko gdy LightPass.enabled. */
export const SPRITE_LIT_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec2 aUv;
layout(location = 2) in float aDepthBias;
layout(location = 3) in float aLayer;
uniform vec2 uViewport;
uniform vec2 uCenter;
uniform float uZoom;
uniform vec2 uCameraDelta;
uniform float uParallaxFactor;
out vec2 vUv;
out vec2 vWorld;
out float vDepthBias;
void main() {
  vec2 pos = aPos + uCameraDelta * (aLayer - 0.5) * uParallaxFactor;
  vec2 ndc = (pos - uCenter) * uZoom * 2.0 / uViewport;
  gl_Position = vec4(ndc.x, -ndc.y, 0.0, 1.0);
  vUv = aUv;
  vWorld = pos;
  vDepthBias = aDepthBias;
}
`;

export const SPRITE_LIT_FRAG = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
in vec2 vUv;
in vec2 vWorld;
in float vDepthBias;
uniform sampler2D uAtlas;
uniform sampler2D uAtlasNormal;
uniform sampler2D uAtlasDepth;
uniform sampler2D uLightMap;
uniform sampler2D uPalette;
uniform sampler2D uShadowMask;
// cienie punktowe: kanal i = swiatlo i (1 = oswietlone), tylko gdy uUsePointShadow > 0.5
uniform sampler2D uPointShadow;
uniform float uUsePointShadow;
// swiat -> kolumna/wiersz heksa: xy = uLightMapInv * (world - uLightMapOrigin); uv = (xy + 0.5) / rozmiar
uniform mat2 uLightMapInv;
uniform vec2 uLightMapOrigin;
uniform vec2 uLightMapSize;
uniform vec2 uViewport;
struct Light {
  vec4 posRadius;
  vec4 colorIntensity;
};
layout(std140) uniform Lights {
  Light uLights[16];
};
uniform int uLightCount;
uniform vec3 uAmbient;
uniform vec3 uSunDir;
uniform int uPaletteMode;
uniform float uNormalStrength;
uniform float uTime;
uniform float uUseShadowMask;
layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 fragNormal;
void main() {
  vec4 base = texture(uAtlas, vUv);
  vec3 albedo = base.rgb;
  float alpha = base.a;
  if (uPaletteMode == 1) {
    int idx = int(base.r * 255.0 + 0.5);
    vec4 pal = texelFetch(uPalette, ivec2(idx, 0), 0);
    albedo = pal.rgb;
    alpha = pal.a;
  }
  if (alpha < 0.01) discard;
  vec3 nTex = texture(uAtlasNormal, vUv).rgb * 2.0 - 1.0;
  vec3 n = normalize(mix(vec3(0.0, 0.0, 1.0), nTex, uNormalStrength));
  float depthSample = texture(uAtlasDepth, vUv).r;
  vec2 hexXy = uLightMapInv * (vWorld - uLightMapOrigin);
  vec3 lightmap = texture(uLightMap, (hexXy + 0.5) / uLightMapSize).rgb;
  float shadow = 1.0;
  if (uUseShadowMask > 0.5) {
    shadow = texture(uShadowMask, gl_FragCoord.xy / uViewport).r;
  }
  vec4 pointShadow = vec4(1.0);
  if (uUsePointShadow > 0.5) {
    pointShadow = texture(uPointShadow, gl_FragCoord.xy / uViewport);
  }
  vec3 lit = uAmbient * lightmap * shadow;
  for (int i = 0; i < 16; i++) {
    if (i >= uLightCount) break;
    vec3 lp = uLights[i].posRadius.xyz;
    float radius = uLights[i].posRadius.w;
    vec3 toL = vec3(lp.xy - vWorld, lp.z);
    float dist = length(toL);
    float lambert = max(dot(n, toL / max(dist, 1e-6)), 0.0);
    // jak smoothstep(radius, 0, dist), ale bez niezdefiniowanego edge0 >= edge1
    float t = clamp(1.0 - dist / max(radius, 1e-6), 0.0, 1.0);
    float att = t * t * (3.0 - 2.0 * t);
    float occl = 1.0;
    if (i < 4) occl = i == 0 ? pointShadow.r : (i == 1 ? pointShadow.g : (i == 2 ? pointShadow.b : pointShadow.a));
    lit += uLights[i].colorIntensity.rgb * uLights[i].colorIntensity.w * lambert * att * occl;
  }
  fragColor = vec4(albedo * lit, alpha);
  fragNormal = vec4(n * 0.5 + 0.5, alpha);
  gl_FragDepth = clamp(vDepthBias + depthSample * 0.01, 0.0, 1.0);
}
`;
