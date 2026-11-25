/** Warstwa VFS. Sciezki sa normalizowane przez normalizeDatPath. */
export interface VfsLayer {
  readonly name: string;
  has(path: string): boolean;
  open(path: string): Promise<Uint8Array>;
  keys(): Iterable<string>;
}
