import { type AppVersion, compareSemver, parseAppVersion } from './version.js';

/** Zrodlo informacji o wersji wdrozonej (zwykle `fetch('version.json', { cache: 'no-store' })`). */
export type FetchVersion = () => Promise<unknown>;

export interface UpdateManagerDeps {
  current: AppVersion;
  fetchVersion: FetchVersion;
  /** True, gdy trwa zapis gry: aktywacja nowej wersji jest wtedy zablokowana. */
  saveInProgress: () => boolean;
  /** Wysyla do czekajacego service workera komende SKIP_WAITING i czeka na controllerchange. */
  activate: () => Promise<void>;
  /** Przeladowanie strony po aktywacji. */
  reload: () => void;
}

export type CheckResult = 'none' | 'available';

export class UpdateBlockedError extends Error {
  constructor() {
    super('update-blocked-by-save');
    this.name = 'UpdateBlockedError';
  }
}

/**
 * Menedzer aktualizacji. Nowa wersja nigdy nie aktywuje sie sama: `apply()` wymaga zgody
 * wywolujacego i jest odrzucane w trakcie zapisu (`UpdateBlockedError`).
 */
export class UpdateManager {
  private pendingVersion: AppVersion | null = null;

  constructor(private readonly deps: UpdateManagerDeps) {}

  get current(): AppVersion {
    return this.deps.current;
  }

  get pending(): AppVersion | null {
    return this.pendingVersion;
  }

  /** Gdy wdrozona wersja ma nowszy schemat zapisu, UI pokazuje komunikat o migracji przed pierwszym zapisem. */
  get needsMigrationNotice(): boolean {
    return (
      this.pendingVersion !== null && this.pendingVersion.schemaVersion > this.current.schemaVersion
    );
  }

  async check(): Promise<CheckResult> {
    let raw: unknown;
    try {
      raw = await this.deps.fetchVersion();
    } catch {
      return 'none'; // offline: brak informacji, nie blad
    }
    const v = parseAppVersion(raw);
    if (!v) return 'none';
    const newer =
      compareSemver(v.semver, this.current.semver) > 0 ||
      (compareSemver(v.semver, this.current.semver) === 0 && v.sha !== this.current.sha);
    this.pendingVersion = newer ? v : null;
    return newer ? 'available' : 'none';
  }

  async apply(): Promise<void> {
    if (this.pendingVersion === null) return;
    if (this.deps.saveInProgress()) throw new UpdateBlockedError();
    await this.deps.activate();
    this.deps.reload();
  }
}
