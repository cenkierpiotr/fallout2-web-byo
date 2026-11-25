export { LipFormatError, parseLip } from './speech/lip.js';
export type { LipData, LipMarker } from './speech/lip.js';
export { LipSync, PHONEME_TO_FRAME } from './speech/LipSync.js';
export { SpeechError, SpeechPlayer } from './speech/SpeechPlayer.js';
export type {
  AcmDecoder,
  SayOptions,
  SchedulerOptions,
  SpeechHandle,
  SpeechVfs,
} from './speech/SpeechPlayer.js';
export { Mixer } from './mixer/Mixer.js';
export type { MixChannel } from './mixer/Mixer.js';
export { AcmFormatError, ACM_HEADER_SIZE, ACM_SIGNATURE, parseAcmHeader } from './acm/header.js';
export type { AcmHeader } from './acm/header.js';
export { AcmStreamDecoder, decodeAcm } from './acm/decoder.js';
export type { AcmPcm } from './acm/decoder.js';
export { AcmWorkerClient } from './acm/worker-client.js';
export type { AcmStreamHandle, WorkerLike } from './acm/worker-client.js';
export { MusicPlayer } from './music/MusicPlayer.js';
export type {
  MusicAcm,
  MusicCtx,
  MusicDeps,
  MusicNodeLike,
  MusicVfs,
  PlayOptions,
} from './music/MusicPlayer.js';
export { resampleLinear } from './worklet/resample.js';
export { RingResampler } from './worklet/acm-stream-processor.js';
export {
  DialogCueCatalog,
  HEAD_ANIM,
  MOUTH_FRAMES,
  buildDialogCueCatalog,
  headFrmPath,
  parseHeadsLst,
} from './speech/dialog-cue.js';
export type {
  DialogCueEntry,
  DialogCueInput,
  HeadKind,
  HeadMood,
  HeadsLstEntry,
  MsgLine,
} from './speech/dialog-cue.js';
export { SfxPlayer } from './sfx/SfxPlayer.js';
export type { SfxHandle } from './sfx/SfxPlayer.js';
export {
  ambientSfxName,
  animLetters,
  buttonSfxName,
  charSfxName,
  containerSfxName,
  doorSfxName,
  interfaceSfxName,
  materialSfxChar,
  parseAmbientSfx,
  parseSndList,
  pickAmbient,
  resolveCharSfxCandidates,
  sceneryDoorName,
  scenerySfxName,
  sfxPath,
  weaponSfxName,
} from './sfx/names.js';
export type { AmbientSfx, SndListEntry, WeaponSfxInput } from './sfx/names.js';
