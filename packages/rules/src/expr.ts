type Tok = { t: 'n'; v: number } | { t: 'i'; v: string } | { t: 'o'; v: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  const re = /\s*(?:(\d+(?:\.\d+)?)|([A-Za-z_]\w*)|([-+*/(),]))/y;
  let pos = 0;
  while (pos < src.length) {
    re.lastIndex = pos;
    const m = re.exec(src);
    if (!m) {
      if (/^\s*$/.test(src.slice(pos))) break;
      throw new Error(`expr: nieoczekiwany znak przy ${pos}`);
    }
    if (m[1] !== undefined) out.push({ t: 'n', v: Number(m[1]) });
    else if (m[2] !== undefined) out.push({ t: 'i', v: m[2] });
    else out.push({ t: 'o', v: m[3] as string });
    pos = re.lastIndex;
  }
  return out;
}

/** Mini-ewaluator wyrazen z stats.json: liczby, zmienne, + - * /, max, min, trunc. */
export function evalExpr(src: string, vars: Readonly<Record<string, number>>): number {
  const toks = tokenize(src);
  let p = 0;
  const peekOp = (v: string): boolean => {
    const k = toks[p];
    return k !== undefined && k.t === 'o' && k.v === v;
  };
  const expectOp = (v: string): void => {
    if (!peekOp(v)) throw new Error(`expr: oczekiwano '${v}'`);
    p++;
  };
  const args = (): number[] => {
    expectOp('(');
    const a = [expr()];
    while (peekOp(',')) {
      p++;
      a.push(expr());
    }
    expectOp(')');
    return a;
  };
  const primary = (): number => {
    const k = toks[p++];
    if (!k) throw new Error('expr: nieoczekiwany koniec');
    if (k.t === 'n') return k.v;
    if (k.t === 'o') {
      if (k.v === '-') return -primary();
      if (k.v === '(') {
        const v = expr();
        expectOp(')');
        return v;
      }
      throw new Error(`expr: nieoczekiwany '${k.v}'`);
    }
    if (peekOp('(')) {
      const a = args();
      if (k.v === 'max') return Math.max(...a);
      if (k.v === 'min') return Math.min(...a);
      if (k.v === 'trunc' && a.length === 1) return Math.trunc(a[0] as number);
      throw new Error(`expr: nieznana funkcja ${k.v}`);
    }
    const v = vars[k.v];
    if (v === undefined) throw new Error(`expr: nieznana zmienna ${k.v}`);
    return v;
  };
  const term = (): number => {
    let v = primary();
    while (peekOp('*') || peekOp('/')) {
      const op = (toks[p++] as { v: string }).v;
      const r = primary();
      v = op === '*' ? v * r : v / r;
    }
    return v;
  };
  function expr(): number {
    let v = term();
    while (peekOp('+') || peekOp('-')) {
      const op = (toks[p++] as { v: string }).v;
      const r = term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }
  const result = expr();
  if (p !== toks.length) throw new Error('expr: nadmiarowe tokeny');
  return result;
}
