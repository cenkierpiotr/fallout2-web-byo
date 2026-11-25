import { describe, expect, it } from 'vitest';
import {
  DIALOG_DONE_TEXT,
  Interpreter,
  Scheduler,
  ScriptInstance,
  dialogHandlers,
  getDialogSession,
  reactionKind,
  type DialogHooks,
  type DialogState,
  type Hooks,
} from '../index.js';
import { RET, buildInt, type Item, type ProcSpec } from './fixtures/build-int.js';

const P = (n: number): Item => ({ push: n });
const S = (s: string): Item => ({ pushs: s });
const START = 0x80de;
const END_DLG = 0x80df;
const REACTION = 0x80e0;
const G_START = 0x811c;
const G_END = 0x811d;
const G_REPLY = 0x811e;
const G_OPTION = 0x811f;
const G_MESSAGE = 0x8120;
const GIQ = 0x8121;
const BARTER = 0x8129;
const SETGV = 0x80c6;

function mk(iq = 5) {
  const globals: number[] = [];
  const log: string[] = [];
  const states: DialogState[] = [];
  const dialog: DialogHooks = {
    start: (s) => {
      log.push('start');
      states.push(s);
    },
    update: () => log.push('update'),
    waitForChoice: () => log.push('wait'),
    end: () => log.push('end'),
    playerIq: () => iq,
    hasEmpathy: () => false,
    barter: (npc, mod) => log.push(`barter:${npc}:${mod}`),
    speak: (l) => log.push(`speak:${l.list}:${l.msgId}:${l.npcObjId}:${l.headFid}`),
  };
  const hooks: Hooks & { dialog: DialogHooks; messageStr(l: number, m: number): string } = {
    getLocalVar: () => 0,
    setLocalVar: () => {},
    getMapVar: () => 0,
    setMapVar: () => {},
    getGlobalVar: (i) => globals[i] ?? 0,
    setGlobalVar: (i, v) => void (globals[i] = v),
    opcodeHandlers: new Map([
      ...dialogHandlers,
      [
        SETGV,
        (c) => {
          const v = c.stack.popInt();
          const i = c.stack.popInt();
          globals[i] = v;
        },
      ],
    ]),
    dialog,
    messageStr: (l, m) => `m${l}:${m}`,
  };
  return { hooks, globals, log, states, interp: new Interpreter(hooks) };
}

/** talk: start_gdialog, gsay_start, call node(idx 1), gsay_end, end_dialogue */
const talk = (): ProcSpec => ({
  name: 'talk',
  code: [
    P(0),
    P(100),
    P(4),
    P(1),
    P(2),
    START,
    G_START,
    { ref: 'R' },
    0x800d,
    P(0),
    P(1),
    0x8005,
    { label: 'R' },
    0x801a,
    G_END,
    END_DLG,
    P(0),
    ...RET,
  ],
});
const ret0: Item[] = [P(0), ...RET];
const setG = (g: number, v: number): Item[] => [P(g), P(v), SETGV];

function run(procs: ProcSpec[], iq = 5) {
  const t = mk(iq);
  const script = buildInt('d', procs);
  const inst = new ScriptInstance(script, 0);
  t.interp.run(inst, 'talk');
  return { ...t, inst };
}

const twoOptions = (): ProcSpec[] => [
  talk(),
  {
    name: 'node',
    code: [
      P(0),
      P(100),
      G_REPLY,
      P(4),
      P(0),
      P(106),
      S('proc_a'),
      P(50),
      GIQ,
      P(4),
      P(0),
      P(107),
      S('proc_b'),
      P(50),
      GIQ,
      ...ret0,
    ],
  },
  { name: 'proc_a', code: [...setG(0, 1), ...ret0] },
  { name: 'proc_b', code: [...setG(1, 1), ...ret0] },
];

