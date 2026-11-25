import { signal, type Signal } from '@preact/signals';
import { AUTOMAP_BYTES, AUTOMAP_SIZE, type PipboyView } from './types';

export function createMockPipboyView(over: Partial<PipboyView['status']> = {}): Signal<PipboyView> {
  return signal<PipboyView>({
    status: {
      name: 'Wybraniec',
      level: 3,
      hp: 28,
      hpMax: 35,
      ap: 8,
      apMax: 8,
      exp: 2450,
      expNext: 3000,
      day: 1,
      ...over,
    },
  });
}

/** Dane demonstracyjne wszystkich zakladek (playground, e2e). */
export function createFullMockPipboyView(): Signal<PipboyView> {
  const bits = new Uint8Array(AUTOMAP_BYTES);
  for (let y = 40; y < 60; y++)
    for (let x = 40; x < 60; x++)
      bits[(y * AUTOMAP_SIZE + x) >> 3]! |= 1 << ((y * AUTOMAP_SIZE + x) & 7);
  return signal<PipboyView>({
    ...createMockPipboyView().value,
    quests: [
      {
        location: 'Arroyo',
        quests: [
          { description: 'Odzyskaj GECK', status: 'active' },
          { description: 'Znajdz Vic', status: 'completed' },
        ],
      },
      { location: 'Klamath', quests: [{ description: 'Uratuj Torr', status: 'active' }] },
    ],
    holodisks: [
      {
        id: 1,
        title: 'Dziennik Vaulta',
        text: Array.from({ length: 40 }, (_, i) => `Wiersz ${i + 1}`).join('\n'),
      },
    ],
    karma: { value: 120, titles: [{ name: 'Bohater', description: 'Pomagasz ludziom.' }] },
    automap: { width: AUTOMAP_SIZE, height: AUTOMAP_SIZE, bits, mapName: 'Arroyo', elevation: 0 },
    clock: { day: 1, hour: 13, minute: 0 },
  });
}
