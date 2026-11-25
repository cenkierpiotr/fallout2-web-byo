export * from './profile.js';
export * from './gestures.js';
// Alias zgodny z m2 (Preview.tsx): ten sam rozpoznawacz pan/tap co GestureRecognizer z gestures.ts.
export { GestureRecognizer as PanTapRecognizer } from './gestures.js';
export {
  detectInputProfile as detectProfileFromEnv,
  detectProfile,
  readProfileEnv,
  resolveProfile,
  toUiProfile,
  TOUCH_MAX_WIDTH,
  type DetectProfileEnv,
  type ProfileEnv,
  type ProfileName,
  type ProfileSetting,
} from './input-profile.js';
export * from './action-bus.js';
export {
  GestureRecognizer as PointerGestureRecognizer,
  DEFAULT_GESTURE_OPTIONS,
  type Gesture,
  type GestureKind,
  type GestureOptions,
  type PointerEv,
} from './gesture-recognizer.js';
export * from './keyboard-map.js';
export * from './pointer-manager.js';
