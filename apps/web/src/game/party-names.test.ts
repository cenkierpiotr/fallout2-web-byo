import { describe, expect, it } from 'vitest';
import { createPartyNameResolver } from './party-names';

describe('createPartyNameResolver', () => {
  it('najpierw undefined, po dociagnieciu nazwa z msg i onUpdate, bez ponownych zapytan', async () => {
    let calls = 0;
    let updates = 0;
    const r = createPartyNameResolver({
      objectOf: (id) => (id === 7 ? { type: 1, proto: { textId: 4100 } } : undefined),
      describe: async (lang, type, textId) => {
        calls++;
        expect([lang, type, textId]).toEqual(['pl', 1, 4100]);
        return { name: ' Sulik ' };
      },
      lang: () => 'pl',
      onUpdate: () => void updates++,
    });
    expect(r({ objId: 7 })).toBeUndefined();
    expect(r({ objId: 7 })).toBeUndefined();
    await new Promise((x) => setTimeout(x, 0));
    expect(updates).toBe(1);
    expect(calls).toBe(1);
    expect(r({ objId: 7 })).toBe('Sulik');
    expect(calls).toBe(1);
  });
  it('brak obiektu na mapie albo wpisu w msg: undefined (zastepcze Towarzysz N)', async () => {
    const r = createPartyNameResolver({
      objectOf: () => undefined,
      describe: async () => undefined,
      lang: () => 'en',
      onUpdate: () => undefined,
    });
    expect(r({ objId: 1 })).toBeUndefined();
    const r2 = createPartyNameResolver({
      objectOf: () => ({ type: 1, proto: { textId: 1 } }),
      describe: async () => undefined,
      lang: () => 'en',
      onUpdate: () => undefined,
    });
    expect(r2({ objId: 1 })).toBeUndefined();
    await new Promise((x) => setTimeout(x, 0));
    expect(r2({ objId: 1 })).toBeUndefined();
  });
});
