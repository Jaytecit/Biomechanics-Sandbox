/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Aerodynamics for soft-body muscles marked as wing / paraglider / parachute.
 * Forces come only from relative air motion through a surface — never from
 * a speed-threshold “float” applied to the whole body.
 *
 * Shared rules (same spirit as the parachute cup):
 * - Lift/drag from freestream dynamic pressure × projected area
 * - Edge-on / no forward airspeed → skin drag only (no hover)
 * - Forces act on the surface nodes so attitude matters (no crooked whole-body shove)
 * - Airspeed uses pre-constraint Verlet samples (`aeroVx`/`aeroVy`) when present
 *   so muscle/contact projection cannot invent freestream (F01 / D074). Geometry
 *   (plate normal, pitch) still uses current node positions. Timestep is dt ≡ 1.
 *
 * Wings: flat-plate pressure on the downstroke only (per wing); upstroke/hold = drag only.
 *   Matched L/R pair strokes get the strongest lift (bird-like); solo strokes steer weaker.
 * Paragliders: cambered sail; pitch (leading tip up/down) sets climb/sink AoA;
 *   needs forward air under an open canopy.
 * Parachutes: one-sided cup string; inflates into the wind, collapses edge-on.
 */

import { Creature, PhysicsMuscle, PhysicsNode, effectiveAeroArea } from './types';

const MAX_WING_FORCE = 3.6;
const MAX_PARA_FORCE = 5.2;
const MAX_CHUTE_FORCE = 6.5;

/**
 * Node air velocity in px/frame (PHYSICS_DT ≡ 1).
 * Prefers the pre-constraint sample; falls back to (x−oldX) for unit tests
 * that call aero helpers without running `updateCreaturePhysics`.
 */
function nodeAirVelocity(node: PhysicsNode) {
  if (typeof node.aeroVx === 'number' && typeof node.aeroVy === 'number') {
    return { vx: node.aeroVx, vy: node.aeroVy };
  }
  return { vx: node.x - node.oldX, vy: node.y - node.oldY };
}

/** Midpoint air velocity of a muscle segment (pre-constraint when sampled). */
function segmentVelocity(a: PhysicsNode, b: PhysicsNode) {
  const va = nodeAirVelocity(a);
  const vb = nodeAirVelocity(b);
  return {
    vx: (va.vx + vb.vx) * 0.5,
    vy: (va.vy + vb.vy) * 0.5,
  };
}

/**
 * Unit tangent along the muscle and a unit normal.
 * If `undersideDown` is set, the normal faces +Y (ground) when the canopy is level.
 */
function segmentFrame(a: PhysicsNode, b: PhysicsNode, undersideDown: boolean) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 0.001;
  const tx = dx / len;
  const ty = dy / len;
  let nx = -ty;
  let ny = tx;
  if (undersideDown && ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  return { tx, ty, nx, ny, len };
}

function applySegmentImpulse(
  a: PhysicsNode,
  b: PhysicsNode,
  fx: number,
  fy: number,
  maxForce: number
) {
  if (!Number.isFinite(fx) || !Number.isFinite(fy) || !Number.isFinite(maxForce)) return;
  let mag = Math.hypot(fx, fy);
  if (mag < 1e-8 || !Number.isFinite(mag)) return;
  if (mag > maxForce) {
    fx = (fx / mag) * maxForce;
    fy = (fy / mag) * maxForce;
  }
  const invA = 1 / Math.max(0.35, a.mass);
  const invB = 1 / Math.max(0.35, b.mass);
  const invSum = invA + invB;
  const ax = (fx * invA) / invSum;
  const ay = (fy * invA) / invSum;
  const bx = (fx * invB) / invSum;
  const by = (fy * invB) / invSum;
  if (![ax, ay, bx, by].every(Number.isFinite)) return;
  a.x += ax;
  a.y += ay;
  b.x += bx;
  b.y += by;
}

/**
 * Paraglider load: majority on canopy endpoints (creates aerodynamic torque / F02),
 * remainder shared equally across chassis so light tips do not absorb 100% Δ.
 * Isolated sail smokes (no chassis) apply 100% on the canopy. Endpoint split is
 * equal — not inv-mass — so ultra-light tips cannot explode under the same impulse.
 */
