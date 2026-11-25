/** Rejestracja service workera (tylko produkcja) i powiadomienie o nowej wersji. */

export interface PwaHooks {
  /** Wolane gdy czeka nowa wersja; wywolaj `apply()` po zgodzie uzytkownika. */
  onUpdate(apply: () => void): void;
}

export function registerPwa(hooks: PwaHooks, base = import.meta.env.BASE_URL): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const sw = navigator.serviceWorker;
  let applying = false;
  void sw
    .register(`${base}sw.js`, { scope: base })
    .then((reg) => {
      const notify = (w: ServiceWorker): number | void =>
        hooks.onUpdate(() => {
          applying = true;
          w.postMessage({ type: 'SKIP_WAITING' });
        });
      if (reg.waiting && sw.controller) notify(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => {
          if (w.state === 'installed' && sw.controller) notify(w);
        });
      });
      // Telefon: powrot do dawno uśpionej karty nie robi zadnego przeladowania,
      // wiec bez tego user siedzialby na starym bundlu az do recznego odswiezenia.
      let lastCheck = 0;
      const onVisible = (): void => {
        if (document.visibilityState !== 'visible') return;
        const now = Date.now();
        if (now - lastCheck < 60_000) return;
        lastCheck = now;
        void reg.update().catch(() => undefined);
      };
      document.addEventListener('visibilitychange', onVisible);
      onVisible();
    })
    .catch(() => undefined);
  let reloaded = false;
  sw.addEventListener('controllerchange', () => {
    // Pierwsza instalacja (clients.claim) nie moze przeladowac gry; tylko swiadoma aktualizacja.
    if (reloaded || !applying) return;
    reloaded = true;
    location.reload();
  });
}
