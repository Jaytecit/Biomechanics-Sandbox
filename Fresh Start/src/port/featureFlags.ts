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
  statsPanel: false,
  /** B7 — control panel (D1 train/observe speeds) */
  controlPanel: true,
  /** B9 — performance diagnostics */
  performanceDiagnostics: false,
  /** B11 — discovery / trophies UI */
  discoveryUi: true,
  /** B13 — creature library panel */
  creatureLibrary: true,

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

  /** E1 — goal catalog framework */
  goalCatalog: true,
  /** E5 — secret goal system */
  secretGoals: true,
  /** E6 task families */
  taskJump: true,
  taskClimb: true,
  taskMotor: true,
  taskFlight: true,

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
  /** G1 — static obstacles (full set) */
  staticObstacles: false,
  /** G4 — world objects ball/box/hoop (Rapier) */
  worldObjects: false,
  /** G6 — wheels / motor wheels (Rapier) — unlocked by E6.5 */
  motorWheels: true,
  /** G7 — joint angular limits (Rapier) */
  jointAngularLimits: false,
  /** G9 — aero-like forces (Rapier) — unlocked by E6.6 */
  aeroLikeForces: true,

  /** H1/H2 — disco mode + audio */
  discoMode: true,

  /** I1 — arena championship shell */
  arenaChampionship: false,
} as const;

export type FeatureFlag = keyof typeof featureFlags;

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return featureFlags[flag];
}
