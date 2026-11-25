import { parseMsg } from '@f2/formats';
import type { VirtualFs } from '@f2/vfs';
import type { PackReader } from './object-text';

export interface GameMsgOptions {
  /** true = jezyk PL: pakiet jezykowy (UTF-8) nadpisuje angielskie wpisy. */
  pl?: boolean;
  pack?: PackReader;
}

/** Pole opcji dla jezyka gry wg ustawienia interfejsu (pakiet PL po HTTP). */
export function gameMsgOptions(pl: boolean, pack: PackReader): GameMsgOptions {
  return { pl, pack };
}

/** `text/english/game/<name>.msg` (cp1252) z nakladka pakietu PL `game/<name>.msg` (UTF-8), gdy jezyk PL. */
export async function readGameMsg(
  vfs: Pick<VirtualFs, 'open'>,
  name: string,
  opts: GameMsgOptions = {},
): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  try {
    const b = await vfs.open(`text/english/game/${name}.msg`);
    const buf = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    for (const [id, e] of parseMsg(buf)) out.set(id, e.text);
  } catch {
    /* brak pliku: nazwy zastepcze */
  }
  if (opts.pl && opts.pack) {
    const bytes = await opts.pack(`game/${name}.msg`).catch(() => null);
    if (bytes && bytes.byteLength > 0) {
      const buf = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;
      for (const [id, e] of parseMsg(buf, 'utf-8')) out.set(id, e.text);
    }
  }
  return out;
}
