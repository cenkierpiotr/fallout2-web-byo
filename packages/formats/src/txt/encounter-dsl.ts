export class EncounterDslError extends Error {
  constructor(
    message: string,
    public column: number,
  ) {
    super(`${message} (kolumna ${column})`);
    this.name = 'EncounterDslError';
  }
}

export type CmpOp = '<' | '>' | '<=' | '>=' | '==' | '&';
export type Expr =
  | { op: CmpOp | 'and'; left: Expr; right: Expr }
  | { kind: 'player'; stat: string }
  | { kind: 'global'; idx: number }
  | { kind: 'time' }
  | { kind: 'enctr'; what: 'Num_Critters' }
  | { kind: 'rand'; pct: number }
  | { kind: 'const'; value: number };

type Tok = { t: 'id' | 'int' | 'op' | '(' | ')' | '%'; v: string; col: number };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    const col = i + 1;
    if (/\s/.test(c)) {
      i++;
    } else if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j]!)) j++;
      out.push({ t: 'id', v: src.slice(i, j), col });
      i = j;
    } else if (/\d/.test(c) || (c === '-' && /\d/.test(src[i + 1] ?? ''))) {
      let j = i + 1;
      while (j < src.length && /\d/.test(src[j]!)) j++;
      out.push({ t: 'int', v: src.slice(i, j), col });
      i = j;
    } else if (c === '(' || c === ')' || c === '%') {
      out.push({ t: c, v: c, col });
      i++;
    } else if (c === '<' || c === '>') {
      const two = src[i + 1] === '=';
      out.push({ t: 'op', v: two ? `${c}=` : c, col });
      i += two ? 2 : 1;
    } else if (c === '=' && src[i + 1] === '=') {
      out.push({ t: 'op', v: '==', col });
      i += 2;
    } else if (c === '&') {
      out.push({ t: 'op', v: '&', col });
      i++;
    } else {
      throw new EncounterDslError(`Nieoczekiwany znak '${c}'`, col);
    }
  }
  return out;
}

/** Parser warunkow encounterow: `If (A) and If (B)`; bez eval. */
export function parseCondition(src: string): Expr {
  const toks = tokenize(src);
  let p = 0;
  const endCol = src.length + 1;
  const peek = (): Tok | undefined => toks[p];
  const isId = (t: Tok | undefined, w: string): boolean => t?.t === 'id' && t.v.toLowerCase() === w;
  const err = (msg: string, t?: Tok): never => {
    throw new EncounterDslError(msg, t?.col ?? endCol);
  };
  const expect = (type: Tok['t']): Tok => {
    const t = peek();
    if (!t || t.t !== type) return err(`Oczekiwano '${type}'`, t);
    p++;
    return t;
  };

  function expr(): Expr {
    let left = term();
    while (isId(peek(), 'and')) {
      p++;
      left = { op: 'and', left, right: term() };
    }
    return left;
  }
  function term(): Expr {
    if (isId(peek(), 'if')) {
      p++;
      expect('(');
      const e = expr();
      expect(')');
      return e;
    }
    return cmp();
  }
  function cmp(): Expr {
    const left = operand();
    const t = peek();
    if (t?.t === 'op') {
      p++;
      return { op: t.v as CmpOp, left, right: operand() };
    }
    return left;
  }
  function operand(): Expr {
    const t = peek();
    if (!t) return err('Nieoczekiwany koniec wejscia');
    if (t.t === 'int') {
      p++;
      return { kind: 'const', value: Number(t.v) };
    }
    if (t.t === '(') {
      p++;
      const e = expr();
      expect(')');
      return e;
    }
    if (t.t !== 'id') return err(`Nieoczekiwany token '${t.v}'`, t);
    const w = t.v.toLowerCase();
    p++;
    if (w === 'time' || w === 'time_of_day') return { kind: 'time' };
    if (w === 'player') {
      expect('(');
      const stat = expect('id').v;
      expect(')');
      return { kind: 'player', stat };
    }
    if (w === 'global') {
      expect('(');
      const idx = Number(expect('int').v);
      expect(')');
      return { kind: 'global', idx };
    }
    if (w === 'rand') {
      expect('(');
      const pct = Number(expect('int').v);
      expect('%');
      expect(')');
      return { kind: 'rand', pct };
    }
    if (w === 'enctr') {
      expect('(');
      const what = expect('id');
      if (what.v.toLowerCase() !== 'num_critters') err(`Nieznany parametr Enctr '${what.v}'`, what);
      expect(')');
      return { kind: 'enctr', what: 'Num_Critters' };
    }
    return err(`Nieznana funkcja '${t.v}'`, t);
  }

  const e = expr();
  const rest = peek();
  if (rest) err(`Nieoczekiwany token '${rest.v}' po wyrazeniu`, rest);
  return e;
}
