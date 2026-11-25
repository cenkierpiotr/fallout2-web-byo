import { beforeEach, describe, expect, it, vi } from 'vitest';

const copyMock = vi.fn();
const terminated: number[] = [];
const verifyMock = vi.fn<(...a: unknown[]) => Promise<unknown>>(async () => ({
  status: 'unknown',
  files: [],
}));
let nextId = 0;
const pending: Array<{ id: number; resolve: () => void; reject: (e: Error) => void }> = [];

vi.mock('@f2/assets', () => ({
  DecodeClient: class {
    id = nextId++;
    terminate(): void {
      terminated.push(this.id);
    }
    init(): Promise<{ entries: number; layers: string[] }> {
      return new Promise((resolve, reject) => {
        pending.push({ id: this.id, resolve: () => resolve({ entries: this.id + 1, layers: [] }), reject });
      });
    }
  },
}));
vi.mock('@f2/vfs/browser', () => ({
  findGameFiles: () => ({ missing: [] }),
  verifyGameFiles: (...a: unknown[]) => verifyMock(...a),
  copyToOpfs: (...a: unknown[]) => copyMock(...a),
  saveFolderHandle: vi.fn(),
}));
vi.mock('../i18n', () => ({ t: (k: string) => k }));

class FakeWorker {}
vi.stubGlobal('Worker', FakeWorker);

const picked = { kind: 'files', files: new Map() } as never;

describe('openFolder', () => {
  beforeEach(() => {
    terminated.length = 0;
    pending.length = 0;
    nextId = 0;
  });

  it('konczy klienta gdy init zawiedzie', async () => {
    const m = await import('./game-folder');
    const p = m.openFolder(picked);
    await Promise.resolve();
    pending[0]!.reject(new Error('boom'));
    await p;
    expect(terminated).toEqual([0]);
    expect(m.status.value).toBe('error');
    expect(m.client.value).toBeNull();
  });

  it('wyscig: starszy openFolder nie nadpisuje nowszego', async () => {
    const m = await import('./game-folder');
    const p1 = m.openFolder(picked);
    await Promise.resolve();
    const p2 = m.openFolder(picked);
    await Promise.resolve();
    pending[1]!.resolve();
    await p2;
    expect(m.status.value).toBe('ready');
    const winner = m.client.value;
    pending[0]!.resolve();
    await p1;
    expect(m.client.value).toBe(winner);
    expect(terminated).toEqual([0]);
    expect(m.status.value).toBe('ready');
  });

  it('stary klient jest terminowany dopiero po udanym init', async () => {
    const m = await import('./game-folder');
    const p = m.openFolder(picked);
    await Promise.resolve();
    pending[0]!.resolve();
    await p;
    const first = m.client.value;
    terminated.length = 0;
    const p2 = m.openFolder(picked);
    await Promise.resolve();
    expect(terminated).toEqual([]);
    pending[1]!.reject(new Error('x'));
    await p2;
    expect(m.client.value).toBe(first);
    expect(terminated).toEqual([1]);
  });

  it('uszkodzony plik (verify invalid) konczy sie bledem bez indeksowania', async () => {
    verifyMock.mockResolvedValueOnce({
      status: 'invalid',
      files: [{ name: 'master.dat', check: 'broken' }],
    });
    const m = await import('./game-folder');
    await m.openFolder(picked);
    expect(m.status.value).toBe('error');
    expect(m.error.value).toContain('firstrun.invalid');
    expect(pending.length).toBe(0);
  });

  it('persist: kopiuje do OPFS i indeksuje kopie', async () => {
    const opfsFolder = { kind: 'opfs', files: new Map() };
    copyMock.mockResolvedValueOnce(opfsFolder);
    vi.stubGlobal('navigator', {
      storage: { getDirectory: () => ({}), estimate: async () => ({ quota: 1e12, usage: 0 }) },
      userAgent: 'x',
    });
    const m = await import('./game-folder');
    const p = m.openFolder(picked, { persist: true });
    await new Promise((r) => setTimeout(r, 0));
    pending[0]!.resolve();
    await p;
    expect(copyMock).toHaveBeenCalled();
    expect(m.folder.value).toBe(opfsFolder);
    expect(m.status.value).toBe('ready');
  });
});
