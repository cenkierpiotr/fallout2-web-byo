export type InputProfile = 'desktop' | 'touch' | 'hybrid';

export interface InputEnv {
  coarse: boolean;
  hover: boolean;
  maxTouchPoints: number;
  width: number;
}

export function detectInputProfile(env: InputEnv): InputProfile {
  if (env.coarse && !env.hover) return 'touch';
  if (!env.coarse && env.maxTouchPoints > 0) return 'hybrid';
  return 'desktop';
}

export function readInputEnv(win: Window): InputEnv {
  return {
    coarse: win.matchMedia('(pointer: coarse)').matches,
    hover: win.matchMedia('(hover: hover)').matches,
    maxTouchPoints: win.navigator.maxTouchPoints,
    width: win.innerWidth,
  };
}
