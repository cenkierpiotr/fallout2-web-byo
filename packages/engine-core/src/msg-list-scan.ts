/**
 * Wstepny skan bytekodu .int: ktore listy komunikatow (numer wiersza scripts.lst, 1-bazowy) skrypt wskazuje
 * stalymi w wywolaniach message_str/gsay_*. Skrypty czesto czytaja cudza liste (np. mcBess czyta teksty
 * ZCBrahmn), a `messageStr` jest synchroniczne: bez wczesniejszego zaladowania pierwsze wywolanie zwracalo ''
 * (pusty floater), dopiero kolejne mialo tekst.
 */
import type { IntScript } from '@f2/formats';

const OP_PUSH_INT = 0xc001;
/** opkod -> [liczba argumentow, indeks (od poczatku) argumentu `list`]. */
const LIST_ARG: ReadonlyMap<number, readonly [number, number]> = new Map([
  [0x8105, [2, 0]], // message_str(list, msg)
  [0x811e, [2, 0]], // gsay_reply(list, msg)
  [0x811f, [4, 0]], // gsay_option(list, msg, proc, reaction)
  [0x8120, [3, 0]], // gsay_message(list, msg, reaction)
  [0x8121, [5, 1]], // giq_option(iq, list, msg, proc, reaction)
]);

/** Numery list (1-bazowe) podane jako stala tuz przed wywolaniem; kolejnosc rosnaca, bez duplikatow. */
export function referencedMsgLists(script: IntScript): number[] {
  const v = script.code;
  const found = new Set<number>();
  const recent: { op: number; arg: number }[] = [];
  let pc = script.codeOffset;
  while (pc + 2 <= v.byteLength) {
    const op = v.getUint16(pc, false);
    if ((op & 0x8000) === 0) break; // dalej nie jest kod (np. tablica identyfikatorow)
    pc += 2;
    let arg = 0;
    if ((op & 0x3ff) === 1) {
      if (pc + 4 > v.byteLength) break;
      arg = v.getUint32(pc, false) | 0;
      pc += 4;
    }
    const spec = LIST_ARG.get(op);
    if (spec) {
      const [argc, idx] = spec;
      const a = recent[recent.length - argc + idx];
      if (a && a.op === OP_PUSH_INT && a.arg > 0 && a.arg < 100000) found.add(a.arg);
    }
    recent.push({ op, arg });
    if (recent.length > 8) recent.shift();
  }
  return [...found].sort((a, b) => a - b);
}
