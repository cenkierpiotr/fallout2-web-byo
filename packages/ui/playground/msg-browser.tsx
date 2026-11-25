import { useMemo, useState } from 'preact/hooks';
import { parseMsgEntries, type MsgEntry } from '../../engine-core/src';
import { Badge, Panel, Select, Toggle } from '../src';

export interface MsgFile {
  name: string;
  en: ReadonlyMap<number, MsgEntry>;
  /** Wpisy pakietu PL; brakujace id => fallback do angielskiego. */
  pl: ReadonlyMap<number, MsgEntry>;
}

export interface MsgRow {
  id: number;
  en: string;
  pl: string;
  fallback: boolean;
}

/** Wiersze pliku: id z angielskiego (pelny zbior), PL gdy jest, inaczej fallback = tekst EN. */
export function buildRows(file: MsgFile): MsgRow[] {
  return [...file.en.keys()]
    .sort((a, b) => a - b)
    .map((id) => {
      const en = file.en.get(id)!.text;
      const pl = file.pl.get(id);
      return { id, en, pl: pl ? pl.text : en, fallback: !pl };
    });
}

export function countFallbacks(rows: readonly MsgRow[]): number {
  return rows.reduce((n, r) => n + (r.fallback ? 1 : 0), 0);
}

const PLACEHOLDER_RE = /%[sdic%]|@[a-z]+@/gi;

/** Rozbija tekst na kawalki; placeholdery (%s %d @pc@ itp.) jako osobne, do podswietlenia. */
export function splitPlaceholders(text: string): { text: string; placeholder: boolean }[] {
  const out: { text: string; placeholder: boolean }[] = [];
  let last = 0;
  for (const m of text.matchAll(PLACEHOLDER_RE)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), placeholder: false });
    out.push({ text: m[0], placeholder: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), placeholder: false });
  return out;
}

/** Placeholdery PL i EN musza sie zgadzac co do liczby i rodzaju (kolejnosc dowolna). */
export function placeholdersMatch(en: string, pl: string): boolean {
  const key = (s: string) =>
    (s.match(PLACEHOLDER_RE) ?? [])
      .map((x) => x.toLowerCase())
      .sort()
      .join('|');
  return key(en) === key(pl);
}

function Rich({ text }: { text: string }) {
  return (
    <>
      {splitPlaceholders(text).map((p, i) =>
        p.placeholder ? (
          <mark key={i} data-testid="msg-placeholder" class="msg-ph">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

export function MsgBrowser({ files }: { files: readonly MsgFile[] }) {
  const [name, setName] = useState(files[0]?.name ?? '');
  const [onlyFallback, setOnlyFallback] = useState(false);
  const file = files.find((f) => f.name === name) ?? files[0];
  const rows = useMemo(() => (file ? buildRows(file) : []), [file]);
  const fallbacks = countFallbacks(rows);
  const shown = onlyFallback ? rows.filter((r) => r.fallback) : rows;
  if (!file) return <p>Brak plikow MSG.</p>;
  return (
    <Panel title="Przegladarka MSG">
      <div class="pg-row">
        <Select
          label="Plik MSG"
          value={file.name}
          onChange={setName}
          options={files.map((f) => ({ value: f.name, label: f.name }))}
        />
        <Toggle checked={onlyFallback} onChange={setOnlyFallback} label="Tylko fallback" />
        <Badge tone={fallbacks ? 'warning' : 'ok'}>
          <span data-testid="msg-fallback-count">{fallbacks}</span>
          {' / '}
          <span data-testid="msg-total">{rows.length}</span> fallback
        </Badge>
      </div>
      <table class="msg-table" data-testid="msg-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>EN</th>
            <th>PL</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr
              key={r.id}
              data-testid="msg-row"
              data-id={r.id}
              data-fallback={String(r.fallback)}
              data-ph-ok={String(placeholdersMatch(r.en, r.pl))}
            >
              <td>{r.id}</td>
              <td lang="en">
                <Rich text={r.en} />
              </td>
              <td lang="pl">
                <Rich text={r.pl} />
                {r.fallback && <Badge tone="warning">EN</Badge>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

const msg = (lines: [number, string][]) =>
  parseMsgEntries(lines.map(([id, t]) => `{${id}}{}{${t}}`).join('\n'));

/** Dane demonstracyjne playgroundu (w aplikacji: MsgLoader + warstwa pakietu PL). */
export const DEMO_MSG_FILES: MsgFile[] = [
  {
    name: 'game/stat.msg',
    en: msg([
      [100, 'Strength'],
      [101, 'Perception'],
      [102, 'Endurance'],
      [103, 'Charisma'],
    ]),
    pl: msg([
      [100, 'Siła'],
      [101, 'Percepcja'],
      [102, 'Wytrzymałość'],
    ]),
  },
  {
    name: 'game/skill.msg',
    en: msg([
      [504, 'You earn %d XP for honing your skills.'],
      [505, '@pc@ uses %s on %s.'],
    ]),
    pl: msg([
      [504, 'Zdobywasz %d PD za doskonalenie umiejętności.'],
      [505, '@pc@ używa %s na %s.'],
    ]),
  },
  {
    name: 'dialog/klint.msg',
    en: msg([[100, 'Zażółć gęślą jaźń? No way.']]),
    pl: msg([[100, 'Zażółć gęślą jaźń. ĄĆĘŁŃÓŚŹŻ']]),
  },
];

export function MsgBrowserDemo() {
  return (
    <main class="pg">
      <MsgBrowser files={DEMO_MSG_FILES} />
    </main>
  );
}