function applyParaCanopyLoad(
  a: PhysicsNode,
  b: PhysicsNode,
  allNodes: PhysicsNode[],
  fx: number,
  fy: number,
  maxForce: number,
  canopyShare = 0.55
) {
  if (!Number.isFinite(fx) || !Number.isFinite(fy) || !Number.isFinite(maxForce)) return;
  let mag = Math.hypot(fx, fy);
  if (mag < 1e-8 || !Number.isFinite(mag)) return;
  if (mag > maxForce) {
    fx = (fx / mag) * maxForce;
    fy = (fy / mag) * maxForce;
  }
  const chassis = allNodes.filter(n => n !== a && n !== b);
  const share = chassis.length > 0 ? Math.max(0, Math.min(1, canopyShare)) : 1;
  const cFx = fx * share;
  const cFy = fy * share;
  const halfX = cFx * 0.5;
  const halfY = cFy * 0.5;
  if (!Number.isFinite(halfX) || !Number.isFinite(halfY)) return;
  a.x += halfX;
  a.y += halfY;
  b.x += halfX;
  b.y += halfY;
  if (chassis.length === 0 || share >= 1) return;
  const hFx = fx * (1 - share);
  const hFy = fy * (1 - share);
  const s = 1 / chassis.length;
  const dx = hFx * s;
  const dy = hFy * s;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
  for (const n of chassis) {
    n.x += dx;
    n.y += dy;
  }
}

function bodyFreeStream(creature: Creature) {
  let comVx = 0;
  let comVy = 0;
  let massSum = 0;
  for (const node of creature.nodes) {
    const m = Math.max(0.35, node.mass);
    massSum += m;
    const v = nodeAirVelocity(node);
    comVx += v.vx * m;
    comVy += v.vy * m;
  }
  massSum = Math.max(0.35, massSum);
  comVx /= massSum;
  comVy /= massSum;
  const speed = Math.hypot(comVx, comVy);
  const airborne = !creature.nodes.some(n => n.isGround);
  const weightScale = Math.max(2, creature.nodes.length) * 0.4;
  return { comVx, comVy, speed, airborne, weightScale };
}

/**
 * Leading tip = canopy node more aligned with travel. Pitch tip up (−Y) / down (+Y)
 * relative to the trailing tip sets angle of attack for climb / dive.
 */
function canopyPitchAoA(
  a: PhysicsNode,
  b: PhysicsNode,
  vx: number,
  vy: number
): { aoa: number; leading: PhysicsNode; trailing: PhysicsNode } {
  const speed = Math.hypot(vx, vy) || 1;
  const vhx = vx / speed;
  const vhy = vy / speed;
  const scoreA = a.x * vhx + a.y * vhy;
  const scoreB = b.x * vhx + b.y * vhy;
  const leading = scoreA >= scoreB ? a : b;
  const trailing = scoreA >= scoreB ? b : a;
  let cx = leading.x - trailing.x;
  let cy = leading.y - trailing.y;
  const clen = Math.hypot(cx, cy) || 1;
  cx /= clen;
  cy /= clen;
  // Signed pitch vs freestream: positive = nose up (leading higher / −Y).
  const cross = cx * vhy - cy * vhx;
  const dot = cx * vhx + cy * vhy;
  const aoa = Math.atan2(cross, Math.max(0.05, dot));
  return { aoa, leading, trailing };
}

/** Skyward unit lift axis perpendicular to freestream. */
function liftAxis(vx: number, vy: number) {
  const speed = Math.hypot(vx, vy) || 1;
  const vhx = vx / speed;
  const vhy = vy / speed;
  let lx = -vhy;
  let ly = vhx;
  if (ly > 0) {
    lx = -lx;
    ly = -ly;
  }
  return { vhx, vhy, lx, ly };
}

/**
 * Soft stall blend in [STALL_FLOOR, 1].
 * Replaces the F04 hard cliff (`normalHit < −0.15` → Cl×0.1) with a smooth
 * backside ramp. Mild nose-up near the old threshold loses lift gradually;
 * deep backside still dumps toward the floor. Useful training band (±12 tip)
 * stays attached; tip16 retains a large fraction of tip12 (no cliff).
 */
export function softStallFactor(aoa: number, alpha: number, normalHit: number): number {
  const STALL_FLOOR = 0.28;
  const ramp = (v: number, start: number, full: number) =>
    Math.max(0, Math.min(1, (v - start) / Math.max(1e-6, full - start)));
  const severity = Math.max(
    ramp(Math.abs(aoa), 0.42, 0.95),
    ramp(Math.abs(alpha), 0.55, 1.05),
    // Old cliff was a step at −0.15. Soften across −0.12…−0.22.
    ramp(-normalHit, 0.12, 0.22)
  );
  const t = severity * severity * (3 - 2 * severity);
  return 1 - (1 - STALL_FLOOR) * t;
}

