import { signal, type ReadonlySignal } from '@preact/signals';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { EndgameFlow, GvarRegistry, type SaveMeta } from '@f2/engine-core';
import {
  CharacterScreen,
  CreatorScreen,
  InventoryScreen,
  EndgameHost,
  MainMenuScreen,
  Modal,
  PipboyHost,
  SavesScreen,
  type SavesView,
  type EndgameView,
  type PlayerView,
  type PipboyView,
} from '@f2/ui';
import { createCreatorBinding, type CreatedCharacter } from '@f2/app/src/creator-binding';
import { client } from '../state/game-folder';
import { activeProfileId, activeSaveStore } from '../state/profiles';
import { locale } from '../i18n';
import { MapView } from './map/MapView';
import { OptionsHost } from './options/OptionsHost';
import { createRemoteVfs } from './map/remote-vfs';
import type { MapScreen } from './map/map-screen';
import { GameFlow } from '../game/flow';
import { sheetFromCritter } from '../game/character';
import { defaultSessionState, type SessionState } from '../game/save-world';
import { pollEndSignals, pollYearLimit } from '../game/end-signals';
import { setInGame } from '../state/shell-ui';
import { SessionExtras } from '../game/session-extras';
import { loadGameTables, type GameTables } from '../game/game-tables';
import { loadCharacterTexts, loadCreatorData } from '../game/shell-data';
import { gameMsgOptions, type GameMsgOptions } from '../game/msg-read';
import { ObjectTextSource, httpPackReader } from '../game/object-text';
import { createPartyNameResolver } from '../game/party-names';
import { createCharacterHost, type CharacterHost } from '../game/character-host';
import type { CharacterTexts } from '@f2/app/src/character-binding';
import { buildPipboyView } from '../game/pipboy-view';
import { TutorialHint } from './TutorialHint';
import { ExplosiveTimerDialog } from './ExplosiveTimerDialog';
import { ElevatorDialog } from './ElevatorDialog';
import { subtypeOf } from '../game/inventory-world';
import { fireHint, hintForKey, hintForMenu, hintForTap } from '../state/tutorial-hints';
import { createInventoryHost, type InventoryHost } from '../game/inventory-host';
import {
  CombatController,
  type CombatHost,
  type CombatStartOptions,
} from '../game/combat-controller';
import { loadCombatSave, saveCombat } from '../game/combat-save';
import { animCuesFor } from '../game/combat-anim';
import { BodyPart } from '@f2/rules';
import type { GameSession } from '../game/game-session';
import { playMovie, playGameMovie } from '../game/play-movie';
import { makeMidnightHost } from '../game/midnight-web-host';
import { createNarrationSpeech } from '../audio/endgame-speech';
import { ensureAudio } from '../audio/audio-state';
import { createMenuSavesCommands, latestSaveSlot } from '../game/menu-saves';
import { savesViewOf } from '../game/ui-bindings';
import { WorldmapScreen } from './worldmap/WorldmapScreen';
import { PartyOrdersScreen } from './PartyOrdersScreen';
import { partyOrdersView, setPartyOrder } from '../game/party-orders-view';
import { createTrunkBridge, type TrunkBridge } from '../game/trunk-bridge';
import { loadWorldmapArt, type WorldmapArt } from '../game/worldmap/worldmap-art';
import type { EncounterEvent } from '../game/worldmap/worldmap-model';
import type { CombatRequest } from '../game/worldmap/worldmap-group';
import type { WorldmapController } from '../game/worldmap/worldmap-controller';
import {
  createWorldmapForSession,
  saveWorldmap,
  captureWorldmapForSave,
  worldmapWasOpen,
  spawnEncounterGroups,
  takeCombatRequests,
} from '../game/worldmap/worldmap-session';
import { effectiveFixes, settings } from '../settings';

/** Mapa startowa nowej gry (Swiatynia Prob). */
export const START_MAP = 'ARTEMPLE';

const tr = (pl: string, en: string): string => (locale.value === 'pl' ? pl : en);
/** Opcje czytania tekstow gry: pakiet PL (po HTTP) przy jezyku PL. */
const msgOpts = (): GameMsgOptions => gameMsgOptions(locale.value === 'pl', httpPackReader());

function toPreact<T>(s: {
  value: T;
  subscribe(fn: (v: T) => void): () => void;
}): ReadonlySignal<T> {
  const p = signal(s.value);
  s.subscribe((v) => {
    p.value = v;
  });
  return p;
}

const menuView = (lastSave: string | null): EndgameView => ({
  screen: 'main-menu',
  slide: null,
  credits: [],
  lastSave,
});

