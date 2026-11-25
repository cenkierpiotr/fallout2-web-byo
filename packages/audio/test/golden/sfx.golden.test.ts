import { describe, expect, it } from 'vitest';
import { openGameFolderNode, type NodeVfs } from '../../../vfs/src/node.js';
import { parseAcmHeader } from '../../src/acm/header.js';
import {
  containerSfxName,
  parseAmbientSfx,
  parseSndList,
  sceneryDoorName,
  sfxPath,
  weaponSfxName,
} from '../../src/sfx/names.js';

const dir = process.env.F2_GAME_DIR;

describe.skipIf(!dir)('SFX golden (sound/sfx)', () => {
  const open = async (): Promise<{ vfs: NodeVfs; files: Set<string> }> => {
    const vfs = await openGameFolderNode(dir!);
    return { vfs, files: new Set(vfs.list()) };
  };

  it('sndlist.lst: 1361 wpisow, kazdy ma plik ACM, id rosnie co 2', async () => {
    const { vfs, files } = await open();
    try {
      const list = parseSndList(
        new TextDecoder('latin1').decode(await vfs.open('sound/sfx/sndlist.lst')),
      );
      expect(list.length).toBe(1361);
      list.forEach((e, i) => expect(e.id).toBe(2 * (i + 1)));
      for (const e of list) expect(files.has(sfxPath(e.name))).toBe(true);
    } finally {
      await vfs.close();
    }
  });

  it('naglowek ACM pliku z sndlist jest poprawny (probka)', async () => {
    const { vfs } = await open();
    try {
      const list = parseSndList(
        new TextDecoder('latin1').decode(await vfs.open('sound/sfx/sndlist.lst')),
      );
      for (const e of list.filter((_, i) => i % 50 === 0)) {
        const h = parseAcmHeader(await vfs.open(sfxPath(e.name)));
        expect(h.channels).toBeGreaterThan(0);
      }
    } finally {
      await vfs.close();
    }
  });

  it('generator broni trafia w istniejace pliki', async () => {
    const { vfs, files } = await open();
    try {
      let hit = 0;
      let total = 0;
      for (const action of [0, 1, 2, 3, 4])
        for (const wc of '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''))
          for (const hitMode of [0, 1])
            for (const material of [undefined, 0, 3, 4, 7]) {
              const n = weaponSfxName({ action, weaponChar: wc, hitMode, material });
              if (!n) continue;
              total++;
              if (files.has(sfxPath(n))) hit++;
            }
      expect(hit).toBeGreaterThan(50);
      console.log(`weapon sfx: ${hit}/${total} nazw istnieje`);
      for (const n of ['WA11XXX1', 'WAA1XXX1']) expect(files.has(sfxPath(n))).toBe(true);
    } finally {
      await vfs.close();
    }
  });

  it('drzwi i pojemniki istnieja w danych', async () => {
    const { vfs, files } = await open();
    try {
      for (const act of [0, 1, 2, 3])
        expect(files.has(sfxPath(sceneryDoorName(act, 'A')!))).toBe(true);
      for (const act of [0, 1, 2, 3])
        expect(files.has(sfxPath(containerSfxName(act, 'A')!))).toBe(true);
      expect(files.has(sfxPath(containerSfxName(0, 'E')!))).toBe(true);
    } finally {
      await vfs.close();
    }
  });

  it('maps.txt ambient_sfx: wszystkie nazwy istnieja poza literowka clangl', async () => {
    const { vfs, files } = await open();
    try {
      const txt = new TextDecoder('latin1').decode(await vfs.open('data/maps.txt'));
      const names = new Set<string>();
      for (const raw of txt.split(/\r?\n/)) {
        const m = /^\s*ambient_sfx\s*=(.*)$/i.exec(raw.split(';')[0] ?? '');
        if (m?.[1]) for (const a of parseAmbientSfx(m[1])) names.add(a.name.toLowerCase());
      }
      expect(names.size).toBeGreaterThan(30);
      const missing = [...names].filter((n) => !files.has(sfxPath(n)));
      expect(missing).toEqual(['clangl']);
    } finally {
      await vfs.close();
    }
  });
});