export type ParaClCdSample = {
  aoa: number;
  alpha: number;
  normalHit: number;
  belly: number;
  openness: number;
  Cl: number;
  Cd: number;
  stallFactor: number;
};

/** Shared paraglider Cl/Cd model (Phase 2). Used by force apply + Cl/Cd tables. */
export function evaluateParagliderClCd(opts: {
  aoa: number;
  alpha: number;
  normalHit: number;
  belly: number;
  openness: number;
}): ParaClCdSample {
  const { aoa, alpha, normalHit, belly, openness } = opts;
  let Cl = 0.65 * openness * (0.4 + 0.6 * belly) + 0.55 * alpha + 1.55 * aoa;
  let Cd = 0.03 + 0.2 * alpha * alpha + 0.22 * aoa * aoa;
  const stallFactor = softStallFactor(aoa, alpha, normalHit);
  Cl *= stallFactor;
  if (stallFactor < 0.999) {
    Cd = Math.max(Cd, 0.35 + 0.7 * (1 - stallFactor));
  }
  Cl = Math.max(0, Math.min(1.6, Cl));
  return { aoa, alpha, normalHit, belly, openness, Cl, Cd, stallFactor };
}

/**
 * Sample Cl/Cd vs leading-tip pitch for a fixed horizontal freestream (diagnostic table).
 * tipΔY > 0 ⇒ leading tip higher (−Y) = nose up. Chord defaults match harness Test 5.
 */
