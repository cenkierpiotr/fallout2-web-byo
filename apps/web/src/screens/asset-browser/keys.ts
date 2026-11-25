/** Czy skrot klawiszowy przegladarki zasobow ma zostac pominiety (modyfikatory, pola formularzy). */
export function shouldIgnoreKey(e: {
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  target: unknown;
}): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return true;
  const tag = (e.target as { tagName?: string } | null)?.tagName;
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
}
