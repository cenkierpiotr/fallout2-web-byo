// @vitest-environment node
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { injectPrecache } from './pwa-precache-plugin';

type Listener = (e: unknown) => void;
const pub = (n: string): string => resolve(__dirname, '../public', n);

function boot(precache: { version: string; urls: string[] } | null) {
  let src = readFileSync(pub('sw.js'), 'utf8');
  if (precache) src = injectPrecache(src, precache);
  const listeners: Record<string, Listener> = {};
  const store = new Map<string, Map<string, string>>();
  const caches = {
    open: async (name: string) => {
      const m = store.get(name) ?? new Map<string, string>();
      store.set(name, m);
      return {
        addAll: async (urls: string[]) => urls.forEach((u) => m.set(u, 'shell:' + u)),
        put: async (k: unknown, v: { body: string }) => void m.set(String(k), v.body),
      };
    },
    keys: async () => [...store.keys()],
    delete: async (k: string) => store.delete(k),
    match: async (req: { url?: string } | string) => {
      const k = typeof req === 'string' ? req : (req.url ?? '');
      const rel = k.replace('https://x.test/app/', '') || './';
      for (const m of store.values()) {
        const hit = m.get(rel) ?? m.get(k);
        if (hit) return { body: hit };
      }
      return undefined;
    },
  };
  const self = {
    location: { origin: 'https://x.test' },
    registration: { scope: 'https://x.test/app/' },
    clients: { claim: async () => undefined },
    skipWaiting: () => undefined,
    addEventListener: (t: string, l: Listener) => void (listeners[t] = l),
  };
  vm.runInNewContext(src, { self, caches, URL, Response, fetch: async () => ({ ok: true }) });
  return { listeners, store };
}

interface FakeEvent {
  request: { method: string; url: string; mode: string; headers: Headers; cache?: string };
  respondWith(p: unknown): void;
  responded: boolean;
}
function fetchEvent(url: string, init: Partial<FakeEvent['request']> = {}): FakeEvent {
  const ev: FakeEvent = {
    request: { method: 'GET', url, mode: 'cors', headers: new Headers(), ...init },
    responded: false,
    respondWith() {
      ev.responded = true;
    },
  };
  return ev;
}

const PRE = { version: 'abc', urls: ['./', 'index.html', 'assets/app-1.js'] };

describe('sw.js', () => {
  it('install zapisuje cala powloke, activate czysci stare wersje', async () => {
    const { listeners, store } = boot(PRE);
    let p: Promise<unknown> = Promise.resolve();
    listeners.install?.({ waitUntil: (x: Promise<unknown>) => (p = x) });
    await p;
    expect([...(store.get('f2-shell-abc')?.keys() ?? [])]).toEqual(PRE.urls);
    store.set('f2-shell-stara', new Map());
    listeners.activate?.({ waitUntil: (x: Promise<unknown>) => (p = x) });
    await p;
    expect([...store.keys()]).toEqual(['f2-shell-abc']);
  });

  it('zasoby powloki obsluguje, reszte (dane gry, Range, POST, cudze) przepuszcza', () => {
    const { listeners } = boot(PRE);
    const h = (url: string, init?: Partial<FakeEvent['request']>): boolean => {
      const ev = fetchEvent(url, init);
      listeners.fetch?.(ev);
      return ev.responded;
    };
    expect(h('https://x.test/app/assets/app-1.js')).toBe(true);
    expect(h('https://x.test/app/assets/nieznany.js')).toBe(false);
    expect(h('https://x.test/app/data/art/x.frm')).toBe(false);
    expect(h('https://x.test/app/master.dat')).toBe(false);
    expect(h('https://x.test/app/assets/app-1.js', { method: 'POST' })).toBe(false);
    expect(
      h('https://x.test/app/assets/app-1.js', { headers: new Headers({ range: 'bytes=0-1' }) }),
    ).toBe(false);
    expect(h('https://inny.test/app/assets/app-1.js')).toBe(false);
    expect(h('https://x.test/app/version.json')).toBe(false);
    expect(h('https://x.test/app/', { mode: 'navigate' })).toBe(true);
  });

  it('dev (bez precache) nic nie przechwytuje', () => {
    const { listeners } = boot(null);
    const ev = fetchEvent('https://x.test/app/', { mode: 'navigate' });
    listeners.fetch?.(ev);
    expect(ev.responded).toBe(false);
  });
});

describe('manifest PWA', () => {
  const m = JSON.parse(readFileSync(pub('manifest.webmanifest'), 'utf8')) as {
    name: string;
    start_url: string;
    scope: string;
    display: string;
    icons: Array<{ src: string; sizes: string; purpose?: string }>;
  };
  it('spelnia wymagania instalowalnosci', () => {
    expect(m.name).toBeTruthy();
    expect(m.display).toBe('standalone');
    expect(m.start_url).toBe('./');
    expect(m.scope).toBe('./');
    expect(m.icons.some((i) => i.sizes === '192x192')).toBe(true);
    expect(m.icons.some((i) => i.sizes === '512x512')).toBe(true);
    expect(m.icons.some((i) => i.purpose === 'maskable')).toBe(true);
  });
  it('wszystkie ikony istnieja', () => {
    for (const i of m.icons) expect(existsSync(pub(i.src))).toBe(true);
  });
  it('index.html linkuje manifest i ikone dla iOS', () => {
    const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
    expect(html).toContain('rel="manifest"');
    expect(html).toContain('rel="apple-touch-icon"');
    expect(html).toContain('viewport-fit=cover');
  });
});
