import { describe, expect, it } from 'vitest';
import { buildPrecache, injectPrecache } from './pwa-precache-plugin';

describe('precache', () => {
  it('wersja zalezy od zawartosci i jest stabilna niezaleznie od kolejnosci', () => {
    const a = { url: 'a.js', data: 'x' };
    const b = { url: 'b.css', data: 'y' };
    expect(buildPrecache([a, b]).version).toBe(buildPrecache([b, a]).version);
    expect(buildPrecache([a, b]).version).not.toBe(buildPrecache([a, { ...b, data: 'z' }]).version);
    expect(buildPrecache([a, b]).urls).toEqual(['./', 'a.js', 'b.css']);
  });
  it('wstawia liste do sw.js i wymaga znacznika', () => {
    const out = injectPrecache('const PRECACHE = null; /*__PRECACHE__*/', {
      version: 'v',
      urls: ['./'],
    });
    expect(out).toBe('const PRECACHE = {"version":"v","urls":["./"]};');
    expect(() => injectPrecache('nic', { version: 'v', urls: [] })).toThrow();
  });
});
