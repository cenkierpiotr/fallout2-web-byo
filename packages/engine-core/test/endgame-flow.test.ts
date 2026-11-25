import { describe, expect, it } from 'vitest';
import type { DeathSlide, EndgameSlide } from '@f2/formats';
import {
  EndgameFlow,
  GvarRegistry,
  cleanNarration,
  type EndgameDeps,
  type EndgameViewState,
} from '../src/index.js';

const reg = (vals: number[]) =>
  new GvarRegistry(
    vals.map((_, i) => `G${i}`),
    vals,
  );
const sl = (gvar: number, value: number, art: number, direction: -1 | 0 | 1 = 0): EndgameSlide => ({
  gvar,
  value,
  art,
  narrator: `nar_${art}`,
  direction,
  line: 0,
});
const death = (narrator: string, chance = 10): DeathSlide => ({
  gvar: -1,
  value: 0,
  areaKnown: -1,
  areaNotKnown: -1,
  minLevel: 0,
  chance,
  narrator,
  line: 0,
});

interface Harness {
  deps: EndgameDeps;
  log: string[];
  states: EndgameViewState[];
  speechResult: { current: 'finished' | 'skipped' | 'missing' };
  resolveSpeech: () => void;
}

function harness(over: Partial<EndgameDeps> = {}): Harness {
  const log: string[] = [];
  const states: EndgameViewState[] = [];
  const speechResult = { current: 'finished' as 'finished' | 'skipped' | 'missing' };
  const h: Harness = {
    log,
    states,
    speechResult,
    resolveSpeech: () => {},
    deps: {
      endgameTable: [sl(409, 4, 440), sl(408, 1, 446), sl(408, 1, 327, -1)],
      deathTable: [death('Generic1')],
      gvars: reg([]),
      isAreaKnown: () => false,
      level: 1,
      rng: { int: () => 0 },
      lang: 'english',
      speech: {
        play(path) {
          log.push(`speech:${path}`);
          return Promise.resolve(speechResult.current);
        },
        stop() {
          log.push('speech.stop');
        },
      },
      loadText(path) {
        log.push(`text:${path}`);
        if (path.endsWith('credits.txt')) return Promise.resolve('@Tytul\r\nImie\r\n');
        return Promise.resolve(`1:Tekst ${path}\r\n2:drugi wiersz#\r\n`);
      },
      movie: {
        play(name) {
          log.push(`movie:${name}`);
          return Promise.resolve('finished');
        },
      },
      lastSave: () => Promise.resolve(null),
      delay: () => Promise.resolve(),
      ...over,
    },
  };
  return h;
}

function gvars(map: Record<number, number>): GvarRegistry {
  const r = reg(new Array<number>(700).fill(0));
  for (const [k, v] of Object.entries(map)) r.set(Number(k), v);
  return r;
}

describe('cleanNarration', () => {
  it('usuwa prefiksy numerow wierszy, znak # i skleja wiersze spacja', () => {
    expect(cleanNarration('1:Pierwszy\r\n2:Drugi#\r\n')).toBe('Pierwszy Drugi');
    expect(cleanNarration('Bez prefiksu\nlinia')).toBe('Bez prefiksu linia');
  });
});

