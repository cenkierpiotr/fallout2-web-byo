import { lstName } from '../game/worldmap/worldmap-art';

/**
 * Manifest grafik interfejsu: klucz logiczny -> nazwa bazowa FRM (bez rozszerzenia, wielkosc liter
 * dowolna) z art/intrface/intrface.lst. Sciezke rozwiazuje `resolveArtPath` po nazwie w lst.
 *
 * Zasady dla zadan ekranowych: kazdy ekran dopisuje klucze WYLACZNIE we wlasnym bloku nizej
 * (jedna linia na klucz), zeby rownolegle zmiany sie nie konfliktowaly. Nazwy poza blokiem iface
 * sa prowizoryczne do czasu weryfikacji na danych gry danego ekranu.
 * Nazwy bloku iface zweryfikowane na intrface.lst (RPU HD i patch 1.02.25).
 */
export const ART: Record<string, string> = {
  // --- iface: dolny pasek interfejsu ---
  'iface.bar': 'iface',
  'iface.opts.up': 'optiup',
  'iface.opts.dn': 'optidn',
  'iface.inv.up': 'invbutup',
  'iface.inv.dn': 'invbutdn',
  'iface.cha.up': 'chaup',
  'iface.cha.dn': 'chadn',
  'iface.pip.up': 'pipup',
  'iface.pip.dn': 'pipdn',
  'iface.map.up': 'mapup',
  'iface.map.dn': 'mapdn',
  'iface.redbig.up': 'bigredup',
  'iface.redbig.dn': 'bigreddn',
  'iface.redlil.up': 'lilredup',
  'iface.redlil.dn': 'lilreddn',
  'iface.digits': 'numbers', // arkusz cyfr licznikow HP/KP (id 83 w lst, 360x17 = 40 komorek po 9px;
  // cyfry 0-9 w komorkach 0-9, minus w komorce 12; zweryfikowane na numbers.frm)
  // --- inv: ekran ekwipunku (zadanie ekranowe) ---
  'inv.bg': 'invbox', // tlo ekranu ekwipunku/lootu (id 49 w lst, 499x377; zweryfikowane na invbox.png)
  'inv.done.up': 'lilredup', // przycisk Done lootu (maly czerwony, id 9 w lst)
  'inv.done.dn': 'lilreddn',
  // --- char: karta postaci (zadanie ekranowe) ---
  'char.bg': 'edtredt', // tlo edytora postaci (id 178 w lst; potwierdzone wizualnie na edtredt-cmp.png)
  // --- creator: kreator postaci (zadanie ekranowe) ---
  // Tlo trybu tworzenia (glblmode=1) i wybor gotowej postaci; nazwy z editor.cc/select.cc
  // zweryfikowane na intrface.lst (RPU HD i patch 1.02.25).
  'creator.bg': 'edtrcrte', // tlo edytora przy tworzeniu postaci (id 169 w lst, 640x480)
  'creator.digits': 'bignum', // cyfry edytora (id 171, 336x24 = 12 pasow po 14x24)
  'creator.portrait.combat': 'combat', // portret gotowej postaci: Narg (id 202)
  'creator.portrait.stealth': 'stealth', // portret gotowej postaci: Mingan (id 203)
  'creator.portrait.diplomat': 'diplomat', // portret gotowej postaci: Chitsa (id 204)
  'creator.stat.plus.up': 'splsoff', // + przy atrybucie SPECIAL (spoczynek, 16x12)
  'creator.stat.plus.dn': 'splson', // + przy atrybucie SPECIAL (wcisniety)
  'creator.stat.minus.up': 'snegoff', // - przy atrybucie SPECIAL (spoczynek)
  'creator.stat.minus.dn': 'snegon', // - przy atrybucie SPECIAL (wcisniety)
  'creator.skill.tag.on': 'tgsklon', // tag umiejetnosci wybrany (17x11)
  'creator.skill.tag.off': 'tgskloff', // tag umiejetnosci niewybrany
  'creator.btn.done.up': 'opbtnoff', // DONE w spoczynku (455,454; 137x34)
  'creator.btn.done.dn': 'opbtnon', // DONE wcisniety
  // --- dlg: dialog (zadanie ekranowe); nazwy z intrface.lst (RPU HD) ---
  'dlg.subwin': 'di_talk', // "dialog screen subwindow (NPC's)" - podokno rozmowy nad mapa
  'dlg.subwin.party': 'di_talkp', // wariant podokna rozmowy dla czlonkow druzyny
  'dlg.done.up': 'di_done1', // duzy przycisk Done (wolny)
  'dlg.done.dn': 'di_done2', // duzy przycisk Done (wcisniety)
  'dlg.up.up': 'di_up1', // mala strzalka w gore listy odpowiedzi (wolna)
  'dlg.up.dn': 'di_up2', // mala strzalka w gore listy odpowiedzi (wcisnieta)
  'dlg.dn.up': 'di_down1', // mala strzalka w dol listy odpowiedzi (wolna)
  'dlg.dn.dn': 'di_down2', // mala strzalka w dol listy odpowiedzi (wcisnieta)
  'dlg.hi.top': 'hilight1', // pasek podswietlenia gornej czesci listy odpowiedzi
  'dlg.hi.bot': 'hilight2', // pasek podswietlenia dolnej czesci listy odpowiedzi
  'dlg.red.up': 'di_rdbt1', // maly czerwony przycisk (wolny)
  'dlg.red.dn': 'di_rdbt2', // maly czerwony przycisk (wcisniety)
  // --- pip: Pip-Boy (zadanie ekranowe) ---
  'pip.bg': 'pip', // okno Pip-Boya (id 128 w lst, 640x480)
  // --- save: zapis/odczyt (zadanie ekranowe) ---
  'save.bg': 'lsgame',
  // --- barter: handel (zadanie ekranowe) ---
  'barter.bg': 'barter', // okno handlu (id 112 w lst, realnie 640x191, nie 640x480)
  'barter.bg.party': 'trade', // wariant dla handlu z czlonkiem druzyny (id 421 w lst, 640x190)
  // --- opts: opcje (zadanie ekranowe) ---
  'opts.bg': 'opbase', // panel opcji (prefscrn ma wypalone angielskie etykiety, prefback brak w lst)
  // up = spoczynek (opbtnoff: jasna wypukla tarcza), dn = wcisniety (opbtnon: ciemna zapadlina);
  // zweryfikowane pikselowo na opbtn-cmp.png, zgodne z blokiem creator (.btn.done.up='opbtnoff')
  'opts.tab.up': 'opbtnoff', // przycisk zakladki (137x34)
  'opts.tab.dn': 'opbtnon',
  // --- menu: menu glowne (zadanie ekranowe) ---
  'menu.bg': 'mainmenu',
  'menu.btn.up': 'menuup',
  'menu.btn.dn': 'menudown',
  'menu.death': 'death',
  // --- rest: pozostale (zadanie ekranowe) ---
  'rest.bg': 'pip', // odpoczynek odbywa sie w oknie Pip-Boya (alarm), to samo tlo
};

const ART_DIR = 'art/intrface/';

/** Sciezka FRM dla klucza (pierwszy wpis lst o tej nazwie); undefined gdy klucz/plik nieznany. */
export function resolveArtPath(lst: string[], key: string): string | undefined {
  const base = ART[key]?.toLowerCase();
  if (!base) return undefined;
  for (let i = 0; i < lst.length; i++) {
    const name = lstName(lst, i);
    if (name && name.replace(/\.frm$/, '') === base) return `${ART_DIR}${name}`;
  }
  return undefined;
}
