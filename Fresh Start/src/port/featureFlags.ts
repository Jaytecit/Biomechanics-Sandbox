/**
 * Feature flags for checklist-gated ports.
 * Enabled for currently marked checklist IDs.
 */
export const featureFlags = {
  /** A1.2 / A4 — googly eyes */
  googlyEyes: true,
  /** A2 — sprite body-part library */
  spriteBodyParts: true,
  /** A5 — render lerp / velocity extrapolate between fixed physics ticks */
  visualPoseInterpolation: true,
  /** A6 — sim axis rulers */
  simAxisRulers: true,
  /** A7 — MLP network visualizer */
  networkVisualizer: true,
  /** A10 — skeleton vs cosmetics render modes */
  cosmeticsRenderModes: false,

  /** B1 — zone tabs */
  zoneTabs: true,
  /** B3 — sandbox menu shell (left tabs + sim bottom dock) */
  sandboxMenuShell: true,
  /** B6 — stats panel */
  statsPanel: true,
  /** B7 — control panel (D1 train/observe speeds) */
  controlPanel: true,
  /** B9 — performance diagnostics */
  performanceDiagnostics: true,
  /** B11 — discovery / trophies UI */
  discoveryUi: true,
  /** B13 — creature library panel */
  creatureLibrary: true,
  /** B16 — immersive fullscreen */
  immersiveFullscreen: true,

  /** C1.11 — marquee multi-select + copy / mirror / scale / rotate */
  editorMultiSelectTransforms: true,
  /** C4 — share codes */
  shareCodes: false,
  /** C5 — JSON import/export */
  jsonImportExport: true,

  /** D2 — elite replay */
  eliteReplay: false,
  /** D4 — best-ever ledger */
  bestEverLedger: true,
  /** D5 — saved models / continue training */
  savedModels: true,
  /** D9 — Train dock IA + plain labels */
  trainDockIa: true,
  /** D10 — population / batch / mutation recipes */
  trainRecipes: true,
  /** D11 — start-from + selection advanced */
  trainStartFrom: true,
  /** D12 — annealing / adaptive try / crossover */
  trainSchedules: true,
  /** D13 — goal priorities + stage trainer */
  goalPriorities: true,
  /** D13 deepen — progressive course windows (Gauntlet spawn/finish stages) */
  courseCurriculum: true,
  /** D14 — new experiences (demo teachers, rival ghost, mix goals, messy bodies) */
  trainExperiences: true,
  /** D15 — shareable recipes / experiment packs */
  experimentPacks: true,
  /** D16 — training telemetry log (gen-champion capture + insights) */
  trainTelemetryLog: true,
  /** D17 — soft morphology evolution (fixed topology morph genes) */
  morphEvolve: true,

  /** E1 — goal catalog framework */
  goalCatalog: true,
  /** E5 — secret goal system */
  secretGoals: true,
  /** E6 task families */
  taskJump: true,
  taskClimb: true,
  taskMotor: true,
  taskFlight: true,
  taskRoughTerrain: true,
  taskSprint: true,
  taskSpeed: true,
  taskStay: true,
  taskHang: true,
  taskLongJump: true,

  /** F1 — creature packages repository */
  creaturePackages: true,
  /** F2 — finished models shelf */
  finishedModels: false,
  /** F3 — bundled models */
  bundledModels: true,
  /** F4 — environments repository */
  environmentsRepo: true,

  /** G1 climb course (minimal for E6.3) */
  climbCourse: true,
  /** G1 — static obstacles (C2.1 authored set) */
  staticObstacles: true,
  /** G3 — terrain heightfield (C2.3 authored) */
  terrainHeightfield: true,
  /** E6.8 — task-owned rough terrain course (reuses G3 heightfield) */
  roughTerrainCourse: true,
  /** C2.4 — launch tower */
  launchTower: true,
  /** C2.9 — score regions (penalty / reward AABBs, time-in-zone) */
  scoreRegions: true,
  /** C2.10 — start / finish / checkpoint course markers (score-only) */
  courseMarkers: true,
  /** G4 — world objects ball/box/hoop (Rapier) */
  worldObjects: false,
  /** G6 — wheels / motor wheels (Rapier) — unlocked by E6.5 */
  motorWheels: true,
  /** G7 — joint angular limits (Rapier) */
  jointAngularLimits: false,
  /** G9 — aero-like forces (Rapier) — unlocked by E6.6 */
  aeroLikeForces: true,
  /** G10 — structural aero part types (wing / glider / parachute) */
  structuralAeroParts: true,

  /** H1/H2 — disco mode + audio */
  discoMode: true,
  /** H5 — multi-dancer disco (up to 6 models) */
  multiDisco: true,
  /** H6 — disco dance imitation / freestyle brain */
  discoDanceLearn: true,
  /** H7 — multi-track dance curriculum (playlist, offline analysis, refine) */
  discoDanceCurriculum: true,
  /** H8 — named Disco stage setup save/load */
  discoSetups: true,

  /** I1 — arena championship shell */
  arenaChampionship: false,
  /** I6 / B20 — Head-to-Head gauntlet (two models) */
  headToHead: true,
} as const;

export type FeatureFlag = keyof typeof featureFlags;

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return featureFlags[flag];
}
