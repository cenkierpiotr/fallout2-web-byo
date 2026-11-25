import { render } from 'preact';
import '@f2/ui/src/styles/tokens.css';
import './styles/tokens.css';
import './styles/layout.css';
import { App } from './app';

const root = document.getElementById('root');
if (root) render(<App />, root);

if (import.meta.env.PROD) {
  void import('./pwa').then(({ registerPwa }) =>
    registerPwa({
      onUpdate: (apply) => {
        // Aktualizacja kryty: blokujacy window.confirm zdazyl juz powodowac,
        // ze uzytkownik tygodniami siedzial na starym bundlu po "naprawionym" deployu.
        // Teraz: jeden toast (zapisk Sobie sam, gra nie jest w trayu), a SW sam sie przelacza
        // przy najblizszym peknietym nawigacji/odswiezeniu karty, bez cyklu "user musial potwierdzic".
        console.info('[pwa] nowa wersja powloki - przelaczam (auto update)');
        apply();
      },
    }),
  );
}