describe('opkody dialogu', () => {
  it('gsay_reply zleca hostowi mowe (lista, id wpisu, npc, glowa); opcje giq nie', () => {
    const { log } = run(twoOptions());
    expect(log.filter((l) => l.startsWith('speak'))).toEqual(['speak:0:100:100:1']);
  });

  it('test_gsay_sequence_builds_state', () => {
    const { states, inst } = run(twoOptions());
    const s = states[0]!;
    expect(s.npcObjId).toBe(100);
    expect(s.background).toBe(2);
    expect(s.npcText).toBe('m0:100');
    expect(s.mode).toBe('reply');
    expect(s.options.map((o) => [o.text, o.targetProc, o.reaction, o.visible])).toEqual([
      ['m0:106', 'proc_a', 50, true],
      ['m0:107', 'proc_b', 50, true],
    ]);
    expect(getDialogSession(inst)?.state).toBe(s);
  });

  it('test_gsay_end_suspends_interpreter_until_choose', () => {
    const { inst, globals, log, interp } = run(twoOptions());
    expect(inst.state).toBe('suspended');
    expect(inst.suspendReason).toBe('dialog');
    expect(log).toEqual(['start', 'speak:0:100:100:1', 'update', 'wait']);
    // resume nie wznawia dialogu bez wyboru
    expect(interp.resume(inst)).toBeUndefined();
    expect(inst.state).toBe('suspended');
    getDialogSession(inst)!.choose(1);
    expect(globals[1]).toBe(1);
    expect(globals[0]).toBeUndefined();
    expect(inst.state).toBe('idle');
    expect(inst.stack.depth()).toBe(inst.base18 + 8);
    expect(log.at(-1)).toBe('end');
  });

  it('test_giq_option_hidden_when_iq_below_threshold', () => {
    const mixed = (): ProcSpec[] => [
      talk(),
      {
        name: 'node',
        code: [
          P(0),
          P(100),
          G_REPLY,
          P(-4),
          P(0),
          P(106),
          S('proc_a'),
          P(50),
          GIQ, // widoczna gdy INT <= 4
          P(4),
          P(0),
          P(107),
          S('proc_b'),
          P(50),
          GIQ, // widoczna gdy INT >= 4
          ...ret0,
        ],
      },
      { name: 'proc_a', code: ret0 },
      { name: 'proc_b', code: ret0 },
    ];
    const low = run(mixed(), 3);
    expect(low.states[0]!.options.map((o) => o.visible)).toEqual([true, false]);
    expect(() => getDialogSession(low.inst)!.choose(1)).toThrow();
    const neg = run(mixed(), 4);
    expect(neg.states[0]!.options.map((o) => o.visible)).toEqual([true, true]);
    // bez widocznych opcji petla konczy sie od razu (brak zawieszenia)
    const none = run(twoOptions(), 3);
    expect(none.inst.state).toBe('idle');
    expect(none.log).toEqual(['start', 'speak:0:100:100:1', 'end']);
  });

  it('test_dialogue_reaction_colors_from_spec', () => {
    const { states } = run([
      talk(),
      {
        name: 'node',
        code: [
          P(0),
          P(100),
          G_REPLY,
          P(51),
          REACTION,
          P(0),
          P(1),
          P(1),
          S('x'),
          P(49),
          GIQ,
          ...ret0,
        ],
      },
      { name: 'x', code: ret0 },
    ]);
    expect(states[0]!.reaction).toBe(51);
    expect(reactionKind(49)).toBe('good');
    expect(reactionKind(50)).toBe('neutral');
    expect(reactionKind(51)).toBe('bad');
    expect(states[0]!.options[0]!.reaction).toBe(49);
  });

  it('test_end_dialogue_closes_and_clears_suspended', () => {
    const { inst, states, log } = run(twoOptions());
    getDialogSession(inst)!.close();
    expect(states[0]!.mode).toBe('closed');
    expect(inst.suspendReason).toBeUndefined();
    expect(inst.state).toBe('idle');
    expect(getDialogSession(inst)).toBeUndefined();
    expect(log.filter((l) => l === 'end')).toHaveLength(1);
  });

  it('test_gsay_message_single_done_option', () => {
    const { states, inst, log } = run([
      talk(),
      { name: 'node', code: [P(0), P(200), P(50), G_MESSAGE, ...ret0] },
    ]);
    const s = states[0]!;
    expect(s.mode).toBe('message');
    expect(s.npcText).toBe('m0:200');
    expect(s.options).toHaveLength(1);
    expect(s.options[0]!.text).toBe(DIALOG_DONE_TEXT);
    getDialogSession(inst)!.choose(0);
    expect(inst.state).toBe('idle');
    expect(log.at(-1)).toBe('end');
  });

  it('test_option_without_proc_uses_msg_and_ends', () => {
    const { states, inst, globals } = run([
      talk(),
      {
        name: 'node',
        code: [P(0), P(100), G_REPLY, P(0), P(0), P(110), P(-1), P(50), GIQ, ...ret0],
      },
    ]);
    expect(states[0]!.options[0]).toMatchObject({ text: 'm0:110' });
    expect(states[0]!.options[0]!.targetProc).toBeUndefined();
    getDialogSession(inst)!.choose(0);
    expect(states[0]!.history).toEqual([
      { who: 'npc', text: 'm0:100' },
      { who: 'player', text: 'm0:110' },
    ]);
    expect(inst.state).toBe('idle');
    expect(globals).toEqual([]);
  });

  it('test_dialog_loop_returns_to_gsay_start_many_times', () => {
    // wezel pytania: kazdy wybor wraca do tego samego wezla (Klint), az do opcji konczacej
    const { inst, globals, states } = run([
      talk(),
      {
        name: 'node',
        code: [
          P(0),
          P(100),
          G_REPLY,
          P(0),
          P(0),
          P(1),
          S('ask'),
          P(50),
          GIQ,
          P(0),
          P(0),
          P(2),
          S('bye'),
          P(50),
          GIQ,
          ...ret0,
        ],
      },
      {
        name: 'ask',
        code: [{ ref: 'RN' }, 0x800d, P(0), P(1), 0x8005, { label: 'RN' }, 0x801a, ...ret0],
      },
      { name: 'bye', code: ret0 },
    ]);
    const session = getDialogSession(inst)!;
    void globals;
    for (let i = 0; i < 3; i++) {
      expect(inst.state).toBe('suspended');
      expect(session.state.options).toHaveLength(2);
      session.choose(0);
    }
    expect(session.state.options).toHaveLength(2);
    session.choose(1);
    expect(inst.state).toBe('idle');
    expect(states[0]!.history.filter((h) => h.who === 'player')).toHaveLength(4);
    expect(inst.stack.depth()).toBe(inst.base18 + 8);
    expect(inst.retStack.length).toBe(0);
  });

  it('test_gsay_option_and_barter_hook', () => {
    const { states, inst, log } = run([
      talk(),
      {
        name: 'node',
        code: [P(25), BARTER, P(0), P(100), G_REPLY, P(0), P(5), S('p'), G_OPTION, ...ret0],
      },
      { name: 'p', code: ret0 },
    ]);
    expect(states[0]!.options[0]).toMatchObject({ text: 'm0:5', targetProc: 'p', iqRequired: 0 });
    expect(inst.state).toBe('suspended');
    // npc z start_gdialog (100), mod z argumentu opkodu
    expect(log).toContain('barter:100:25');
    expect(getDialogSession(inst)!.barterMod).toBe(25);
  });

  it('test_set_barter_mod_stores_mod_without_opening', () => {
    const { inst, log } = run([
      talk(),
      {
        name: 'node',
        code: [P(-20), 0x814e, P(0), P(100), G_REPLY, P(0), P(5), S('p'), G_OPTION, ...ret0],
      },
      { name: 'p', code: ret0 },
    ]);
    expect(getDialogSession(inst)!.barterMod).toBe(-20);
    expect(log.some((l) => l.startsWith('barter:'))).toBe(false);
  });

  it('test_barter_without_hook_or_dialog_is_noop', () => {
    const t = mk();
    delete (t.hooks.dialog as { barter?: unknown }).barter;
    const inst = new ScriptInstance(
      buildInt('d', [
        talk(),
        {
          name: 'node',
          code: [P(0), BARTER, P(0), P(100), G_REPLY, P(0), P(5), S('p'), G_OPTION, ...ret0],
        },
        { name: 'p', code: ret0 },
      ]),
      0,
    );
    t.interp.run(inst, 'talk');
    expect(inst.state).toBe('suspended');
    // bez aktywnej sesji (skrypt bez start_gdialog) opkod nic nie robi
    const t2 = mk();
    const inst2 = new ScriptInstance(
      buildInt('d', [{ name: 'p', code: [P(0), BARTER, ...ret0] }]),
      0,
    );
    t2.interp.run(inst2, 'p');
    expect(t2.log).toEqual([]);
    expect(inst2.state).toBe('idle');
  });

  it('test_scheduler_flush_does_not_resume_dialog', () => {
    const t = mk();
    const sched = new Scheduler(t.interp, t.hooks);
    const e = sched.create({ sid: 1, script: buildInt('d', twoOptions()) });
    sched.runProc(1, 'talk' as never);
    expect(e.instance.state).toBe('suspended');
    sched.tick(10);
    sched.flush();
    expect(e.instance.state).toBe('suspended');
    expect(sched.errors).toEqual([]);
    getDialogSession(e.instance)!.choose(0);
    expect(t.globals[0]).toBe(1);
    expect(e.instance.state).toBe('idle');
  });

  it('test_vm_error_in_node_closes_dialog', () => {
    const { inst, log, states } = run([
      talk(),
      {
        name: 'node',
        code: [P(0), P(100), G_REPLY, P(0), P(0), P(1), S('bad'), P(50), GIQ, ...ret0],
      },
      { name: 'bad', code: [0x8039, ...ret0] }, // add na pustym stosie
    ]);
    expect(() => getDialogSession(inst)!.choose(0)).toThrow();
    expect(inst.state).toBe('idle');
    expect(states[0]!.mode).toBe('closed');
    expect(getDialogSession(inst)).toBeUndefined();
    expect(log.at(-1)).toBe('end');
  });
});
