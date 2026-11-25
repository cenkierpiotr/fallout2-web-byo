/** Sciezki zasobow dzwiekowych w VFS (klucze znormalizowane: male litery, ukosnik). */
export const speechPath = (dir: string, name: string): string =>
  `sound/speech/${dir}/${name}.acm`.toLowerCase();
export const lipPath = (dir: string, name: string): string =>
  `sound/speech/${dir}/${name}.lip`.toLowerCase();
export const musicPath = (name: string): string => `sound/music/${name}.acm`.toLowerCase();
export { sfxPath } from '@f2/audio';
