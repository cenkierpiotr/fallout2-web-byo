import { int } from './stack.js';
import type { ExecContext, Interpreter, ScriptInstance } from './interpreter.js';

/** Tekst jedynej opcji gsay_message (przycisk "Done"; tekst oryginalu nieustalony, dialog.md). */
export const DIALOG_DONE_TEXT = 'Done';

/** Wartosci reakcji opcji (konwencja skryptow Fallouta: 49 dobra, 50 neutralna, 51 zla; dialog.md: Z). */
export const REACTION_GOOD = 49;
export const REACTION_NEUTRAL = 50;
export const REACTION_BAD = 51;

export type ReactionKind = 'good' | 'neutral' | 'bad';

/** Klasyfikacja reakcji do kolorowania opcji (kolory Empathy dobiera UI; spec: Z). */
export function reactionKind(reaction: number): ReactionKind {
  return reaction === REACTION_GOOD ? 'good' : reaction === REACTION_BAD ? 'bad' : 'neutral';
}

export interface DialogOption {
  /** Pozycja w `DialogState.options` (argument `choose`). */
  index: number;
  text: string;
  /** Nazwa procedury wezla wywolywanej po wyborze; brak = opcja konczy petle dialogu. */
  targetProc?: string;
  targetMsgId?: number;
  /** Prog IQ z giq_option (0 dla gsay_option/gsay_message). */
  iqRequired: number;
  reaction: number;
  /** false gdy IQ gracza nie spelnia progu (opcja zostaje w liscie dla diagnostyki, UI ja pomija). */
  visible: boolean;
}

export interface DialogState {
  npcObjId: number;
  headFid: number;
  background: number;
  reaction: number;
  npcText: string;
  options: DialogOption[];
  history: { who: 'npc' | 'player'; text: string }[];
  mode: 'reply' | 'message' | 'closed';
}

export interface DialogHooks {
  /** Otwarcie rozmowy (start_gdialog); `session` pozwala UI wolac choose/close. */
  start(state: DialogState, session: DialogSession): void;
  /** Nowa odpowiedz NPC i opcje gotowe do pokazania (przed oczekiwaniem na wybor). */
  update(state: DialogState): void;
  /** Interpreter zostal zawieszony do wywolania DialogSession.choose/close. */
  waitForChoice(): void;
  end(): void;
  playerIq(): number;
  hasEmpathy(): boolean;
  /**
   * gdialog_barter(mod): otwarcie ekranu handlu z NPC rozmowy; `mod` = barter_mod w procentach
   * (spec barter.md: D). Brak hooka = handel nie jest dostepny (opkod bez efektu).
   */
  barter?(npcObjId: number, mod: number): void;
  /**
   * Kwestia NPC (gsay_reply 0x811e, gsay_message 0x8120): host odtwarza mowe, gdy wpis MSG ma pole audio
   * i plik istnieje; brak pliku = cisza, nie blad. Wolane tez dla wpisow bez audio (msgId undefined przy
   * tekscie wprost), zeby host zatrzymal poprzednia kwestie (nastepna kwestia przerywa mowe). Opcje
   * gracza (giq_option/gsay_option) nie niosa mowy w F2 (W), wiec nie wolaja hooka.
   */
  speak?(line: {
    list: number;
    msgId: number | undefined;
    text: string;
    npcObjId: number;
    headFid: number;
  }): void;
}

export const DIALOG_SUSPEND_REASON = 'dialog';

/**
 * Sesja rozmowy zwiazana z instancja skryptu. gsay_end zawiesza instancje (suspendReason='dialog'),
 * choose() wywoluje procedure wezla opcji w tej samej instancji (adres powrotu = ponowne gsay_end,
 * czyli petla "wyswietl, czekaj, wywolaj wezel" z 0x4456d8) i wznawia interpreter.
 */
export class DialogSession {
  /** Kontekst opkodu gsay_end, w ktorym instancja czeka na wybor. */
  private waiting: ExecContext | undefined;
  /** Glebokosc stosu danych sprzed wywolania wezla (wartosc zwrotna wezla jest odrzucana). */
  savedDepth: number | undefined;
  /** hooks.end() wywolane. */
  ended = false;
  /** Ostatni barter_mod z gdialog_set_barter_mod / gdialog_barter (0x51873c; spec barter.md: D). */
  barterMod = 0;

  constructor(
    readonly state: DialogState,
    readonly instance: ScriptInstance,
    private readonly interp: Interpreter,
    private readonly hooks: DialogHooks,
  ) {}

  get isWaiting(): boolean {
    return this.waiting !== undefined;
  }

  /** Wolane przez gsay_end tuz przed zawieszeniem. */
  arm(ctx: ExecContext): void {
    this.waiting = ctx;
    this.instance.suspendReason = DIALOG_SUSPEND_REASON;
    this.hooks.waitForChoice();
    ctx.suspend();
  }

  choose(index: number): void {
    const ctx = this.waiting;
    if (!ctx) throw new Error('DialogSession.choose: dialog nie czeka na wybor');
    const opt = this.state.options[index];
    if (!opt || !opt.visible)
      throw new Error(`DialogSession.choose: brak widocznej opcji ${index}`);
    this.state.history.push({ who: 'player', text: opt.text });
    this.state.reaction = opt.reaction;
    this.state.options = [];
    this.waiting = undefined;
    this.instance.suspendReason = undefined;
    if (opt.targetProc === undefined) {
      this.state.mode = 'closed';
      this.resumeOrAbort();
      return;
    }
    const proc = this.instance.script.procs.find((p) => p.name === opt.targetProc);
    if (!proc) throw new Error(`DialogSession.choose: brak procedury ${opt.targetProc}`);
    this.state.mode = 'reply';
    this.savedDepth = this.instance.stack.depth();
    this.instance.retStack.push(int(ctx.pc));
    this.instance.stack.push(int(0));
    ctx.callProc(proc.index);
    this.resumeOrAbort();
  }

  /** Blad VM w wezle (interpreter robi abort do idle): zamykamy rozmowe, zeby UI nie wisialo, i propagujemy blad. */
  private resumeOrAbort(): void {
    try {
      this.interp.resume(this.instance);
    } catch (e) {
      this.state.mode = 'closed';
      this.state.options = [];
      this.savedDepth = undefined;
      if (!this.ended) {
        this.ended = true;
        this.hooks.end();
      }
      dialogSessions.delete(this.instance);
      throw e;
    }
  }

  /** Przerwanie rozmowy przez gracza: petla konczy sie, skrypt dochodzi do end_dialogue. */
  close(): void {
    if (!this.waiting) return;
    this.waiting = undefined;
    this.instance.suspendReason = undefined;
    this.state.options = [];
    this.state.mode = 'closed';
    this.resumeOrAbort();
  }
}

/** Sesje per instancja skryptu. */
export const dialogSessions = new WeakMap<ScriptInstance, DialogSession>();

export function getDialogSession(instance: ScriptInstance): DialogSession | undefined {
  return dialogSessions.get(instance);
}
