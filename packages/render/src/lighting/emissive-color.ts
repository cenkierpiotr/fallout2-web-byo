/** Srednia kolorow cyklu palety (indeksy first..last wlacznie), paleta RGB 256*3 (0..255). */
export function averageCycleColor(
  palette: Uint8Array,
  firstIndex: number,
  lastIndex: number,
): [number, number, number] {
  if (palette.length < 768) throw new RangeError('paleta musi miec 768 bajtow');
  if (
    !Number.isInteger(firstIndex) ||
    !Number.isInteger(lastIndex) ||
    firstIndex < 0 ||
    lastIndex > 255 ||
    firstIndex > lastIndex
  ) {
    throw new RangeError('zly zakres indeksow palety');
  }
  const sum = [0, 0, 0];
  for (let i = firstIndex; i <= lastIndex; i++) {
    for (let c = 0; c < 3; c++) sum[c] = (sum[c] ?? 0) + (palette[i * 3 + c] ?? 0);
  }
  const n = lastIndex - firstIndex + 1;
  return [
    Math.round((sum[0] ?? 0) / n),
    Math.round((sum[1] ?? 0) / n),
    Math.round((sum[2] ?? 0) / n),
  ];
}

export function emissiveLightColor(kind: 'fire' | 'monitor' | 'white'): [number, number, number] {
  if (kind === 'fire') return [255, 170, 80];
  if (kind === 'monitor') return [90, 255, 120];
  return [255, 255, 255];
}