export function sampleParagliderClCdTable(
  tipDeltaYs: number[],
  opts?: { chordX?: number; vx?: number; openness?: number }
): Array<ParaClCdSample & { tipDeltaY: number }> {
  const chordX = opts?.chordX ?? 90;
  const vx = opts?.vx ?? 2.6;
  const openness = opts?.openness ?? 1;
  const speed = Math.abs(vx) || 1;
  const vhx = vx / speed;
  const vhy = 0;
  const rows: Array<ParaClCdSample & { tipDeltaY: number }> = [];
  for (const tip of tipDeltaYs) {
    const trail = { x: 0, y: 100 };
    const lead = { x: chordX, y: 100 - tip };
    const dx = lead.x - trail.x;
    const dy = lead.y - trail.y;
    const len = Math.hypot(dx, dy) || 1;
    let nx = -dy / len;
    let ny = dx / len;
    if (ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    const rwX = -vhx;
    const rwY = -vhy;
    const normalHit = rwX * nx + rwY * ny;
    const alpha = Math.asin(Math.max(-1, Math.min(1, normalHit)));
    const belly = Math.max(0, ny);
    const scoreTrail = trail.x * vhx + trail.y * vhy;
    const scoreLead = lead.x * vhx + lead.y * vhy;
    const leading = scoreLead >= scoreTrail ? lead : trail;
    const trailing = scoreLead >= scoreTrail ? trail : lead;
    let cx = leading.x - trailing.x;
    let cy = leading.y - trailing.y;
    const clen = Math.hypot(cx, cy) || 1;
    cx /= clen;
    cy /= clen;
    const aoa = Math.atan2(cx * vhy - cy * vhx, Math.max(0.05, cx * vhx + cy * vhy));
    rows.push({ tipDeltaY: tip, ...evaluateParagliderClCd({ aoa, alpha, normalHit, belly, openness }) });
  }
  return rows;
}

type WingMuscle = PhysicsMuscle & { _prevTarget?: number };

/** Per-wing stroke snapshot used for L/R pair scoring (D143). */
export type WingStrokeState = {
  muscle: WingMuscle;
  a: PhysicsNode;
  b: PhysicsNode;
  tip: PhysicsNode;
  side: number;
  cmdDelta: number;
  strokeVy: number;
  flapping: boolean;
  downstroke: boolean;
  strokeAuthority: number;
};

/**
 * Bird-like pair score in [0, 1]: both wings on a power stroke with matched
 * authority, matched command, and roughly level tips. Zero when only one side
 * strokes (steering / tumble) or when the pair is recovering.
 */
export function wingPairBirdScore(left: WingStrokeState, right: WingStrokeState): number {
  if (!left.downstroke || !right.downstroke) return 0;
  if (!left.flapping && !right.flapping && left.strokeVy < 0.12 && right.strokeVy < 0.12) {
    return 0;
  }
  const meanAuth = 0.5 * (left.strokeAuthority + right.strokeAuthority);
  const authMatch =
    1 - Math.min(1, Math.abs(left.strokeAuthority - right.strokeAuthority) / Math.max(0.35, meanAuth));
  const meanCmd = 0.5 * (Math.abs(left.cmdDelta) + Math.abs(right.cmdDelta));
  const cmdMatch =
    meanCmd < 0.08
      ? 0.65
      : 1 - Math.min(1, Math.abs(left.cmdDelta - right.cmdDelta) / Math.max(0.2, meanCmd));
  const tipLevel = 1 - Math.min(1, Math.abs(left.tip.y - right.tip.y) / 45);
  return Math.max(0, Math.min(1, 0.5 * authMatch + 0.28 * cmdMatch + 0.22 * tipLevel));
}

/**
 * Lift / pressure scale for a wing that belongs to a L/R pair.
 * Synchronised bird-like strokes get the strongest lift (~1.35×); a solo
 * downstroke while a partner exists is slightly reduced (~0.88×) so steering
 * still works but sustained climb prefers symmetry.
 */
export function wingPairLiftScale(birdScore: number | undefined, paired: boolean): number {
  if (!paired) return 1;
  const bird = Math.max(0, Math.min(1, birdScore ?? 0));
  return 0.88 + 0.47 * bird;
}

/**
 * Flat-plate wing: projected-area pressure from relative wind on the
 * **downstroke only**, computed per wing muscle, then scaled by L/R pair
 * symmetry so bird-like in-phase flapping produces the best net lift.
 *
 * Downstroke = commanded shortening and/or this wing's span moving toward
 * ground (+Y) relative to the body. Upstroke / recovery and static hold are
 * skin-drag only — oscillating the recovery half must not invent net lift.
 * Asymmetric L/R strokes still produce differential tip impulses for
 * directional flight, but at reduced authority versus a matched pair stroke.
 */
export function applyWingForces(creature: Creature) {
  const { comVx, comVy, airborne, weightScale } = bodyFreeStream(creature);

  let comX = 0;
  let comY = 0;
  let massSum = 0;
  for (const node of creature.nodes) {
    const m = Math.max(0.35, node.mass);
    massSum += m;
    comX += node.x * m;
    comY += node.y * m;
  }
  massSum = Math.max(0.35, massSum);
  comX /= massSum;
  comY /= massSum;

  const strokes: WingStrokeState[] = [];
  for (const muscle of creature.muscles) {
    if (muscle.aeroType !== 'wing') continue;
    const a = creature.nodes[muscle.nodeA];
    const b = creature.nodes[muscle.nodeB];
    if (!a || !b) continue;

    const wing = muscle as WingMuscle;
    const prevTarget = wing._prevTarget ?? muscle.targetLength;
    const cmdDelta = prevTarget - muscle.targetLength;
    wing._prevTarget = muscle.targetLength;
    const flapping = Math.abs(cmdDelta) > 0.12;
    if (flapping) {
      creature.wingFlapFrames = (creature.wingFlapFrames ?? 0) + 1;
      creature.wingFlapWork = (creature.wingFlapWork ?? 0) + Math.abs(cmdDelta);
    }

    const seg = segmentVelocity(a, b);
    const strokeVy = seg.vy - comVy;
    const commandedPower = cmdDelta > 0.12;
    const kinematicPower = strokeVy > 0.1;
    const downstroke = commandedPower || kinematicPower;
    const strokeAuthority = Math.min(
      1.65,
      0.75 + Math.max(0, strokeVy) * 0.28 + Math.max(0, cmdDelta) * 0.015
    );
    const da = Math.hypot(a.x - comX, a.y - comY);
    const db = Math.hypot(b.x - comX, b.y - comY);
    const tip = da >= db ? a : b;
    strokes.push({
      muscle: wing,
      a,
      b,
      tip,
      side: tip.x - comX,
      cmdDelta,
      strokeVy,
      flapping,
      downstroke,
      strokeAuthority,
    });
  }

  // Pair outermost left/right wings (and next-inward pairs) for symmetry.
  const sorted = [...strokes].sort((u, v) => u.side - v.side);
  const birdByMuscle = new Map<number, number>();
  const pairedMuscleIds = new Set<number>();
  let bestBird = 0;
  for (let i = 0; i < Math.floor(sorted.length / 2); i++) {
    const left = sorted[i];
    const right = sorted[sorted.length - 1 - i];
    if (left === right) continue;
    // Require opposite sides of the COM (or a clear span) so same-side fans
    // are not treated as a bird pair.
    if (left.side * right.side > 0 && Math.abs(left.side - right.side) < 18) continue;
    pairedMuscleIds.add(left.muscle.id);
    pairedMuscleIds.add(right.muscle.id);
    const bird = wingPairBirdScore(left, right);
    birdByMuscle.set(left.muscle.id, bird);
    birdByMuscle.set(right.muscle.id, bird);
    bestBird = Math.max(bestBird, bird);
  }
  if (bestBird >= 0.4) {
    creature.wingSymFlapFrames = (creature.wingSymFlapFrames ?? 0) + 1;
    creature.wingSymFlapQuality = (creature.wingSymFlapQuality ?? 0) + bestBird;
  }

  for (const stroke of strokes) {
    const { muscle, a, b, flapping, downstroke, strokeAuthority } = stroke;
    const seg = segmentVelocity(a, b);
    const vx = comVx * 0.3 + seg.vx * 0.7;
    const vy = comVy * 0.3 + seg.vy * 0.7;
    const speed = Math.hypot(vx, vy);
    if (speed < 0.06) continue;

    let { nx, ny } = segmentFrame(a, b, false);
    const rwX = -vx / speed;
    const rwY = -vy / speed;
    if (nx * rwX + ny * rwY < 0) {
      nx = -nx;
      ny = -ny;
    }
    const facing = Math.max(0, nx * rwX + ny * rwY);
    const area = effectiveAeroArea(muscle);
    const q = speed * speed;

    if (!flapping || !downstroke || facing < 0.08) {
      const drag = area * (flapping ? 0.0007 : 0.0009) * q * (0.15 + 0.85 * facing);
      applySegmentImpulse(a, b, -(vx / speed) * drag, -(vy / speed) * drag, MAX_WING_FORCE * 0.55);
      continue;
    }

    const paired = pairedMuscleIds.has(muscle.id);
    const pairScale = wingPairLiftScale(birdByMuscle.get(muscle.id), paired);
    const projected = area * facing * facing;
    const pressure = projected * 0.055 * strokeAuthority * q * pairScale;
    let fx = nx * pressure * 0.15 + rwX * pressure * 0.85;
    let fy = ny * pressure * 0.15 + rwY * pressure * 0.85;
    const fwd = Math.abs(vx);
    if (airborne && fwd > 0.35 && facing > 0.2) {
      const { lx, ly } = liftAxis(vx, vy);
      const liftShare = projected * 0.014 * fwd * fwd * strokeAuthority * pairScale;
      fx += lx * liftShare;
      fy += ly * liftShare;
    }
    const drag = projected * 0.0014 * q;
    fx -= (vx / speed) * drag;
    fy -= (vy / speed) * drag;

    if (Math.hypot(fx, fy) < 0.002) continue;
    const cap = Math.min(MAX_WING_FORCE, weightScale * 1.1);
    applySegmentImpulse(a, b, fx, fy, cap);
  }
}

function canopyOpenness(muscle: PhysicsMuscle, len: number): number {
  const maxL = Math.max(12, muscle.maxLength || muscle.originalLength || len);
  const minL = Math.max(1, muscle.minLength || maxL * 0.5);
  const geometric = Math.min(1, Math.max(0.12, len / maxL));
  // 0 at minLength (fully reefed) → 1 at maxLength (fully open)
  const span = Math.max(1, maxL - minL);
  const commanded = Math.min(1, Math.max(0, (muscle.targetLength - minL) / span));
  // Reef multiplies area — a short target really kills lift.
  return Math.min(geometric, 0.12 + 0.88 * commanded);
}

/** Exported for fitness / sensors — 0 reefed … 1 fully open. */
export function sailOpenness(creature: Creature): number {
  let best = 0;
  let found = false;
  for (const muscle of creature.muscles) {
    if (muscle.aeroType !== 'paraglider') continue;
    const a = creature.nodes[muscle.nodeA];
    const b = creature.nodes[muscle.nodeB];
    if (!a || !b) continue;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    best = Math.max(best, canopyOpenness(muscle, len));
    found = true;
  }
  return found ? best : 0;
}

/** True when the body has at least one wing surface. */
export function hasWing(creature: { muscles: { aeroType?: string }[] }): boolean {
  return creature.muscles.some(m => m.aeroType === 'wing');
}

/** True when the body has at least one paraglider sail. */
export function hasParaglider(creature: { muscles: { aeroType?: string }[] }): boolean {
  return creature.muscles.some(m => m.aeroType === 'paraglider');
}

/** True when the body has at least one passive parachute. */
export function hasParachute(creature: { muscles: { aeroType?: string }[] }): boolean {
  return creature.muscles.some(m => m.aeroType === 'parachute');
}

/**
 * Sample the parachute cord between two anchors.
 * Inflation ≈ 0 → nearly straight string; inflation → 1 → dome canopy.
 */
export function sampleChuteString(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  inflation: number,
  nx = 0,
  ny = -1,
  area = 40,
  samples = 14
): { x: number; y: number }[] {
  const inflate = Math.max(0, Math.min(1, inflation));
  const dx = bx - ax;
  const dy = by - ay;
  const nLen = Math.hypot(nx, ny) || 1;
  const cnx = nx / nLen;
  const cny = ny / nLen;
  // Peak offset along cup normal — tiny when limp so the cord reads as a string.
  const half = Math.sqrt(Math.max(8, area)) * 0.72;
  const peak = half * (0.04 + 1.4 * inflate);
  const pts: { x: number; y: number }[] = [];
  const n = Math.max(4, samples);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const dome = Math.sin(Math.PI * t); // 0 at skirt ends, 1 at apex
    pts.push({
      x: ax + dx * t + cnx * peak * dome,
      y: ay + dy * t + cny * peak * dome,
    });
  }
  return pts;
}