describe('EndgameFlow.run', () => {
  it('test_endgame_flow_plays_each_selected_slide_then_credits', async () => {
    const h = harness({ gvars: gvars({ 409: 4, 408: 1 }) });
    const flow = new EndgameFlow(h.deps);
    flow.view.subscribe((s) => h.states.push(s));
    const done = flow.run();
    // czekamy na ekran napisow i konczymy je
    await flow.waitFor('credits');
    flow.finishCredits();
    await done;
    const speech = h.log.filter((l) => l.startsWith('speech:'));
    expect(speech).toEqual([
      'speech:sound/speech/narrator/nar_440.acm',
      'speech:sound/speech/narrator/nar_446.acm',
      'speech:sound/speech/narrator/nar_327.acm',
    ]);
    const movieIdx = h.log.indexOf('movie:credits');
    expect(movieIdx).toBeGreaterThan(h.log.lastIndexOf('speech:sound/speech/narrator/nar_327.acm'));
    expect(flow.view.value.screen).toBe('main-menu');
    expect(flow.view.value.history.map((s) => s.art)).toEqual([440, 446, 327]);
    expect(flow.view.value.slide).toBeNull();
  });

  it('test_endgame_flow_pan_slide_uses_direction', async () => {
    const h = harness({ gvars: gvars({ 408: 1 }) });
    const flow = new EndgameFlow(h.deps);
    flow.view.subscribe((s) => h.states.push(s));
    const done = flow.run();
    await flow.waitFor('credits');
    flow.finishCredits();
    await done;
    const pans = h.states.filter((s) => s.slide).map((s) => [s.slide!.art, s.slide!.pan]);
    expect(pans).toContainEqual([446, 0]);
    expect(pans).toContainEqual([327, -1]);
  });

  it('tekst narracji slajdu pochodzi z text/<lang>/cuts/<narrator>.txt', async () => {
    const h = harness({ gvars: gvars({ 409: 4 }) });
    const flow = new EndgameFlow(h.deps);
    flow.view.subscribe((s) => h.states.push(s));
    const done = flow.run();
    await flow.waitFor('credits');
    flow.finishCredits();
    await done;
    const withText = h.states.find((s) => s.slide?.art === 440);
    expect(withText?.slide?.text).toContain('text/english/cuts/nar_440.txt');
    expect(withText?.slide?.text).toContain('drugi wiersz');
    expect(withText?.slide?.text).not.toContain('#');
  });

  it('advance() przerywa narracje biezacego slajdu i przechodzi dalej', async () => {
    let release: (v: 'finished') => void = () => {};
    const h = harness({
      gvars: gvars({ 409: 4, 408: 1 }),
    });
    let first = true;
    h.deps.speech = {
      play: () => {
        if (first) {
          first = false;
          return new Promise((r) => {
            release = r;
          });
        }
        return Promise.resolve('finished');
      },
      stop: () => h.log.push('speech.stop'),
    };
    const flow = new EndgameFlow(h.deps);
    const done = flow.run();
    await flow.waitFor('endgame');
    await new Promise((r) => setTimeout(r, 0)); // slajd ustawiony, narracja trwa
    flow.advance();
    await flow.waitFor('credits');
    expect(h.log).toContain('speech.stop');
    expect(flow.view.value.history.map((s) => s.art)).toEqual([440, 446, 327]);
    flow.finishCredits();
    await done;
    release('finished');
  });

  it('brak pliku mowy i tekstu nie blokuje przebiegu (missing)', async () => {
    const h = harness({ gvars: gvars({ 409: 4 }), loadText: () => Promise.resolve(null) });
    h.speechResult.current = 'missing';
    const flow = new EndgameFlow(h.deps);
    const done = flow.run();
    await flow.waitFor('credits');
    flow.finishCredits();
    await done;
    expect(flow.view.value.history[0]?.text).toBe('');
    expect(flow.view.value.screen).toBe('main-menu');
  });

  it('napisy koncowe parsuja credits.txt przez parseCredits', async () => {
    const h = harness({ gvars: gvars({ 409: 4 }) });
    const flow = new EndgameFlow(h.deps);
    const done = flow.run();
    await flow.waitFor('credits');
    expect(flow.view.value.credits).toEqual([
      { kind: 'title', text: 'Tytul' },
      { kind: 'name', text: 'Imie' },
    ]);
    flow.finishCredits();
    await done;
  });

  it('brak slajdow pasujacych do globali: od razu napisy', async () => {
    const h = harness({ gvars: gvars({}) });
    const flow = new EndgameFlow(h.deps);
    const done = flow.run();
    await flow.waitFor('credits');
    expect(flow.view.value.history).toEqual([]);
    flow.finishCredits();
    await done;
  });
});

describe('EndgameFlow.runDeath', () => {
  it('test_death_flow_offers_load_last_save', async () => {
    const h = harness({ lastSave: () => Promise.resolve('slot3') });
    const flow = new EndgameFlow(h.deps);
    flow.view.subscribe((s) => h.states.push(s));
    await flow.runDeath(0);
    expect(h.states.some((s) => s.screen === 'death' && s.slide?.art === 309)).toBe(true);
    expect(flow.view.value.screen).toBe('main-menu');
    expect(flow.view.value.lastSave).toBe('slot3');
    expect(h.log).toContain('speech:sound/speech/narrator/generic1.acm');
  });

  it('smierc bez zapisu: lastSave null', async () => {
    const h = harness();
    const flow = new EndgameFlow(h.deps);
    await flow.runDeath(0);
    expect(flow.view.value.lastSave).toBeNull();
  });

  it('brak mowy (missing): czeka timeout 3000 ms przez deps.delay', async () => {
    const delays: number[] = [];
    const h = harness({
      delay: (ms) => {
        delays.push(ms);
        return Promise.resolve();
      },
    });
    h.speechResult.current = 'missing';
    const flow = new EndgameFlow(h.deps);
    await flow.runDeath(0);
    expect(delays).toContain(3000);
    expect(flow.view.value.screen).toBe('main-menu');
  });

  it('pusta tabela smierci nie rzuca: od razu menu', async () => {
    const h = harness({ deathTable: [] });
    const flow = new EndgameFlow(h.deps);
    await flow.runDeath(0);
    expect(flow.view.value.screen).toBe('main-menu');
  });
});
