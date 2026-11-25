import { writeSync } from 'node:fs';
import { openGame, openGameFile } from '../../map-dump/src/lib.js';
import { dec, renderDump } from './dump.js';

const vfs = await openGame();
try {
  writeSync(1, renderDump(dec(await openGameFile(vfs, 'data/vault13.gam'))));
} finally {
  await vfs.close();
}
