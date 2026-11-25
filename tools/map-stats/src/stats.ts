export interface PidStat {
  pid: number;
  occurrences: number;
  maps: number;
}

/** Zlicza wystapienia pidow krytera (typ 1) na mapach. `maps` = liczba roznych map z danym pidem. */
export function countCritters(perMap: Map<string, number[]>): PidStat[] {
  const total = new Map<number, number>();
  const mapCount = new Map<number, number>();
  for (const pids of perMap.values()) {
    const seen = new Set<number>();
    for (const pid of pids) {
      if (pid >>> 24 !== 1) continue;
      total.set(pid, (total.get(pid) ?? 0) + 1);
      seen.add(pid);
    }
    for (const pid of seen) mapCount.set(pid, (mapCount.get(pid) ?? 0) + 1);
  }
  return [...total.entries()]
    .map(([pid, occurrences]) => ({ pid, occurrences, maps: mapCount.get(pid) ?? 0 }))
    .sort((a, b) => b.occurrences - a.occurrences || a.pid - b.pid);
}

export function renderStats(
  stats: PidStat[],
  names: Map<number, string>,
  info: { maps: number; top: number; date: string },
): string {
  const hex = (n: number): string => `0x${n.toString(16).padStart(8, '0')}`;
  const rows = stats
    .slice(0, info.top)
    .map(
      (s, i) =>
        `| ${i + 1} | ${hex(s.pid)} | ${names.get(s.pid) ?? '?'} | ${s.occurrences} | ${s.maps} |`,
    );
  return [
    '# Statystyki krytera na mapach',
    '',
    `Data: ${info.date}. Zrodlo: ${info.maps} map (wariant z warstwy o najwyzszym priorytecie), obiekty krytera na mapach (bez ekwipunku).`,
    `Rozne pidy krytera: ${stats.length}. Top ${info.top} do HD P2 (sekcja 6.2).`,
    '',
    '| # | pid | plik PRO | wystapienia | map |',
    '|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');
}
