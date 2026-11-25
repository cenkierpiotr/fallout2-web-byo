import type { CategoryStats } from './inventory.js';

const HEAD = '| Kategoria | Pliki | Klatki | Piksele | Max szer. | Max wys. | Animowane |';
const SEP = '|---|---:|---:|---:|---:|---:|---:|';

function row(c: CategoryStats): string {
  return `| ${c.category} | ${c.files} | ${c.frames} | ${c.pixels} | ${c.maxWidth} | ${c.maxHeight} | ${c.animated} |`;
}

export function renderReport(
  stats: CategoryStats[],
  meta: { date: string; sources: string[] },
): string {
  const sorted = [...stats].sort(
    (a, b) => b.pixels - a.pixels || a.category.localeCompare(b.category),
  );
  const total: CategoryStats = {
    category: 'Razem',
    files: 0,
    frames: 0,
    pixels: 0,
    maxWidth: 0,
    maxHeight: 0,
    animated: 0,
  };
  for (const c of sorted) {
    total.files += c.files;
    total.frames += c.frames;
    total.pixels += c.pixels;
    total.animated += c.animated;
    total.maxWidth = Math.max(total.maxWidth, c.maxWidth);
    total.maxHeight = Math.max(total.maxHeight, c.maxHeight);
  }
  return [
    '# Inwentarz grafiki (FRM)',
    '',
    `Data: ${meta.date}`,
    '',
    `Zrodla: ${meta.sources.join(', ')}`,
    '',
    HEAD,
    SEP,
    ...sorted.map(row),
    row(total),
    '',
  ].join('\n');
}
