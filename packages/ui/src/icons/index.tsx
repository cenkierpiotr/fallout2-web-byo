import type { ComponentChildren } from 'preact';

export const ICON_NAMES = [
  'inventory',
  'character',
  'pipboy',
  'map',
  'skills',
  'end-turn',
  'attack',
  'aim',
  'use',
  'look',
  'talk',
  'steal',
  'drop',
  'equip',
  'settings',
  'save',
  'load',
  'close',
  'back',
  'info',
  'plus',
  'minus',
  'search',
  'sort',
] as const;

export type IconName = (typeof ICON_NAMES)[number];

const iconMap: Record<IconName, ComponentChildren> = {
  inventory: (
    <>
      <path d="M5 8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z" />
      <path d="M9 5V3h6v2" />
      <path d="M9 13h6" />
    </>
  ),
  character: (
    <>
      <circle cx="12" cy="7" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  pipboy: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <rect x="6" y="8" width="8" height="6" rx="1" />
      <circle cx="18" cy="9" r="1" />
      <circle cx="18" cy="15" r="1" />
    </>
  ),
  map: (
    <>
      <polygon points="3,6 9,4 15,6 21,4 21,18 15,20 9,18 3,20" />
      <line x1="9" y1="4" x2="9" y2="18" />
      <line x1="15" y1="6" x2="15" y2="20" />
    </>
  ),
  skills: <polygon points="12,2 15,9 22,9.5 16.5,14 18.5,21 12,17 5.5,21 7.5,14 2,9.5 9,9" />,
  'end-turn': (
    <>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12,7 12,12 15,14" />
    </>
  ),
  attack: (
    <>
      <line x1="4" y1="4" x2="14" y2="14" />
      <line x1="20" y1="4" x2="10" y2="14" />
      <line x1="3" y1="21" x2="8" y2="16" />
      <line x1="21" y1="21" x2="16" y2="16" />
    </>
  ),
  aim: (
    <>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="1" />
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
    </>
  ),
  use: (
    <>
      <path d="M9 11V5a2 2 0 0 1 4 0v6" />
      <path d="M13 9a2 2 0 0 1 4 0v4a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-3l-2-4a2 2 0 0 1 3-2l2 2" />
    </>
  ),
  look: (
    <>
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  talk: <path d="M21 12a8 8 0 0 1-12 7l-5 2 2-5a8 8 0 1 1 15-4z" />,
  steal: (
    <>
      <path d="M9 11V5a2 2 0 0 1 4 0v6" />
      <path d="M13 9a2 2 0 0 1 4 0v4a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-3" />
      <line x1="3" y1="4" x2="7" y2="8" />
    </>
  ),
  drop: (
    <>
      <line x1="12" y1="3" x2="12" y2="15" />
      <polyline points="7,10 12,15 17,10" />
      <line x1="4" y1="20" x2="20" y2="20" />
    </>
  ),
  equip: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
    </>
  ),
  save: (
    <>
      <path d="M5 3h12l3 3v15H5z" />
      <rect x="8" y="3" width="8" height="5" />
      <rect x="8" y="13" width="8" height="8" />
    </>
  ),
  load: (
    <>
      <line x1="12" y1="15" x2="12" y2="3" />
      <polyline points="7,8 12,3 17,8" />
      <path d="M4 15v5h16v-5" />
    </>
  ),
  close: (
    <>
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </>
  ),
  back: (
    <>
      <polyline points="12,5 5,12 12,19" />
      <line x1="5" y1="12" x2="20" y2="12" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="11" x2="12" y2="17" />
      <circle cx="12" cy="7.5" r="0.6" />
    </>
  ),
  plus: (
    <>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </>
  ),
  minus: <line x1="5" y1="12" x2="19" y2="12" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16" y2="16" />
    </>
  ),
  sort: (
    <>
      <polyline points="8,8 12,4 16,8" />
      <polyline points="8,16 12,20 16,16" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </>
  ),
};

export function Icon({ name, size = 24 }: { name: IconName; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
      class="f2-icon"
    >
      {iconMap[name]}
    </svg>
  );
}
