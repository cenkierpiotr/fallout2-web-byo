import { describe, expect, it } from 'vitest';
import { shouldIgnoreKey } from './keys';

const base = { ctrlKey: false, metaKey: false, altKey: false };

describe('shouldIgnoreKey', () => {
  it('przepuszcza zwykle klawisze', () => {
    expect(shouldIgnoreKey({ ...base, target: { tagName: 'BODY' } })).toBe(false);
    expect(shouldIgnoreKey({ ...base, target: null })).toBe(false);
  });
  it('ignoruje Ctrl/Cmd/Alt (zoom przegladarki)', () => {
    expect(shouldIgnoreKey({ ...base, ctrlKey: true, target: null })).toBe(true);
    expect(shouldIgnoreKey({ ...base, metaKey: true, target: null })).toBe(true);
    expect(shouldIgnoreKey({ ...base, altKey: true, target: null })).toBe(true);
  });
  it('ignoruje pola formularzy i suwaki', () => {
    for (const tagName of ['INPUT', 'SELECT', 'TEXTAREA']) {
      expect(shouldIgnoreKey({ ...base, target: { tagName } })).toBe(true);
    }
  });
});
