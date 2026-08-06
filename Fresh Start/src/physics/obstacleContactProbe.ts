/**
 * D16 stall diagnostics — Rapier foot↔world contact probe (telemetry only).
 * Does not feed observations or fitness.
 */
import { sampleTerrainHeight } from '../env/terrainMath';
import type { EnvTerrain, ObstacleKind } from '../env/types';
import type { ObstacleHandle, ObstacleVisual } from './obstacles';
import type { SpawnedCreature } from './spawn';
import { RAPIER } from './world';

function avgJointX(creature: SpawnedCreature): number {
  let s = 0;
  for (const j of creature.joints) s += j.body.translation().x;
  return s / Math.max(1, creature.joints.length);
}

function minJointY(creature: SpawnedCreature): number {
  let m = Infinity;
  for (const j of creature.joints) m = Math.min(m, j.body.translation().y);
  return Number.isFinite(m) ? m : 0;
}

/** Minimum forward progress (m) to count as a new peak. */
const STALL_PROGRESS_EPS = 0.05;

export interface SurfaceContact {
  surface: 'ground' | 'obstacle';
  kind?: ObstacleKind;
  /** Obstacle center (world). */
  x?: number;
  y?: number;
  hx?: number;
  hy?: number;
  /** Cuboid rotation (rad). */
  rot?: number;
  /** Surface tilt in degrees (from rot). */
  angleDeg?: number;
  /** Foot joint ids in contact with this surface. */
  footIds: number[];
  /**
   * Mean contact normal Y in world-ish terms (higher ≈ more floor-like support).
   * Null when manifold data unavailable.
   */
  supportNormalY: number | null;
}

export interface StallPoseSample {
  episodeT: number;
  distance: number;
  stalledFor: number;
  comX: number;
  comY: number;
  minJointY: number;
  minFootY: number;
  meanFootY: number;
  /** Clearance vs terrain heightfield / flat ground (not obstacle tops). */
  meanFootClearanceTerrain: number;
  feetPlantedProxy: number;
  feetTouching: number;
  feetOnGround: number;
  feetOnObstacle: number;
  /** Mean |vx| of feet that have a Rapier contact. */
  meanContactSlipSpeed: number;
  contacts: SurfaceContact[];
  primarySurface: SurfaceContact | null;
}

export interface StallDiagnostics {
  peakDistance: number;
  peakDistanceT: number;
  atLastProgress: StallPoseSample | null;
  atEpisodeEnd: StallPoseSample | null;
  /** Short human cause string for logs / insights. */
  summaryCause: string;
}

export interface StallTracker {
  peakDistance: number;
  peakDistanceT: number;
  atLastProgress: StallPoseSample | null;
}

export function createStallTracker(): StallTracker {
  return { peakDistance: 0, peakDistanceT: 0, atLastProgress: null };
}

function round(n: number, d = 3): number {
  const p = 10 ** d;
  return Math.round(n * p) / p;
}

function footJoints(creature: SpawnedCreature) {
  const marked = creature.joints.filter((j) => j.isFoot && !j.isWheel);
  return marked.length > 0 ? marked : creature.joints.filter((j) => !j.isWheel);
}

function bodyIndexMap(obstacles: ObstacleHandle | null): Map<number, number> {
  const map = new Map<number, number>();
  if (!obstacles) return map;
  for (let i = 0; i < obstacles.bodies.length; i++) {
    map.set(obstacles.bodies[i]!.handle, i);
  }
  return map;
}

function supportNormalY(
  world: RAPIER.World,
  footCollider: RAPIER.Collider,
  other: RAPIER.Collider,
): number | null {
  let best: number | null = null;
  world.contactPair(footCollider, other, (manifold, flipped) => {
    if (manifold.numContacts() <= 0) return;
    const n = flipped ? manifold.localNormal2() : manifold.localNormal1();
    // Prefer the normal with larger |y| as the support direction hint.
    const ny = Math.abs(n.y);
    if (best == null || ny > Math.abs(best)) best = n.y;
  });
  return best;
}

