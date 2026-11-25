import { describe, expect, it } from 'vitest';
import { parseEnddeathTable, parseEndgameTable } from '@f2/formats';
import { openGameFolderNode } from '../../../vfs/src/node.js';
import { EndgameFlow, GvarRegistry } from '../../src/index.js';

const dir = process.env.F2_GAME_DIR;
const patchDir = process.env.F2_PATCH_DIR;

// Smoke M10: prawdziwe tabele endgame.txt/enddeath.txt, kilka kombinacji globali.
describe.skipIf(!dir)('EndgameFlow golden (prawdziwe tabele gry)', () => {
  it('rozne kombinacje globali daja niepuste, rozne zestawy slajdow i przebieg konczy sie menu', async () => {
    const vfs = await openGameFolderNode(dir!, patchDir);
    const dec = new TextDecoder('latin1');
    const read = async (p: string) => dec.decode(await vfs.open(p));
    const endgameTable = parseEndgameTable(await read('data/endgame.txt')).items;
    const deathTable = parseEnddeathTable(await read('data/enddeath.txt')).items;
    expect(endgameTable.length).toBeGreaterThan(20);
    expect(deathTable.length).toBeGreaterThan(5);

    const combos: Record<number, number>[] = [
      {},
      { 409: 4 },
      { 408: 1 },
      { 409: 4, 408: 1 },
      { 491: 1 },
      { 409: 3, 408: 1, 491: 1 },
    ];
    const histories: string[] = [];
    for (const map of combos) {
      const g = new GvarRegistry(new Array<string>(700).fill('G'), new Array<number>(700).fill(0));
      for (const [k, v] of Object.entries(map)) g.set(Number(k), v);
      const flow = new EndgameFlow({
        endgameTable,
        deathTable,
        gvars: g,
        isAreaKnown: () => false,
        level: 10,
        rng: { int: () => 0 },
        lang: 'english',
        speech: { play: () => Promise.resolve('finished'), stop() {} },
        loadText: () => Promise.resolve(null),
        movie: { play: () => Promise.resolve('finished') },
        lastSave: () => Promise.resolve(null),
        delay: () => Promise.resolve(),
      });
      const done = flow.run();
      await flow.waitFor('credits');
      flow.finishCredits();
      await done;
      expect(flow.view.value.screen).toBe('main-menu');
      histories.push(flow.view.value.history.map((s) => s.art).join(','));
    }
    expect(new Set(histories).size).toBeGreaterThan(1);
  });
});
