export {
  MsgLoader,
  MsgTable,
  parseMsgEntries,
  resolveGameTextLanguage,
} from './text/msg-loader.js';
export type { GameTextLanguage, MsgEntry, MsgLoaderOptions, MsgSource } from './text/msg-loader.js';
export { CritterStatsModel } from './critter-stats.js';
export type { CritterRecord, CritterStatsOptions } from './critter-stats.js';
export { GameClock, formatGameDate } from './game-clock.js';
export type { GameDate } from './game-clock.js';
export { EventQueue } from './event-queue.js';
export { plantExplosive, handleExplosiveEvent } from './explosives.js';
export type { PlantExplosiveInput, PlantResult } from './explosives.js';
export type { EventHandler, GameEvent, GameEventJSON, GameEventKind } from './event-queue.js';
export {
  handleMidnight,
  midnightDelay,
  pendingRadiationLevel,
  scheduleMidnight,
  clearDailyObjectBits,
  DAILY_OBJECT_BIT,
  MIDNIGHT_DAY_THRESHOLDS,
  DAY_THRESHOLD_MSG,
  applyDayThresholds,
} from './midnight.js';
export type { MidnightHooks, DayThresholdIO } from './midnight.js';
export { rest } from './rest.js';
export type { RestMode, RestResult, RestWorld } from './rest.js';
export { BarterSession } from './barter-session.js';
export type {
  BarterItem,
  BarterParams,
  BarterRules,
  BarterSide,
  BarterTotals,
  BarterAcceptResult,
} from './barter-session.js';
export * from './save/schema.js';
export { serializeWorld, deserializeWorld } from './save/serialize.js';
export { migrate } from './save/migrations.js';
export { SaveStore, MemorySaveBackend, IndexedDbSaveBackend } from './save/save-store.js';
export type { SaveBackend } from './save/save-store.js';
export { exportSave, importSave, exportFileName } from './save/export.js';
export {
  MemoryKv,
  IndexedDbKv,
  NamespacedSaveBackend,
  namespaceOf,
  LEGACY_PROFILE_ID,
} from './save/namespaced-backend.js';
export type { KvBackend, NamespacedOptions } from './save/namespaced-backend.js';
export { defaultSha256 } from './save/sync.js';
export type {
  SyncMeta,
  SyncKind,
  SyncChange,
  SyncPullResult,
  SyncPushResult,
  RemoteSaveBackend,
  Sha256,
} from './save/sync.js';
export {
  ProfileStore,
  ProfileError,
  PROFILE_COLORS,
  MAX_PROFILE_NAME,
  validPin,
} from './profile/profile-store.js';
export type {
  Profile,
  ProfileSummary,
  ProfileSettings,
  ProfileErrorCode,
  ActivateResult,
  ProfileStoreDeps,
} from './profile/profile-store.js';
export {
  exportProfile,
  importProfile,
  profileFileName,
  PROFILE_MAGIC,
} from './profile/profile-export.js';
export type { ProfileImportResult } from './profile/profile-export.js';
export { exportAllSaves, importBackup, backupFileName, BACKUP_MAGIC } from './save/backup.js';
export type { BackupImportResult } from './save/backup.js';
export { EventQueueEffectPort, rebindEffectPort } from './timed-effects-adapter.js';
export type { TimedEffectData, TimedEffectDataInput } from './timed-effects-adapter.js';
export { SaveCommands, AutosaveTimer } from './save/autosave.js';
export type {
  AutosavePolicy,
  AutosaveState,
  SaveCommandsDeps,
  SaveFailReason,
  SaveResult,
} from './save/autosave.js';
export { MapRegistry } from './map-registry.js';
export { ageMapState, elapsedHours, isDailyReset } from './map-aging.js';
export { captureLiveMapState, restoreLiveObjects, applySavedLocals } from './map-state.js';
export type { CaptureEnv, TimerRecord, ScriptLocalsEntry } from './map-state.js';
export {
  transitionTo,
  handleMapUpdate,
  TICKS_PER_HOUR,
  MAP_UPDATE_INTERVAL,
} from './map-transition.js';
export * from './elevators.js';
export type {
  MapHook,
  MapRuntime,
  TransitionCtx,
  TransitionResult,
  TransitionTarget,
  TransitionWorld,
} from './map-transition.js';
export * from './hexgrid.js';
export * from './message-source.js';
export * from './game-object.js';
export * from './game-map.js';
export * from './exit-grid.js';
export * from './proto-cache.js';
export * from './map-loader.js';
export * from './rules.js';
export * from './doors.js';
export * from './pathfinding.js';
export * from './movement.js';
export * from './game-view.js';
export * from './game-commands.js';
export { loadPresets, PRESET_TABLE } from './presets.js';
export type { Preset } from './presets.js';
export { GlobalVars } from './quests/global-vars.js';
export type { GlobalVarsJSON, GvarListener } from './quests/global-vars.js';
export { QuestLog } from './quests/quest-log.js';
export type { QuestLogView } from './quests/quest-log.js';
export { PartyState } from './party/party-state.js';
export type { PartyStateJSON } from './party/party-state.js';
export { PartyScriptAdapter } from './party/party-script-port.js';
export type { PartyScriptPort, PartyAddResponse } from './party/party-script-port.js';
export { parseGam as parseGamText } from './endgame/gam-loader.js';
export type { GamResult } from './endgame/gam-loader.js';
export { GvarRegistry } from './endgame/gvar-registry.js';
export type { GvarReader } from './endgame/gvar-registry.js';
export { selectEndgameSlides } from './endgame/select-slides.js';
export { selectDeath, MODOC_GVAR, MODOC_ROW_INDEX } from './endgame/select-death.js';
export type { DeathContext } from './endgame/select-death.js';
export { EndgameFlow, cleanNarration, DEATH_ART } from './flow/endgame-flow.js';
export type {
  EndgameDeps,
  EndgameScreenId,
  EndgameSlideView,
  EndgameViewState,
  SpeechResult,
} from './flow/endgame-flow.js';
export * from './game-vars.js';
export * from './floating-text.js';
export * from './script-runtime.js';
export * from './rng.js';
export * from './inventory-model.js';
export * from './rules-skills.js';
export * from './skill-actions.js';
export {
  Anim,
  ANIM_MAX,
  WEAPON_CODE_MAX,
  DEFAULT_FPS,
  animFileChars,
  isDeathAnim,
  isLoopingAnim,
  ClipPlayer,
  AnimDirector,
} from './critter-anim.js';
export type { AnimClipInfo, AnimStep, AnimView } from './critter-anim.js';
export { HEX_PIXEL_DELTA, walkStepReached, walkStepRemainder } from './walk-step.js';
export { critterKill } from './critter-model.js';
export { SfallBinding } from './sfall-binding.js';
export type { SfallBindingOptions } from './sfall-binding.js';
export {
  CarState,
  CAR_FUEL_MAX,
  FUEL_CELL_UNITS,
  FUEL_CELL_PID,
  TRUNK_CAPACITY,
} from './worldmap/car.js';
export type { CarStateJSON, CarOptions, TrunkItem } from './worldmap/car.js';