function probeContacts(
  world: RAPIER.World,
  creature: SpawnedCreature,
  obstacles: ObstacleHandle | null,
): {
  contacts: SurfaceContact[];
  feetTouching: number;
  feetOnGround: number;
  feetOnObstacle: number;
  meanContactSlipSpeed: number;
} {
  const feet = footJoints(creature);
  const idxMap = bodyIndexMap(obstacles);
  const byKey = new Map<string, SurfaceContact>();
  let feetTouching = 0;
  let feetOnGround = 0;
  let feetOnObstacle = 0;
  let slipSum = 0;
  let slipN = 0;

  for (const foot of feet) {
    let touched = false;
    let onGround = false;
    let onObs = false;
    for (let ci = 0; ci < foot.body.numColliders(); ci++) {
      const col = foot.body.collider(ci);
      world.contactPairsWith(col, (other) => {
        const parent = other.parent();
        if (!parent) return;
        const obsIdx = idxMap.get(parent.handle);
        const ny = supportNormalY(world, col, other);
        if (obsIdx == null || !obstacles) {
          const key = 'ground';
          let entry = byKey.get(key);
          if (!entry) {
            entry = {
              surface: 'ground',
              footIds: [],
              supportNormalY: ny,
            };
            byKey.set(key, entry);
          }
          if (!entry.footIds.includes(foot.id)) entry.footIds.push(foot.id);
          if (ny != null) {
            entry.supportNormalY =
              entry.supportNormalY == null
                ? ny
                : (entry.supportNormalY + ny) / 2;
          }
          onGround = true;
          touched = true;
          return;
        }
        const vis: ObstacleVisual = obstacles.visuals[obsIdx]!;
        const key = `obs:${obsIdx}:${vis.kind}`;
        let entry = byKey.get(key);
        if (!entry) {
          entry = {
            surface: 'obstacle',
            kind: vis.kind,
            x: round(vis.x),
            y: round(vis.y),
            hx: round(vis.hx),
            hy: round(vis.hy),
            rot: round(vis.rot, 4),
            angleDeg: round((vis.rot * 180) / Math.PI, 1),
            footIds: [],
            supportNormalY: ny,
          };
          byKey.set(key, entry);
        }
        if (!entry.footIds.includes(foot.id)) entry.footIds.push(foot.id);
        if (ny != null) {
          entry.supportNormalY =
            entry.supportNormalY == null
              ? ny
              : (entry.supportNormalY + ny) / 2;
        }
        onObs = true;
        touched = true;
      });
    }
    if (touched) {
      feetTouching += 1;
      const v = foot.body.linvel();
      slipSum += Math.abs(v.x);
      slipN += 1;
    }
    if (onGround) feetOnGround += 1;
    if (onObs) feetOnObstacle += 1;
  }

  return {
    contacts: [...byKey.values()],
    feetTouching,
    feetOnGround,
    feetOnObstacle,
    meanContactSlipSpeed: slipN > 0 ? slipSum / slipN : 0,
  };
}

function pickPrimary(contacts: SurfaceContact[]): SurfaceContact | null {
  if (contacts.length === 0) return null;
  const ramp = contacts.find((c) => c.kind === 'ramp');
  if (ramp) return ramp;
  const stair = contacts.find((c) => c.kind === 'stair');
  if (stair) return stair;
  const box = contacts.find((c) => c.kind === 'box');
  if (box) return box;
  const obs = contacts.find((c) => c.surface === 'obstacle');
  if (obs) return obs;
  return contacts[0] ?? null;
}

export function sampleStallPose(
  world: RAPIER.World,
  creature: SpawnedCreature,
  obstacles: ObstacleHandle | null,
  opts: {
    episodeT: number;
    startX: number;
    distance: number;
    peakDistanceT: number;
    terrain?: EnvTerrain | null;
  },
): StallPoseSample {
  const feet = footJoints(creature);
  let footYSum = 0;
  let clearSum = 0;
  let plantedProxy = 0;
  let minFootY = Infinity;
  for (const f of feet) {
    const t = f.body.translation();
    footYSum += t.y;
    minFootY = Math.min(minFootY, t.y);
    const surface = sampleTerrainHeight(opts.terrain, t.x);
    const clear = t.y - surface;
    clearSum += clear;
    if (clear < 0.42) plantedProxy += 1;
  }
  const n = Math.max(1, feet.length);
  const probed = probeContacts(world, creature, obstacles);
  const primary = pickPrimary(probed.contacts);

  let comY = 0;
  for (const j of creature.joints) comY += j.body.translation().y;
  comY /= Math.max(1, creature.joints.length);

  return {
    episodeT: round(opts.episodeT, 2),
    distance: round(opts.distance, 3),
    stalledFor: round(Math.max(0, opts.episodeT - opts.peakDistanceT), 2),
    comX: round(avgJointX(creature), 3),
    comY: round(comY, 3),
    minJointY: round(minJointY(creature), 3),
    minFootY: round(Number.isFinite(minFootY) ? minFootY : 0, 3),
    meanFootY: round(footYSum / n, 3),
    meanFootClearanceTerrain: round(clearSum / n, 3),
    feetPlantedProxy: plantedProxy,
    feetTouching: probed.feetTouching,
    feetOnGround: probed.feetOnGround,
    feetOnObstacle: probed.feetOnObstacle,
    meanContactSlipSpeed: round(probed.meanContactSlipSpeed, 3),
    contacts: probed.contacts,
    primarySurface: primary,
  };
}

