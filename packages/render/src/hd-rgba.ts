/**
 * Sciezka RGBA (HD): wspolne czyste funkcje. Tekstury HD trafiaja do GPU jako premultiplied alpha
 * (blend ONE, ONE_MINUS_SRC_ALPHA), co przy filtrze liniowym daje krawedzie bez ciemnej obwodki.
 */

/** Kopia prostego RGBA z kanalami RGB przemnozonymi przez alfe (zaokraglone). */
export function premultiplyRgba(data: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length);
  for (let i = 0; i + 3 < data.length; i += 4) {
    const a = data[i + 3] as number;
    out[i] = Math.round(((data[i] as number) * a) / 255);
    out[i + 1] = Math.round(((data[i + 1] as number) * a) / 255);
    out[i + 2] = Math.round(((data[i + 2] as number) * a) / 255);
    out[i + 3] = a;
  }
  return out;
}

/**
 * Fragment RGBA z prefiltrem pudelkowym zaleznym od stopnia pomniejszenia. Atlasy HD sa 4x, a przy
 * zoomie 1 piksel ekranu pokrywa ~4x4 teksele; samo GL_LINEAR czyta wtedy tylko 2x2 z 16 i daje aliasing
 * (migotanie przy przesuwaniu o ulamek piksela). 4 sondy w +-1/4 stopy piksela (kazda dwuliniowa,
 * czyli 2x2 teksele) pokrywaja cala stope. Przy powiekszeniu stopa < 1 teksela i wynik = zwykly bilinear.
 * Odchylenie ograniczone do 2 teksele, zeby nie rozmywac krawedzi sasiednich sprite'ow w atlasie.
 */
export const RGBA_FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform highp sampler2D uIndexed;
in vec2 vUv;
in float vLight;
out vec4 outColor;
void main() {
  vec2 lim = 2.0 / vec2(textureSize(uIndexed, 0));
  vec2 dx = clamp(dFdx(vUv) * 0.25, -lim, lim);
  vec2 dy = clamp(dFdy(vUv) * 0.25, -lim, lim);
  vec4 c = 0.25 * (
    texture(uIndexed, vUv + dx + dy) +
    texture(uIndexed, vUv + dx - dy) +
    texture(uIndexed, vUv - dx + dy) +
    texture(uIndexed, vUv - dx - dy));
  if (c.a == 0.0) discard;
  outColor = vec4(c.rgb * vLight, c.a);
}`;
