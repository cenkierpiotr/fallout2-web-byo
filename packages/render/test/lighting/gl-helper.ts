/** Kompilacja shaderow tylko gdy dostepny WebGL2 (przegladarka/headless-gl); w Node: pomijana. */
function getGl(): WebGL2RenderingContext | null {
  try {
    const doc = (globalThis as { document?: Document }).document;
    if (!doc) return null;
    return doc.createElement('canvas').getContext('webgl2');
  } catch {
    return null;
  }
}

const gl = getGl();

export const compilesOrSkip = {
  available: gl !== null,
  /** Zwraca log bledow ('' = OK). Dla pary vert+frag linkuje program. */
  compile(vert: string, frag: string): string {
    if (!gl) return 'brak WebGL';
    const mk = (type: number, src: string): WebGLShader => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const vs = mk(gl.VERTEX_SHADER, vert);
    const fs = mk(gl.FRAGMENT_SHADER, frag);
    const p = gl.createProgram()!;
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    return gl.getProgramParameter(p, gl.LINK_STATUS)
      ? ''
      : `${gl.getShaderInfoLog(vs) ?? ''}${gl.getShaderInfoLog(fs) ?? ''}${gl.getProgramInfoLog(p) ?? ''}`;
  },
};