export type ChuteStringStyle = {
  opacity?: number;
  lineWidth?: number;
  selected?: boolean;
  /** Studio / idle preview when runtime inflation is unset. */
  previewInflate?: number;
};

/**
 * Draw a parachute as a string: limp cord when collapsed, dome + gore lines when open.
 */
export function drawChuteString(
  ctx: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  muscle: Pick<PhysicsMuscle, 'aeroArea' | '_chuteInflation' | '_chuteNx' | '_chuteNy'>,
  style: ChuteStringStyle = {}
) {
  const opacity = style.opacity ?? 1;
  const inflate =
    muscle._chuteInflation !== undefined
      ? Math.max(0, Math.min(1, muscle._chuteInflation))
      : Math.max(0, Math.min(1, style.previewInflate ?? 0));
  const area = effectiveAeroArea(muscle as PhysicsMuscle);
  const nx = muscle._chuteNx ?? 0;
  const ny = muscle._chuteNy ?? -1;
  const pts = sampleChuteString(ax, ay, bx, by, inflate, nx, ny, area, 14);
  if (pts.length < 2) return;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Main cord / canopy skirt outline
  const cordW = (style.lineWidth ?? 2.2) * (inflate > 0.2 ? 1.15 : 0.9);
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.strokeStyle = style.selected
    ? `rgba(251, 146, 60, ${0.95 * opacity})`
    : inflate > 0.2
      ? `rgba(234, 88, 12, ${0.9 * opacity})`
      : `rgba(120, 113, 108, ${0.85 * opacity})`;
  ctx.lineWidth = cordW + (style.selected ? 1.2 : 0);
  ctx.stroke();

  // When inflated: light fabric fill + gore cords from apex to skirt
  if (inflate > 0.12) {
    const apex = pts[Math.floor(pts.length / 2)];
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fillStyle = `rgba(253, 186, 116, ${0.18 + 0.28 * inflate * opacity})`;
    ctx.fill();

    ctx.strokeStyle = `rgba(194, 65, 12, ${0.35 + 0.35 * inflate * opacity})`;
    ctx.lineWidth = Math.max(0.7, cordW * 0.45);
    const goreCount = 4;
    for (let g = 1; g < goreCount; g++) {
      const t = g / goreCount;
      const ix = Math.round(t * (pts.length - 1));
      const p = pts[ix];
      ctx.beginPath();
      ctx.moveTo(apex.x, apex.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
  }

  ctx.restore();
}

/**
 * Paraglider / sail: cambered canopy with forward-air lift.
 * Leading-tip pitch (up/down) trims climb vs dive. Vertical / edge-on belly
 * kills buoyancy. Load is canopy-primary with chassis share (F02 / D076) so
 * sail forces can pitch the craft; risers still hang the cart under the wing.
 */
export function applyParagliderForces(creature: Creature) {
  const { comVx, comVy, airborne, weightScale } = bodyFreeStream(creature);

  for (const muscle of creature.muscles) {
    if (muscle.aeroType !== 'paraglider') continue;

    const a = creature.nodes[muscle.nodeA];
    const b = creature.nodes[muscle.nodeB];
    if (!a || !b) continue;

    const area = effectiveAeroArea(muscle);
    const seg = segmentVelocity(a, b);
    const vx = comVx * 0.75 + seg.vx * 0.25;
    const vy = comVy * 0.75 + seg.vy * 0.25;
    const speed = Math.hypot(vx, vy);
    const fwd = Math.abs(vx);
    // Need airflow over the canopy — pure vertical bobbing does not fly.
    if (fwd < 0.75 || speed < 0.85) continue;

    const { nx, ny, len } = segmentFrame(a, b, true);
    const openness = canopyOpenness(muscle, len);
    // Belly-down: vertical knife-edge captures no air under the glider.
    const belly = Math.max(0, ny);
    if (belly < 0.14 || openness < 0.18) continue;

    const { vhx, vhy, lx, ly } = liftAxis(vx, vy);
    const rwX = -vhx;
    const rwY = -vhy;
    const normalHit = rwX * nx + rwY * ny;
    const alpha = Math.asin(Math.max(-1, Math.min(1, normalHit)));
    const { aoa } = canopyPitchAoA(a, b, vx, vy);

    // Camber + underside pressure + pilot pitch (leading tip up → climb).
    // Soft stall (D075) — no hard cliff on mild nose-up normalHit.
    const { Cl, Cd } = evaluateParagliderClCd({
      aoa,
      alpha,
      normalHit,
      belly,
      openness,
    });

    const qFwd = fwd * fwd;
    let liftMag = area * openness * 0.0052 * qFwd * Cl;
    let dragMag = area * openness * 0.0012 * qFwd * Cd;
    const liftCap = airborne ? weightScale * 1.9 : weightScale * 1.35;
    liftMag = Math.min(Math.max(liftMag, 0), liftCap);
    if (!airborne) {
      liftMag *= openness < 0.45 ? 0.25 : 0.85;
    }
    if (openness < 0.35) {
      liftMag *= 0.08;
    }
    if (comVy < -1.4) {
      liftMag *= 0.28;
    } else if (comVy < -0.7) {
      liftMag *= 0.55;
    }
    // Nose-down leading tip → dive.
    if (aoa < -0.12) {
      liftMag *= Math.max(0.18, 1 + aoa * 1.4);
      dragMag *= 1.15;
    }
    if (
      airborne &&
      openness > 0.65 &&
      fwd > 2.2 &&
      comVy > -0.45 &&
      comVy < 2.4 &&
      Math.abs(aoa) < 0.35
    ) {
      liftMag *= 1.28;
      dragMag *= 0.78;
    }

    const fx = lx * liftMag - vhx * dragMag;
    const fy = ly * liftMag - vhy * dragMag;
    // Light tips (Proven Glider ≈0.05): keep canopy share near legacy equal-impulse
    // so the cart still lifts and trim does not rocket. Moderate tips (Baseline ≈0.45):
    // higher canopy share so sail forces produce useful pitch torque (F02).
    const tipMass = 0.5 * (a.mass + b.mass);
    const canopyShare = tipMass < 0.2 ? 0.34 : 0.55;
    applyParaCanopyLoad(
      a,
      b,
      creature.nodes,
      fx,
      fy,
      Math.max(MAX_PARA_FORCE, liftCap * 1.35),
      canopyShare
    );
  }
}

/**
 * TEST-ONLY classical flat-plate: lift ⟂ flow, drag opposing flow, no flap gate,
 * no skyward bias beyond the signed perpendicular. Production wings stay flap-gated
 * (F03 honesty). Use from harness / smoke diagnostics only.
 */
export function applyDiagnosticClassicalPlateForces(creature: Creature) {
  const { comVx, comVy } = bodyFreeStream(creature);

  for (const muscle of creature.muscles) {
    if (muscle.aeroType !== 'wing' && muscle.aeroType !== 'paraglider') continue;
    const a = creature.nodes[muscle.nodeA];
    const b = creature.nodes[muscle.nodeB];
    if (!a || !b) continue;

    const seg = segmentVelocity(a, b);
    const vx = comVx * 0.5 + seg.vx * 0.5;
    const vy = comVy * 0.5 + seg.vy * 0.5;
    const speed = Math.hypot(vx, vy);
    if (speed < 0.05) continue;

    let { nx, ny } = segmentFrame(a, b, false);
    const vhx = vx / speed;
    const vhy = vy / speed;
    // Signed sin(α) = n · relativeWind (air toward plate).
    const rwX = -vhx;
    const rwY = -vhy;
    let sinA = nx * rwX + ny * rwY;
    if (sinA < 0) {
      nx = -nx;
      ny = -ny;
      sinA = -sinA;
    }
    const area = effectiveAeroArea(muscle);
    const q = speed * speed;
    // Classical thin-plate proxies (capped): Cl ∝ sin(2α)≈2sinαcosα, Cd ∝ sin²α.
    const cosA = Math.sqrt(Math.max(0, 1 - sinA * sinA));
    const Cl = Math.max(-1.4, Math.min(1.4, 1.1 * 2 * sinA * cosA));
    const Cd = 0.04 + 1.1 * sinA * sinA;
    // Lift perpendicular to flow (two-sided; sign from plate facing).
    let lx = -vhy;
    let ly = vhx;
    // Choose the lift sense that has a component along the hit normal (pressure side).
    if (lx * nx + ly * ny < 0) {
      lx = -lx;
      ly = -ly;
    }
    const liftMag = area * 0.0045 * q * Math.abs(Cl);
    const dragMag = area * 0.0015 * q * Cd;
    const fx = lx * liftMag - vhx * dragMag;
    const fy = ly * liftMag - vhy * dragMag;
    applySegmentImpulse(a, b, fx, fy, MAX_WING_FORCE);
  }
}

/**
 * Passive parachute: one-sided cup aerodynamics.
 *
 * Relative air piles into the canopy when the surface faces the flow
 * (projected area ∝ facing²). Edge-on / vertical to the wind captures
 * almost nothing — no free buoyancy. Drag is applied on the canopy
 * nodes so the payload hangs underneath via the soft risers.
 */
export function applyParachuteForces(creature: Creature) {
  const { comVx, comVy, airborne, weightScale } = bodyFreeStream(creature);

  for (const muscle of creature.muscles) {
    if (muscle.aeroType !== 'parachute') continue;

    const a = creature.nodes[muscle.nodeA];
    const b = creature.nodes[muscle.nodeB];
    if (!a || !b) continue;

    const seg = segmentVelocity(a, b);
    // Free-stream dominates; local canopy motion feeds collapse/gusts.
    const vx = comVx * 0.7 + seg.vx * 0.3;
    const vy = comVy * 0.7 + seg.vy * 0.3;
    const speed = Math.hypot(vx, vy);

    let { tx, ty, nx, ny, len } = segmentFrame(a, b, false);
    // Relative wind: air rushing toward the canopy.
    let rwX = 0;
    let rwY = -1; // default cup opens toward sky when nearly still
    let facing = 0;

    if (speed >= 0.12) {
      rwX = -vx / speed;
      rwY = -vy / speed;
      // Cup faces into the wind (one-sided membrane).
      if (nx * rwX + ny * rwY < 0) {
        nx = -nx;
        ny = -ny;
      }
      facing = Math.max(0, nx * rwX + ny * rwY);
    } else if (ny > 0) {
      // At rest, prefer the skyward cup so it is ready to catch a fall.
      nx = -nx;
      ny = -ny;
    }

    // Inflation: air capture when facing the flow; dump when edge-on / grounded.
    const prev = muscle._chuteInflation ?? 0;
    let targetInflate = 0;
    if (airborne && speed >= 0.18 && facing > 0.12) {
      // Soft open: need real ram-air, not a static float.
      targetInflate = Math.min(1, facing * facing * (0.35 + 0.65 * Math.min(1, speed / 2.4)));
    }
    const rate = targetInflate > prev ? 0.18 : 0.1;
    const inflation = prev + (targetInflate - prev) * rate;
    muscle._chuteInflation = inflation;
    muscle._chuteNx = nx;
    muscle._chuteNy = ny;

    // Edge-on or collapsed: negligible skin friction only on the canopy.
    if (!airborne || speed < 0.15 || facing < 0.1 || inflation < 0.08) {
      if (speed >= 0.2 && airborne) {
        const skin = effectiveAeroArea(muscle) * 0.00025 * speed * speed;
        applySegmentImpulse(a, b, (vx / speed) * -skin, (vy / speed) * -skin, MAX_CHUTE_FORCE * 0.2);
      }
      continue;
    }

    const area = effectiveAeroArea(muscle);
    // Geometric reef if the soft span is crumpled short.
    const maxL = Math.max(12, muscle.maxLength || muscle.originalLength || len);
    const geometric = Math.min(1, Math.max(0.2, len / maxL));
    // Projected cup area — facing² kills vertical / edge-on buoyancy.
    const projected = area * geometric * inflation * facing * facing;
    const q = speed * speed;
    // Pressure drag along relative wind (air pushes the cup).
    const dragMag = projected * 0.011 * q;
    // Mild tangential bleed for a soft drift, not a hover.
    const along = vx * tx + vy * ty;
    const slide = along * projected * 0.0012 * speed;

    const fx = rwX * dragMag - tx * slide * 0.35;
    const fy = rwY * dragMag - ty * slide * 0.35;

    const cap = Math.max(MAX_CHUTE_FORCE * 0.85, weightScale * 1.55);
    // Apply on canopy only — risers then settle the body underneath.
    applySegmentImpulse(a, b, fx, fy, cap);
  }
}
