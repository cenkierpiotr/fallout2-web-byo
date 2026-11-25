/** Wersja aplikacji: semver z package.json, sha z gita, wersja schematu zapisu, czas builda. */
export interface AppVersion {
  semver: string;
  sha: string;
  schemaVersion: number;
  builtAt: string;
}

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/;

export function isSemver(s: string): boolean {
  return SEMVER.test(s);
}

/** Porownanie semver (bez prerelease w kolejnosci): -1, 0, 1. */
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const pa = SEMVER.exec(a);
  const pb = SEMVER.exec(b);
  if (!pa || !pb) throw new Error(`niepoprawny semver: ${!pa ? a : b}`);
  for (let i = 1; i <= 3; i++) {
    const d = Number(pa[i]) - Number(pb[i]);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** Waliduje obiekt (np. z version.json) i zwraca AppVersion albo null. */
export function parseAppVersion(raw: unknown): AppVersion | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.semver !== 'string' || !isSemver(o.semver)) return null;
  if (typeof o.sha !== 'string' || typeof o.builtAt !== 'string') return null;
  if (typeof o.schemaVersion !== 'number' || !Number.isInteger(o.schemaVersion)) return null;
  return { semver: o.semver, sha: o.sha, schemaVersion: o.schemaVersion, builtAt: o.builtAt };
}
