export const VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec2 aUv;
layout(location = 2) in float aLight;
uniform vec2 uViewport;
uniform vec2 uCenter;
uniform float uZoom;
out vec2 vUv;
out float vLight;
void main() {
  vec2 screen = (aPos - uCenter) * uZoom + uViewport * 0.5;
  vec2 clip = vec2(screen.x / uViewport.x * 2.0 - 1.0, 1.0 - screen.y / uViewport.y * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  vUv = aUv;
  vLight = aLight;
}`;

export const FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform highp sampler2D uIndexed;
uniform highp sampler2D uPalette;
in vec2 vUv;
in float vLight;
out vec4 outColor;
void main() {
  int idx = int(texture(uIndexed, vUv).r * 255.0 + 0.5);
  vec4 c = texelFetch(uPalette, ivec2(idx, 0), 0);
  if (c.a == 0.0) discard;
  outColor = vec4(c.rgb * vLight, c.a);
}`;