export function describeStallCause(d: StallDiagnostics): string {
  const end = d.atEpisodeEnd ?? d.atLastProgress;
  const peak = d.atLastProgress;
  if (!end) return 'No stall sample captured.';

  const primary = end.primarySurface;
  const dist = end.distance;
  const slip = end.meanContactSlipSpeed;

  if (end.feetTouching === 0) {
    return `Airborne at stall (dist ${dist.toFixed(2)} m, COM y ${end.comY.toFixed(2)}, minFootY ${end.minFootY.toFixed(2)}, stalled ${end.stalledFor.toFixed(1)}s) — no Rapier foot contacts.`;
  }

  if (primary?.kind === 'ramp') {
    const ang = primary.angleDeg ?? 0;
    const slipNote =
      slip > 1.5 ? `high slip |vx|=${slip.toFixed(2)}` : `slip |vx|=${slip.toFixed(2)}`;
    const proxy =
      end.meanFootClearanceTerrain > 0.6 && end.feetOnObstacle > 0
        ? '; terrain-proxy clearance high while on ramp (plant/obs blind to obstacle tops)'
        : '';
    return `On ramp at stall (angle ${ang.toFixed(1)}°, center (${primary.x}, ${primary.y}), feetOnRamp ${primary.footIds.length}, ${slipNote}, footY ${end.meanFootY.toFixed(2)}, dist ${dist.toFixed(2)} m)${proxy}.`;
  }

  if (primary?.kind === 'stair') {
    return `On stairs at stall (center (${primary.x}, ${primary.y}), feet ${primary.footIds.length}, dist ${dist.toFixed(2)} m).`;
  }

  if (primary?.kind === 'box') {
    return `Blocked / contacting box at stall (center (${primary.x}, ${primary.y}), size ${primary.hx}×${primary.hy}, dist ${dist.toFixed(2)} m).`;
  }

  if (primary?.surface === 'obstacle') {
    return `Contacting ${primary.kind ?? 'obstacle'} at stall (dist ${dist.toFixed(2)} m, footY ${end.meanFootY.toFixed(2)}).`;
  }

  // Ground only
  if (peak && peak.distance < 20 && end.feetOnObstacle === 0) {
    return `Never reached first obstacles — stalled on ground (dist ${dist.toFixed(2)} m, plantedProxy ${end.feetPlantedProxy}, slip |vx|=${slip.toFixed(2)}).`;
  }

  return `Ground contact at stall (dist ${dist.toFixed(2)} m, footY ${end.meanFootY.toFixed(2)}, clearance ${end.meanFootClearanceTerrain.toFixed(2)}, slip |vx|=${slip.toFixed(2)}, stalled ${end.stalledFor.toFixed(1)}s).`;
}

/**
 * Call when forward distance may have increased. Refreshes last-progress sample.
 */
export function noteStallProgress(
  tracker: StallTracker,
  world: RAPIER.World,
  creature: SpawnedCreature,
  obstacles: ObstacleHandle | null,
  opts: {
    episodeT: number;
    startX: number;
    distance: number;
    terrain?: EnvTerrain | null;
  },
): void {
  if (opts.distance <= tracker.peakDistance + STALL_PROGRESS_EPS) return;
  tracker.peakDistance = opts.distance;
  tracker.peakDistanceT = opts.episodeT;
  tracker.atLastProgress = sampleStallPose(world, creature, obstacles, {
    episodeT: opts.episodeT,
    startX: opts.startX,
    distance: opts.distance,
    peakDistanceT: opts.episodeT,
    terrain: opts.terrain,
  });
}

export function finalizeStallDiagnostics(
  tracker: StallTracker,
  world: RAPIER.World,
  creature: SpawnedCreature,
  obstacles: ObstacleHandle | null,
  opts: {
    episodeT: number;
    startX: number;
    distance: number;
    terrain?: EnvTerrain | null;
  },
): StallDiagnostics {
  const atEpisodeEnd = sampleStallPose(world, creature, obstacles, {
    episodeT: opts.episodeT,
    startX: opts.startX,
    distance: opts.distance,
    peakDistanceT: tracker.peakDistanceT,
    terrain: opts.terrain,
  });
  const d: StallDiagnostics = {
    peakDistance: round(tracker.peakDistance, 3),
    peakDistanceT: round(tracker.peakDistanceT, 2),
    atLastProgress: tracker.atLastProgress,
    atEpisodeEnd,
    summaryCause: '',
  };
  d.summaryCause = describeStallCause(d);
  return d;
}