/** Przeplyw gry: menu glowne -> kreator -> mapa (dialog, walka, zapis) -> smierc/zakonczenie -> napisy. */
const AIM_PARTS = [
  { id: 'head', part: BodyPart.Head, pl: 'Głowa', en: 'Head' },
  { id: 'torso', part: BodyPart.Torso, pl: 'Tors', en: 'Torso' },
  { id: 'legs', part: BodyPart.RightLeg, pl: 'Nogi', en: 'Legs' },
] as const;

/** Pelny ekran (Fullscreen API): latwe przełączanie okno/pelny ekran dla gracza; F11 dziala rownolegle. */
function isFullscreen(): boolean {
  return document.fullscreenElement !== null;
}

function toggleFullscreen(): void {
  if (isFullscreen()) void document.exitFullscreen().catch(() => undefined);
  else void document.documentElement.requestFullscreen().catch(() => undefined);
}

export function GameShell() {
  const flow = useMemo(() => new GameFlow(), []);
  const screen = flow.screen.value;
  const [creator, setCreator] = useState<Awaited<ReturnType<typeof loadCreatorData>> | null>(null);
  const [created, setCreated] = useState<CreatedCharacter | null>(null);
  const tables = useRef<GameTables | undefined>(undefined);
  const sessionRef = useRef<GameSession | null>(null);
  const startCombatRef = useRef<((requests?: CombatRequest[]) => void) | undefined>(undefined);
  const extrasRef = useRef<SessionExtras | undefined>(undefined);
  const mapRef = useRef<MapScreen | null>(null);
  const [combat, setCombat] = useState<CombatController | null>(null);
  const ccRef = useRef<CombatController | null>(null);
  const [, bump] = useState(0);
  useEffect(() => {
    const onFs = (): void => bump((n) => n + 1);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);
  const vfsRef = useRef<import('@f2/vfs').VirtualFs | null>(null);
  const invRef = useRef<InventoryHost | null>(null);
  const [invOpen, setInvOpen] = useState(false);
  const [invHost, setInvHost] = useState<InventoryHost | null>(null);
  const textsRef = useRef<CharacterTexts | undefined>(undefined);
  const hostRef = useRef<CharacterHost | null>(null);
  const hostUnsub = useRef<(() => void) | null>(null);
  const [charView, setCharView] = useState<ReadonlySignal<PlayerView> | null>(null);
  const [charOpen, setCharOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const partyTexts = useRef<{ vfs: unknown; src: ObjectTextSource } | null>(null);
  const partyNames = useRef<ReturnType<typeof createPartyNameResolver> | null>(null);
  /** Nazwy towarzyszy z pro_crit.msg (sesja/vfs moga sie zmienic, wiec resolver jest budowany leniwie). */
  const partyNameOf = (row: { objId: number }): string | undefined => {
    const vfs = vfsRef.current;
    if (!vfs) return undefined;
    if (!partyTexts.current || partyTexts.current.vfs !== vfs) {
      partyTexts.current = { vfs, src: new ObjectTextSource(vfs, { pack: httpPackReader() }) };
      partyNames.current = null;
    }
    const src = partyTexts.current.src;
    partyNames.current ??= createPartyNameResolver({
      objectOf: (id) => sessionRef.current?.world.map.objects.find((o) => o.id === id),
      describe: (lang, type, textId) => src.describe(lang, type, textId),
      lang: () => (locale.value === 'pl' ? 'pl' : 'en'),
      onUpdate: () => bump((x) => x + 1),
    });
    return partyNames.current(row);
  };
  const [wm, setWm] = useState<WorldmapController | null>(null);
  const wmRef = useRef<{ ctl: WorldmapController; session: GameSession } | null>(null);
  const [wmArt, setWmArt] = useState<WorldmapArt | null>(null);
  const wmArtRef = useRef<WorldmapArt | null>(null);
  const wmOpening = useRef(false);
  const wmShown = useRef(false);
  /** Most bagaznika samochodu <-> ekwipunek gracza (dla panelu auta na mapie swiata). */
  const makeTrunk = (ctl: WorldmapController): TrunkBridge | undefined => {
    const session = sessionRef.current;
    const inv = invRef.current;
    if (!session || !inv) return undefined;
    const b = createTrunkBridge({
      ctl,
      player: () => session.world.player,
      views: () => inv.inventory.value.items,
      spawn: (pid) => {
        const w = session.world;
        return w.scripts?.createObject(pid, w.player.hex, w.player.elevation, 0) ?? -1;
      },
      object: (id) => session.world.map.objects.find((o) => o.id === id),
      pickup: (o) => inv.pickup(o),
      discard: (id) => session.world.scripts?.destroyObject(id),
      refresh: () => inv.refresh(),
      loadSize: (pid) => mapRef.current?.itemSize(pid) ?? Promise.resolve(undefined),
    });
    void b.preload();
    return b;
  };
  const trunkCache = useRef<{ ctl: WorldmapController; sess: GameSession; b: TrunkBridge } | null>(
    null,
  );
  const trunkFor = (ctl: WorldmapController): TrunkBridge | undefined => {
    const sess = sessionRef.current;
    const c = trunkCache.current;
    if (c && c.ctl === ctl && c.sess === sess) return c.b;
    const b = makeTrunk(ctl);
    if (b && sess) trunkCache.current = { ctl, sess, b };
    return b;
  };
  /** Otwiera mape swiata; `fromMap` = mapa lokalna, z ktorej gracz wychodzi (ustawia pozycje na jej obszarze). */
  const openWorld = async (fromMap?: string): Promise<void> => {
    const ms = mapRef.current;
    const session = sessionRef.current;
    if (!ms || !session || wmOpening.current || wmShown.current || ccRef.current) return;
    wmOpening.current = true;
    try {
      let cached = wmRef.current;
      if (!cached || cached.session !== session) {
        const ctl = await createWorldmapForSession({
          session,
          extras: extrasRef.current,
          read: (p) => ms.readText(p),
          maps: ms.mapEntries,
          knownAreas: ms.knownAreas(),
          fixes: effectiveFixes(settings.value) as unknown as Record<string, boolean>,
        });
        cached = { ctl, session };
        wmRef.current = cached;
      } else cached.ctl.syncKnownAreas(ms.knownAreas());
      if (fromMap) cached.ctl.enterFromMap(fromMap);
      if (!wmArtRef.current) {
        // grafika FRM z lokalnych plikow gry; brak plikow = widok w kolorach
        wmArtRef.current = await loadWorldmapArt((p) => ms.loadArt(p), {
          readText: (p) => ms.readText(p),
          paletteColor: (i) => ms.paletteColor(i),
          areas: cached.ctl.model.data.areas,
        }).catch(() => null);
      }
      setWmArt(wmArtRef.current);
      ms.setPaused(true);
      wmShown.current = true;
      setWm(cached.ctl);
      (window as unknown as { __f2wm?: WorldmapController }).__f2wm = cached.ctl;
      if (import.meta.env.DEV) {
        // hooki dla e2e (prawdziwy VFS): grafika swiata i wejscie na mape spotkania
        const w = window as unknown as Record<string, unknown>;
        w['__f2wmArt'] = wmArtRef.current;
        w['__f2wmEnter'] = (name: string, ev?: EncounterEvent): void =>
          enterFromWorldRef.current(name, ev);
      }
    } catch (e) {
      console.error('mapa swiata', e);
    } finally {
      wmOpening.current = false;
    }
  };
  const closeWorld = (): void => {
    const cached = wmRef.current;
    if (cached) saveWorldmap(cached.session, cached.ctl);
    mapRef.current?.setPaused(false);
    wmShown.current = false;
    setWm(null);
  };
  const enterFromWorld = (name: string, encounter?: EncounterEvent): void => {
    const cached = wmRef.current;
    if (cached) saveWorldmap(cached.session, cached.ctl);
    wmShown.current = false;
    setWm(null);
    void mapRef.current?.enterMap(name).then(() => {
      if (!encounter || !cached) return;
      const fx = effectiveFixes(settings.value) as unknown as Record<string, boolean>;
      const elev = cached.session.world.player.elevation;
      const entry = mapRef.current?.mapEntries.find((e) => e.name === name.toUpperCase());
      const starts = (entry?.randomStarts ?? [])
        .filter((r) => r.elevation === elev)
        .map((r) => r.tileNum);
      spawnEncounterGroups(cached.session, extrasRef.current, cached.ctl, encounter, fx, starts);
      // exe 0x4a45d4: AMBUSH/FIGHTING od razu zaczyna walke z ustawionym celem
      const reqs = takeCombatRequests(cached.session);
      if (reqs.length > 0) startCombatRef.current?.(reqs);
    });
  };
  /**
   * Po wczytaniu zapisu: stary kontroler mapy swiata (stan sprzed wczytania) jest wyrzucany, a zapis zrobiony
   * na mapie swiata otwiera ja ponownie z odtworzonym stanem (pozycja, mgla, samochod).
   */
  const afterLoadWorld = (s: GameSession): void => {
    wmRef.current = null;
    trunkCache.current = null;
    if (wmShown.current) {
      wmShown.current = false;
      setWm(null);
    }
    if (worldmapWasOpen(s)) setTimeout(() => void openWorldRef.current(undefined), 0);
  };
  const afterLoadWorldRef = useRef(afterLoadWorld);
  afterLoadWorldRef.current = afterLoadWorld;
  const enterFromWorldRef = useRef(enterFromWorld);
  enterFromWorldRef.current = enterFromWorld;
  const openWorldRef = useRef(openWorld);
  openWorldRef.current = openWorld;
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const el = e.target as HTMLElement | null;
      if (e.code !== 'KeyW' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      void openWorldRef.current(mapRef.current?.mapName.value);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const charOpenRef = useRef(false);
  charOpenRef.current = charOpen;
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const el = e.target as HTMLElement | null;
      if (e.code !== 'KeyI' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      if (!invRef.current) return;
      invRef.current.refresh();
      setInvOpen((o) => !o);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (invOpen) fireHint('inventory');
  }, [invOpen]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      hintForKey(e.key);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const pipboy = useMemo(
    () =>
      signal<PipboyView>({
        status: {
          name: '',
          level: 1,
          hp: 0,
          hpMax: 0,
          ap: 0,
          apMax: 0,
          exp: 0,
          expNext: 0,
          day: 0,
        },
      }),
    [],
  );
  const [endView, setEndView] = useState<ReadonlySignal<EndgameView> | null>(null);
  const endFlowRef = useRef<EndgameFlow | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const c = client.value;

  // zapisy w menu glownym: ten sam magazyn IndexedDB co sesja gry
  const store = useMemo(() => activeSaveStore(), [activeProfileId.value]);
  const [menuMetas, setMenuMetas] = useState<SaveMeta[]>([]);
  const menuSaves = useMemo(() => signal<SavesView>(savesViewOf([])), []);
  const [savesOpen, setSavesOpen] = useState(false);
  /** Slot do wczytania zaraz po otwarciu mapy (wybrany w menu). */
  const pendingLoad = useRef<string | null>(null);
  const loadedName = useRef<string | null>(null);
  const refreshMenuSaves = async (): Promise<void> => {
    const metas = await store.list().catch(() => [] as SaveMeta[]);
    setMenuMetas(metas);
    menuSaves.value = savesViewOf(metas);
  };
  useEffect(() => {
    if (screen === 'menu') void refreshMenuSaves();
  }, [screen]);
  const startLoad = (slot: string, metas: readonly SaveMeta[] = menuMetas): void => {
    pendingLoad.current = slot;
    sessionRef.current = null; // stara sesja (np. martwa) nie moze wywolac smierci w nowej
    loadedName.current = metas.find((m) => m.slot === slot)?.characterName ?? null;
    setCreated(null);
    setProblem(null);
    setSavesOpen(false);
    flow.startPlaying();
  };
  const menuCommands = useMemo(
    () =>
      createMenuSavesCommands({
        store,
        metas: () => menuMetas,
        onLoad: startLoad,
        refresh: refreshMenuSaves,
      }),
    [store, menuMetas],
  );
  const lastSlot = latestSaveSlot(menuMetas);
  /** "Wczytaj ostatni" spoza menu (ekran smierci): najnowszy zapis z magazynu albo powrot do menu. */
  const loadLatest = async (): Promise<void> => {
    const metas = await store.list().catch(() => [] as SaveMeta[]);
    const slot = latestSaveSlot(metas);
    if (slot) startLoad(slot, metas);
    else flow.toMenu();
  };

  const refreshPipboy = (): void => {
    const s = sessionRef.current;
    if (!s) return;
    pipboy.value = buildPipboyView(
      s,
      extrasRef.current,
      tables.current,
      created?.name ?? loadedName.current ?? 'Wybraniec',
    );
  };

  // kreator: dane z gry po wybraniu folderu
  useEffect(() => {
    if (!c || screen !== 'creator') return;
    let dead = false;
    void createRemoteVfs(c).then(
      async (r) => {
        const [data, t] = await Promise.all([
          loadCreatorData(r.vfs, msgOpts()),
          loadGameTables(r.vfs, msgOpts()),
        ]);
        if (dead) return;
        tables.current = t;
        setCreator(data);
      },
      (e: unknown) => setProblem(String(e)),
    );
    return () => {
      dead = true;
    };
  }, [c, screen]);

  const binding = useMemo(
    () =>
      creator
        ? createCreatorBinding({
            presets: creator.presets,
            texts: creator.texts,
            rulesContext: creator.rulesContext,
            onFinish: (ch) => {
              setCreated(ch);
              flow.startPlaying();
            },
          })
        : null,
    [creator, flow],
  );
  const [creatorView, setCreatorView] = useState(binding?.view.value ?? null);
  useEffect(() => {
    if (!binding) return;
    setCreatorView(binding.view.value);
    return binding.view.subscribe(setCreatorView);
  }, [binding]);

  // panel startowy (onboarding, zakladki, kopia) zwija sie na czas rozgrywki
  useEffect(() => {
    setInGame(screen === 'playing');
    return () => setInGame(false);
  }, [screen]);

  // wykrywanie smierci gracza (hp <= 0 w arkuszu)
  useEffect(() => {
    if (screen !== 'playing') return;
    const id = setInterval(() => {
      const s = sessionRef.current;
      if (s) {
        refreshPipboy();
        if (s.state.sheet.hp <= 0) flow.die('hp0');
        else pollEndSignals(s.world.scripts, flow, s.world.clock);
      }
    }, 300);
    return () => clearInterval(id);
  });

  // limit 13 lat gry (0x4a34cc): oryginal sprawdza przy kazdym przesunieciu zegara, tu wywolanie zdarzeniowe
  // z settera GameClock.ticks (odpytywanie 300 ms wyzej zostaje tylko jako siatka dla sygnalow skryptow)
  useEffect(() => {
    if (screen !== 'playing') return;
    const clock = sessionRef.current?.world.clock;
    if (!clock) return;
    return clock.onYearLimit(() => void pollYearLimit(clock, flow));
  }, [screen, flow]);

  // smierc / zakonczenie: EndgameFlow z tabelami gry
  useEffect(() => {
    if (screen !== 'death' && screen !== 'ending') return;
    const t = tables.current;
    const extras = extrasRef.current;
    const s = sessionRef.current;
    const narration = createNarrationSpeech(async () => {
      const c = client.value;
      if (!c) throw new Error('brak klienta gry');
      const a = await ensureAudio(c);
      void a.system.resume();
      return a.system.speech;
    });
    const ef = new EndgameFlow({
      endgameTable: t?.endgame ?? [],
      deathTable: t?.enddeath ?? [],
      gvars: extras?.gvars ?? new GvarRegistry([], []),
      isAreaKnown: () => false,
      level: s?.state.sheet.progress.level ?? 1,
      rng: { int: (min, max) => min + Math.floor(Math.random() * (max - min + 1)) },
      lang: 'english',
      speech: narration,
      loadText: async () => null,
      movie: { play: async (n) => String(await playMovie(n as never).catch(() => 'missing')) },
      lastSave: async () => latestSaveSlot(await store.list().catch(() => [] as SaveMeta[])),
    });
    endFlowRef.current = ef;
    setEndView(toPreact<EndgameView>(ef.view as never));
    const run =
      screen === 'death' ? ef.runDeath(flow.deathReason.value === 'timeout' ? 2 : 0) : ef.run();
    void run.then(
      () => flow.toMenu(),
      (e: unknown) => {
        console.error('zakonczenie gry', e);
        flow.toMenu();
      },
    );
    return () => ef.finishCredits();
  }, [screen, flow]);

  // walka: prawdziwy silnik (@f2/rules) przez CombatController
  /** Widok sesji dla walki: dokłada `extras` (druzyna), ktorych GameSession nie wystawia publicznie. */
  const combatHostOf = (s: GameSession): CombatHost => ({
    get world() {
      return s.world;
    },
    get state() {
      return s.state;
    },
    enemiesNearby: () => s.enemiesNearby(),
    ...(extrasRef.current ? { extras: extrasRef.current } : {}),
  });
  /** Wznawia walke zapisana w modData (po wczytaniu zapisu); czysci stara walke, gdy zapisu walki brak. */
  const resumeCombat = (s: GameSession): void => {
    ccRef.current = null;
    setCombat(null);
    const save = loadCombatSave(s);
    if (!save) return;
    const cc = CombatController.restore(combatHostOf(s), save, combatOptions());
    if (cc) {
      ccRef.current = cc;
      setCombat(cc);
      afterAction(cc);
    } else saveCombat(s, null);
  };
  /** Wejscia walki zalezne od mapy: amunicja z cache proto i swiatlo heksa (LightMap). */
  const mapCombatInputs = (): Pick<
    CombatStartOptions,
    'ammoProto' | 'hexLight' | 'ambientLight'
  > => {
    const ms = mapRef.current;
    return ms
      ? {
          ammoProto: (pid) => ms.ammoData(pid),
          hexLight: (h) => ms.hexLight(h),
          ambientLight: () => ms.ambientLight(),
        }
      : {};
  };
  const combatOptions = (): CombatStartOptions => ({
    ...mapCombatInputs(),
    onChange: () => bump((n) => n + 1),
    onKill: (xp, killType) => hostRef.current?.awardKill(xp, killType),
    onEvent: (e) => {
      mapRef.current?.logCombatEvent(e);
      for (const cue of animCuesFor(e))
        void mapRef.current?.playAnim(cue.id, cue.anim, { queue: cue.queue ?? false });
    },
  });
  const startCombat = (requests: CombatRequest[] = []): void => {
    const s = sessionRef.current;
    if (!s) return;
    const cc = CombatController.start(combatHostOf(s), {
      ...mapCombatInputs(),
      ...(requests.length > 0 ? { requests } : {}),
      // walka zakonczona spoza akcji gracza (np. terminate_combat ze skryptu): domknij stan UI
      onChange: () => {
        const c = ccRef.current;
        if (c?.ended) afterAction(c);
        else bump((n) => n + 1);
      },
      onKill: (xp, killType) => hostRef.current?.awardKill(xp, killType),
      onEvent: (e) => {
        mapRef.current?.logCombatEvent(e);
        for (const cue of animCuesFor(e))
          void mapRef.current?.playAnim(cue.id, cue.anim, { queue: cue.queue ?? false });
      },
    });
    if (cc) {
      ccRef.current = cc;
      setCombat(cc);
      afterAction(cc);
    }
  };
  startCombatRef.current = startCombat;
  const afterAction = (cc: CombatController): void => {
    if (cc.ended) {
      if (ccRef.current !== cc) return; // juz domkniete (onChange albo wczesniejsze wywolanie)
      ccRef.current = null;
      setCombat(null);
      if (!cc.combat.playerAlive) flow.die('combat');
    } else bump((n) => n + 1);
  };
  const playerAttack = (): void => {
    const cc = ccRef.current;
    if (!cc) return;
    const foe = cc.nearestFoe();
    if (foe) cc.attack(foe.id);
    afterAction(cc);
  };
  const playerEndTurn = (): void => {
    const cc = ccRef.current;
    if (!cc) return;
    cc.endTurn();
    afterAction(cc);
  };
  const playerAim = (part: BodyPart): void => {
    const cc = ccRef.current;
    if (!cc || !cc.canAim()) return;
    cc.aim = cc.aim === part ? BodyPart.Uncalled : part;
    bump((n) => n + 1);
  };
  const playerMode = (): void => {
    const cc = ccRef.current;
    if (!cc || !cc.canSecondary()) return;
    cc.toggleMode();
    bump((n) => n + 1);
  };
  const interceptTap = (hex: number): boolean => {
    const cc = ccRef.current;
    if (!cc || cc.ended) {
      const r = invRef.current?.tapAt(hex);
      if (r?.opened) setInvOpen(true);
      // samouczek: dotkniecie obiektu = interakcja, puste pole = ruch (podpowiedz pada tylko raz)
      hintForTap(r?.handled ?? false);
      return r?.handled ?? false;
    }
    const foe = cc.foeAt(hex);
    if (foe) cc.attack(foe.id);
    else if (cc.playerTurn) cc.moveTo(hex);
    afterAction(cc);
    return true;
  };

  const interceptTapRef = useRef<(hex: number) => boolean>(() => false);
  interceptTapRef.current = interceptTap;

  const screenOptions = useMemo(
    () => ({
      initialState: (): SessionState | undefined => {
        const st = defaultSessionState();
        if (created) st.sheet = sheetFromCritter(created.critter);
        return st;
      },
      playMovie: playGameMovie,
      midnight: makeMidnightHost(flow),
      characterName: () => created?.name ?? loadedName.current ?? 'Wybraniec',
      makeExtras: async (
        ctx: Parameters<NonNullable<import('./map/map-screen').MapScreenDeps['makeExtras']>>[0],
      ) => {
        vfsRef.current = ctx.vfs;
        tables.current ??= await loadGameTables(ctx.vfs, msgOpts());
        textsRef.current ??= await loadCharacterTexts(ctx.vfs, msgOpts());
        const t = tables.current;
        const ex = new SessionExtras({
          vars: ctx.vars,
          partyDefs: t.partyDefs,
          player: ctx.player,
          rebindParty: (entries) => ctx.scripts()?.inventory.rebindParty(entries) ?? 0,
          quests: t.quests,
          holodisks: t.holodisks,
          karmavar: t.karmavar,
        });
        extrasRef.current = ex;
        return ex;
      },
      interceptTap: (hex: number): boolean => interceptTapRef.current(hex),
      isInCombat: (): boolean => !!ccRef.current && !ccRef.current.ended,
      onLoaded: (s: GameSession): void => {
        resumeCombat(s);
        afterLoadWorldRef.current(s);
      },
      onMenuOpen: () => void hintForMenu(),
      openContainer: (
        o: import('@f2/engine-core').GameObject,
      ): { ok: boolean; reason?: string } => {
        const inv = invRef.current;
        if (!inv) return { ok: false };
        const r = inv.openContainer(o);
        if (r.ok) setInvOpen(true);
        return r.ok ? { ok: true } : { ok: false, reason: String(r.reason) };
      },
      pickupObject: (o: import('@f2/engine-core').GameObject): { ok: boolean; reason?: string } => {
        const inv = invRef.current;
        if (!inv) return { ok: false };
        if (subtypeOf(o) === 1) {
          const r = inv.openContainer(o);
          if (r.ok) setInvOpen(true);
          return r.ok ? { ok: true } : { ok: false, reason: String(r.reason) };
        }
        const r = inv.pickup(o);
        return r.ok ? { ok: true } : { ok: false, reason: String(r.reason) };
      },
      onWorldMap: (req: { townMap: boolean; fromMap: string }): void => {
        void openWorldRef.current(req.fromMap);
      },
      onSession: (s: GameSession) => {
        sessionRef.current = s;
        // zapis (reczny, szybki, auto) niesie stan mapy swiata i samochodu oraz flage "mapa swiata otwarta"
        s.beforeSave = (): void => {
          const cached = wmRef.current;
          captureWorldmapForSave(
            s,
            cached && cached.session === s ? cached.ctl : null,
            wmShown.current,
          );
        };
        if (vfsRef.current) {
          invRef.current = createInventoryHost(s, {
            vfs: vfsRef.current,
            locale: () => locale.value,
            onChange: refreshPipboy,
            combatGate: () => ccRef.current?.chemGate() ?? null,
          });
          setInvHost(invRef.current);
        }
        hostUnsub.current?.();
        const host = createCharacterHost(s, {
          name: () => created?.name ?? loadedName.current ?? 'Wybraniec',
          texts: textsRef.current ?? {
            perk: (i) => ({ name: `Perk ${i}`, description: '' }),
            trait: (i) => ({ name: `Trait ${i}`, description: '' }),
          },
          locale: () => locale.value,
          onChange: refreshPipboy,
        });
        hostRef.current = host;
        (window as unknown as { __f2CharacterHost?: CharacterHost }).__f2CharacterHost = host;
        const sig = toPreact<PlayerView>(host.view);
        setCharView(sig);
        let wasPending = false;
        hostUnsub.current = host.view.subscribe((v) => {
          if (v.levelUpPending && !wasPending && !charOpenRef.current) setCharOpen(true);
          wasPending = v.levelUpPending;
        });
        refreshPipboy();
      },
    }),
    [created],
  );

  if (!c)
    return (
      <p class="muted" data-testid="shell-needs-folder">
        {tr('Wybierz folder z grą.', 'Pick the game folder.')}
      </p>
    );

  if (screen === 'menu') {
    return (
      <>
        <MainMenuScreen
          view={signal(menuView(lastSlot))}
          canQuit={false}
          commands={{
            advance: () => undefined,
            finishCredits: () => undefined,
            newGame: () => void flow.newGame(),
            load: () => {
              void refreshMenuSaves();
              setSavesOpen(true);
            },
            loadLast: () => {
              if (lastSlot) void menuCommands.load(lastSlot);
            },
            openSettings: () => setOptionsOpen(true),
            showCredits: () => void flow.showCredits(),
          }}
        />
        <Modal
          open={optionsOpen}
          title={tr('Opcje', 'Options')}
          onClose={() => setOptionsOpen(false)}
          artBackground="opts.bg"
        >
          <OptionsHost />
        </Modal>
        <Modal
          open={savesOpen}
          title={tr('Wczytaj grę', 'Load game')}
          onClose={() => setSavesOpen(false)}
          artBackground="save.bg"
        >
          <SavesScreen view={menuSaves} commands={menuCommands} loadOnly />
        </Modal>
        {problem && (
          <p class="error" data-testid="load-error">
            {problem}
          </p>
        )}
      </>
    );
  }
  if (screen === 'creator') {
    return (
      <div data-testid="creator-root">
        {problem && <p class="error">{problem}</p>}
        {binding && creatorView ? (
          <CreatorScreen view={creatorView} commands={binding.commands} />
        ) : (
          <p class="muted">{tr('Ładowanie kreatora...', 'Loading creator...')}</p>
        )}
      </div>
    );
  }
  if (screen === 'death' || screen === 'ending' || screen === 'credits') {
    return endView ? (
      <EndgameHost
        view={endView}
        canQuit={false}
        commands={{
          advance: () => endFlowRef.current?.advance(),
          finishCredits: () => {
            endFlowRef.current?.finishCredits();
            flow.toMenu();
          },
          newGame: () => {
            flow.toMenu();
            flow.newGame();
          },
          load: () => {
            flow.toMenu();
            setSavesOpen(true);
          },
          loadLast: () => void loadLatest(),
          openSettings: () => {
            flow.toMenu();
            setOptionsOpen(true);
          },
          showCredits: () => undefined,
        }}
      />
    ) : (
      <p class="muted">...</p>
    );
  }

  const me = combat?.combat.all.find((x) => x.isPlayer);
  const aimFoe = combat?.nearestFoe();
  return (
    <div class="game-shell" data-testid="game-shell">
      <TutorialHint />
      {wm && (
        <div
          class="worldmap-overlay"
          data-testid="worldmap-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: '#10130f',
            overflow: 'auto',
          }}
        >
          <WorldmapScreen
            controller={wm}
            art={wmArt}
            trunk={trunkFor(wm)}
            onEnterMap={enterFromWorld}
            onClose={closeWorld}
          />
        </div>
      )}
      <MapView
        autoOpen={START_MAP}
        screenOptions={screenOptions}
        onOpened={(ms) => {
          const slot = pendingLoad.current;
          if (!slot) return;
          pendingLoad.current = null;
          void ms.loadSlot(slot).then((r) => {
            if (!r.ok) {
              setProblem(
                tr(
                  `Nie udało się wczytać zapisu (${r.reason}).`,
                  `Could not load the save (${r.reason}).`,
                ),
              );
              flow.toMenu();
            }
          });
        }}
        onScreen={(s) => {
          mapRef.current = s;
        }}
      />
      <Modal
        open={optionsOpen}
        title={tr('Opcje', 'Options')}
        onClose={() => setOptionsOpen(false)}
        artBackground="opts.bg"
      >
        <OptionsHost />
      </Modal>
      <Modal
        open={invOpen}
        title={tr('Ekwipunek', 'Inventory')}
        onClose={() => setInvOpen(false)}
        artBackground="inv.bg"
      >
        {invHost && (
          <InventoryScreen
            inventory={invHost.inventory}
            container={invHost.container}
            commands={invHost.commands}
            sprite={invHost.sprite}
          />
        )}
      </Modal>
      <ExplosiveTimerDialog />
      <ElevatorDialog />
      <Modal
        open={ordersOpen}
        title={tr('Rozkazy drużyny', 'Party orders')}
        onClose={() => setOrdersOpen(false)}
      >
        {ordersOpen && extrasRef.current && (
          <PartyOrdersScreen
            rows={() => partyOrdersView(extrasRef.current!.party, tables.current?.partyDefs ?? [])}
            onSet={(objId, key, value) =>
              setPartyOrder(extrasRef.current!.party, objId, key, value)
            }
            nameOf={partyNameOf}
          />
        )}
      </Modal>
      <Modal
        open={charOpen}
        title={tr('Postać', 'Character')}
        onClose={() => setCharOpen(false)}
        artBackground="char.bg"
      >
        {charView && hostRef.current && (
          <CharacterScreen view={{ player: charView }} commands={hostRef.current.commands} />
        )}
      </Modal>
      <div class="game-shell__hud" data-testid="shell-hud">
        <PipboyHost view={pipboy} />
        <button type="button" data-testid="fullscreen-toggle" onClick={toggleFullscreen}>
          {isFullscreen() ? tr('Z okna', 'Windowed') : tr('Pełny ekran', 'Fullscreen')}
        </button>
        <button
          type="button"
          data-testid="inv-open"
          onClick={() => {
            invRef.current?.refresh();
            setInvOpen(true);
          }}
        >
          {tr('Ekwipunek', 'Inventory')}
        </button>
        <button
          type="button"
          data-testid="worldmap-open"
          onClick={() => void openWorld(mapRef.current?.mapName.value)}
        >
          {tr('Mapa świata', 'World map')}
        </button>
        <button type="button" data-testid="orders-open" onClick={() => setOrdersOpen(true)}>
          {tr('Rozkazy', 'Orders')}
        </button>
        <button
          type="button"
          data-testid="char-open"
          onClick={() => {
            hostRef.current?.refresh();
            setCharOpen(true);
          }}
        >
          {tr('Postać', 'Character')}
        </button>
        {!combat && (
          <button type="button" data-testid="combat-start" onClick={() => startCombat()}>
            {tr('Walka', 'Combat')}
          </button>
        )}
        {combat && me && (
          <span data-testid="combat-hud">
            HP {me.hp} AP {me.ap}
            <button type="button" data-testid="combat-attack" onClick={playerAttack}>
              {tr('Atakuj', 'Attack')}
              {aimFoe && combat ? ` ${combat.chance(aimFoe.id)}%` : ''}
            </button>
            {combat?.canSecondary() && (
              <button
                type="button"
                data-testid="combat-mode"
                aria-pressed={combat.mode === 1}
                onClick={playerMode}
              >
                {tr('Tryb', 'Mode')} {combat.mode === 1 ? 2 : 1} ({combat.attackCost()} AP)
              </button>
            )}
            {AIM_PARTS.map((p) => (
              <button
                key={p.part}
                type="button"
                data-testid={`combat-aim-${p.id}`}
                aria-pressed={combat?.aim === p.part}
                disabled={!combat?.canAim()}
                onClick={() => playerAim(p.part)}
              >
                {tr(p.pl, p.en)}
                {aimFoe && combat ? ` ${combat.chance(aimFoe.id, p.part)}%` : ''}
              </button>
            ))}
            <button type="button" data-testid="combat-end-turn" onClick={playerEndTurn}>
              {tr('Koniec tury', 'End turn')}
            </button>
          </span>
        )}
        <button type="button" data-testid="shell-end" onClick={() => void flow.endGame()}>
          {tr('Zakończ grę', 'End game')}
        </button>
      </div>
    </div>
  );
}
