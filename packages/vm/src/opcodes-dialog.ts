import {
  DIALOG_DONE_TEXT,
  DialogSession,
  dialogSessions,
  type DialogHooks,
  type DialogOption,
  type DialogState,
} from './dialog-state.js';
import type { ExecContext, OpHandler } from './interpreter.js';
import { int, toInt, type Value } from './stack.js';
import type { GameHooks } from './hooks.js';

/**
 * Opkody dialogu (dokumentacja techniczna). Kolejnosc argumentow: ostatni argument jest na szczycie stosu.
 * - start_gdialog(msgFile, npc, mood, headNum, background)
 * - gsay_reply(list, msg), gsay_message(list, msg, reaction)
 * - giq_option(iq, list, msg, proc, reaction), gsay_option(list, msg, proc) (3 argumenty wg tabeli opkodow)
 * msg to numer wiadomosci (int) albo tekst wprost (string); proc to nazwa (string) albo indeks (int).
 */

function dialogHooks(c: ExecContext): DialogHooks {
  const d = (c.hooks as Partial<GameHooks>).dialog;
  if (!d || typeof (d as Partial<DialogHooks>).update !== 'function') c.fail('brak hooks.dialog');
  return d as DialogHooks;
}

function msgText(c: ExecContext, list: number, msg: Value): { text: string; id?: number } {
  if (msg.t === 'str') return { text: msg.v };
  const id = toInt(msg);
  const lookup = (c.hooks as Partial<GameHooks>).messageStr;
  return { text: lookup ? lookup.call(c.hooks, list, id) : `<msg ${list}:${id}>`, id };
}

/** Tekst kwestii NPC; przy okazji zleca hostowi mowe (hooks.speak). */
function speakLine(c: ExecContext, s: DialogSession, list: number, msg: Value): string {
  const m = msgText(c, list, msg);
  dialogHooks(c).speak?.({
    list,
    msgId: m.id,
    text: m.text,
    npcObjId: s.state.npcObjId,
    headFid: s.state.headFid,
  });
  return m.text;
}

function newState(npc: number, head: number, background: number): DialogState {
  return {
    npcObjId: npc,
    headFid: head,
    background,
    reaction: 50,
    npcText: '',
    options: [],
    history: [],
    mode: 'reply',
  };
}

function session(c: ExecContext): DialogSession {
  let s = dialogSessions.get(c.instance);
  if (!s) {
    // gsay_* bez start_gdialog (nie wystepuje w 1443 skryptach, ale nie wywracamy VM)
    const hooks = dialogHooks(c);
    s = new DialogSession(newState(-1, 0, 0), c.instance, c.interp, hooks);
    dialogSessions.set(c.instance, s);
    hooks.start(s.state, s);
  }
  return s;
}

/** Nazwa procedury wezla z argumentu opcji; undefined = opcja konczy petle. */
function procName(c: ExecContext, v: Value): string | undefined {
  if (v.t === 'str') return v.v === '' ? undefined : v.v;
  const idx = toInt(v);
  if (idx < 0) return undefined;
  const p = c.instance.script.procs[idx];
  if (!p) c.fail(`opcja dialogu: brak procedury #${idx}`);
  return p!.bodyOffset === 0 ? undefined : p!.name;
}

function addOption(
  c: ExecContext,
  iq: number,
  list: number,
  msg: Value,
  proc: Value,
  reaction: number,
): void {
  const s = session(c);
  const { text, id } = msgText(c, list, msg);
  const playerIq = dialogHooks(c).playerIq();
  const visible = iq >= 0 ? playerIq >= iq : playerIq <= -iq;
  const targetProc = procName(c, proc);
  const opt: DialogOption = {
    index: s.state.options.length,
    text,
    iqRequired: iq,
    reaction,
    visible,
  };
  if (targetProc !== undefined) opt.targetProc = targetProc;
  if (id !== undefined) opt.targetMsgId = id;
  s.state.options.push(opt);
}

export const dialogHandlers: ReadonlyMap<number, OpHandler> = new Map<number, OpHandler>([
  [
    0x80de,
    (c) => {
      const background = c.stack.popInt();
      const head = c.stack.popInt();
      c.stack.popInt(); // mood
      const npc = c.stack.popInt();
      c.stack.popInt(); // msgFile
      const hooks = dialogHooks(c);
      const s = new DialogSession(newState(npc, head, background), c.instance, c.interp, hooks);
      dialogSessions.set(c.instance, s);
      hooks.start(s.state, s);
    },
  ],
  [
    0x80df,
    (c) => {
      const s = dialogSessions.get(c.instance);
      if (!s) return;
      s.state.mode = 'closed';
      s.state.options = [];
      if (!s.ended) {
        s.ended = true;
        dialogHooks(c).end();
      }
      dialogSessions.delete(c.instance);
    },
  ],
  [
    0x80e0,
    (c) => {
      session(c).state.reaction = c.stack.popInt();
    },
  ],
  [
    0x811c,
    (c) => {
      const s = session(c);
      s.state.options = [];
      s.state.mode = 'reply';
    },
  ],
  [
    0x811d,
    (c) => {
      const s = session(c);
      // wartosc zwrotna wezla wywolanego przez choose() zostaje na stosie: odrzucamy
      if (s.savedDepth !== undefined) {
        c.stack.truncate(s.savedDepth);
        s.savedDepth = undefined;
      }
      if (!s.state.options.some((o) => o.visible)) return; // petla konczy sie bez opcji
      s.state.history.push({ who: 'npc', text: s.state.npcText });
      dialogHooks(c).update(s.state);
      s.arm(c);
    },
  ],
  [
    0x811e,
    (c) => {
      const msg = c.stack.pop();
      const list = c.stack.popInt();
      const s = session(c);
      s.state.npcText = speakLine(c, s, list, msg);
      s.state.mode = 'reply';
    },
  ],
  [
    0x811f,
    (c) => {
      const proc = c.stack.pop();
      const msg = c.stack.pop();
      const list = c.stack.popInt();
      addOption(c, 0, list, msg, proc, 50);
    },
  ],
  [
    0x8120,
    (c) => {
      const reaction = c.stack.popInt();
      const msg = c.stack.pop();
      const list = c.stack.popInt();
      const s = session(c);
      s.state.npcText = speakLine(c, s, list, msg);
      s.state.mode = 'message';
      s.state.options = [
        { index: 0, text: DIALOG_DONE_TEXT, iqRequired: 0, reaction, visible: true },
      ];
    },
  ],
  [
    0x8121,
    (c) => {
      const reaction = c.stack.popInt();
      const proc = c.stack.pop();
      const msg = c.stack.pop();
      const list = c.stack.popInt();
      const iq = c.stack.popInt();
      addOption(c, iq, list, msg, proc, reaction);
    },
  ],
  // gdialog_barter(mod): zapisuje mod i otwiera ekran handlu z NPC rozmowy (0x45afa0, D).
  // Bez aktywnej rozmowy oryginal nic nie robi (zwraca -1, tabela: brak wartosci zwrotnej).
  [
    0x8129,
    (c) => {
      const mod = c.stack.popInt();
      const s = dialogSessions.get(c.instance);
      c.interp.traceHook('gdialog_barter', [int(mod)]);
      if (!s || s.ended) return;
      s.barterMod = mod;
      dialogHooks(c).barter?.(s.state.npcObjId, mod);
    },
  ],
  [
    0x814e,
    (c) => {
      const mod = c.stack.popInt();
      const s = dialogSessions.get(c.instance);
      c.interp.traceHook('gdialog_set_barter_mod', [int(mod)]);
      if (s) s.barterMod = mod;
    },
  ],
]);
