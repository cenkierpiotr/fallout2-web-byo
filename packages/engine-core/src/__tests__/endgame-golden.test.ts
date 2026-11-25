import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openGameFolderNode } from '@f2/vfs/node';
import type { NodeVfs } from '@f2/vfs/node';
import {
  parseEndgameTable,
  parseEnddeathTable,
  type EndgameSlide,
  type DeathSlide,
} from '@f2/formats';
import { GvarRegistry, parseGamText, selectEndgameSlides, selectDeath } from '../index.js';

const dir = process.env.F2_GAME_DIR;
const patchDir = process.env.F2_PATCH_DIR;

describe.skipIf(!dir || !patchDir)(
  'zakonczenie: prawdziwe tabele endgame.txt/enddeath.txt + vault13.gam',
  () => {
    let vfs: NodeVfs;
    let slides: EndgameSlide[];
    let death: DeathSlide[];
    let gam: ReturnType<typeof parseGamText>;
    const text = async (p: string) => Buffer.from(await vfs.open(p)).toString('latin1');
    beforeAll(async () => {
      vfs = await openGameFolderNode(dir!, patchDir);
      slides = parseEndgameTable(await text('data/endgame.txt')).items;
      death = parseEnddeathTable(await text('data/enddeath.txt')).items;
      gam = parseGamText(await text('data/vault13.gam'));
    });
    afterAll(async () => {
      await vfs.close();
    });
    const reg = () => GvarRegistry.fromGam(gam);

    it('tabele: 59 slajdow, 18 wierszy smierci, 708 globali', () => {
      expect(slides.length).toBe(59);
      expect(death.length).toBe(18);
      expect(gam.names.length).toBe(708);
    });

    it('wartosci poczatkowe: wybrane slajdy to dokladnie te z gvar == value, w kolejnosci pliku', () => {
      const g = reg();
      const sel = selectEndgameSlides(slides, g);
      const expected = slides.filter((s) => g.get(s.gvar) === s.value);
      expect(sel).toEqual(expected);
      // kolejnosc pliku zachowana
      const lines = sel.map((s) => s.line);
      expect([...lines].sort((a, b) => a - b)).toEqual(lines);
    });

    it('pierwszy slajd tabeli (gvar 408 = 1) pojawia sie dopiero po ustawieniu globala', () => {
      const first = slides[0]!;
      expect(first).toMatchObject({ gvar: 408, value: 1, art: 440, narrator: 'nar_ar1' });
      const g = reg();
      expect(selectEndgameSlides(slides, g).some((s) => s.line === first.line)).toBe(false);
      g.set(408, 1);
      expect(selectEndgameSlides(slides, g)[0]?.line).toBe(first.line);
    });

    it('kazdy slajd daje sie wybrac przez ustawienie jego globala (gvar w zakresie GAM)', () => {
      for (const s of slides) {
        const g = reg();
        g.set(s.gvar, s.value);
        expect(
          selectEndgameSlides(slides, g).some((x) => x.line === s.line),
          `linia ${s.line}`,
        ).toBe(true);
      }
    });

    it('smierc: Modoc (gvar 491 != 0) wymusza wiersz Modoc, bez losowania', () => {
      const g = reg();
      g.set(491, 1);
      const row = selectDeath(death, {
        gvars: g,
        areaKnown: () => false,
        level: 1,
        reason: 0,
        rng: { int: () => 0 },
      });
      expect(row?.narrator).toBe('nar_mo1');
    });
    it('zasoby: kazdy slajd i wiersz smierci ma tekst narracji i plik mowy w danych gry', async () => {
      const missing: string[] = [];
      const exists = async (path: string): Promise<boolean> => {
        try {
          await vfs.open(path);
          return true;
        } catch {
          return false;
        }
      };
      const narrators = new Set([
        ...slides.map((s) => s.narrator),
        ...death.map((d) => d.narrator),
      ]);
      for (const n of narrators) {
        const l = n.toLowerCase();
        if (!(await exists(`text/english/cuts/${l}.txt`))) missing.push(`txt:${l}`);
        if (!(await exists(`sound/speech/narrator/${l}.acm`))) missing.push(`acm:${l}`);
      }
      expect(narrators.size).toBeGreaterThan(40);
      // nar_mo5: brak pliku mowy w danych gry (FO2 1.02 + patch); flow zwraca 'missing' i leci na timeout napisow
      expect(missing).toEqual(['acm:nar_mo5']);
    });
  },
);
