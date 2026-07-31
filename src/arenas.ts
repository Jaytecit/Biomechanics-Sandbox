/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ArenaModifiers,
  CreatureBlueprint,
  EvolutionGoal,
  Obstacle,
  SimulationConfig,
  WorldObject,
} from './types';
import {
  GROUND_Y,
  COURSE_START_X,
  AGENT_SPAWN_X,
  TYPICAL_BODY_HEIGHT,
  TYPICAL_NODE_RADIUS,
  paraRampStartX,
  PARA_RAMP_WIDTH,
  BASE_GAP_WIDTH,
  BASE_PIT_DEPTH,
  BASE_RAMP_WIDTH,
  DEFAULT_RAMP_ANGLE_DEG,
  clampDifficulty,
  clampGapWidthPx,
  clampRampAngleDeg,
  clampRampWidthPx,
  rampHeightForAngle,
  FINISH_RUN_AUTHORED_BASE,
  FINISH_RUN_AUTHORED_MAX,
  scaleW,
  scaleD,
  effectiveTowerHeight,
  CHUTE_TOWER_X,
  CHUTE_TOWER_WIDTH,
} from './physicsConstants';
import { hoopInnerRadiusForBlueprint } from './terrain';

/** Course layout is relative to COURSE_START_X (one screen past agent spawn). */
const S = COURSE_START_X;

/** Base gap / finish geometry (scaled by difficulty / progressive tier in builders). */
export const GAP_START = S + scaleW(160);
export const GAP_WIDTH = BASE_GAP_WIDTH;
/** Authored px from course start to finish for a progressive tier. */
export function finishRunAuthored(tier = 0): number {
  const t = Math.max(0, tier);
  if (t === 0) return FINISH_RUN_AUTHORED_BASE;
  const span = FINISH_RUN_AUTHORED_MAX - FINISH_RUN_AUTHORED_BASE;
  return Math.round(FINISH_RUN_AUTHORED_BASE + span * Math.min(1, t / 4));
}

/** Scaled finish run length from course start (post WIDTH_SCALE). */
export function finishRunLength(arena?: Partial<ArenaModifiers>): number {
  const d = clampDifficulty(arena?.difficulty);
  const tier = arena?.progressiveTier ?? 0;
  const prog = progressiveFactor(tier);
  const authored = finishRunAuthored(tier);
  return Math.round(scaleW(authored) * d * (tier > 0 ? prog : 1));
}

export const FINISH_RUN_LENGTH = scaleW(FINISH_RUN_AUTHORED_BASE);
export const FINISH_LINE_X = S + FINISH_RUN_LENGTH;
export const PARK_ZONE_X = S + scaleW(420);
export const PARK_ZONE_WIDTH = scaleW(140);

/** Progressive tier multiplies gap/finish/bar challenge (~12% per tier). */
export function progressiveFactor(tier = 0): number {
  return 1 + Math.max(0, tier) * 0.12;
}

export function effectiveGapWidth(arena?: Partial<ArenaModifiers>, baseMul = 1): number {
  const d = clampDifficulty(arena?.difficulty);
  const tier = progressiveFactor(arena?.progressiveTier);
  const user = clampGapWidthPx(arena?.gapWidthPx ?? BASE_GAP_WIDTH);
  return Math.round(user * baseMul * d * tier);
}

export function effectiveRampAngle(arena?: Partial<ArenaModifiers>): number {
  return clampRampAngleDeg(arena?.rampAngleDeg ?? DEFAULT_RAMP_ANGLE_DEG);
}

/**
 * Ramp run length. `baseWidth` is the goal's authored length at the default
 * slider setting; the user value scales it (1× … 10× of BASE_RAMP_WIDTH).
 */
export function effectiveRampWidth(
  arena?: Partial<ArenaModifiers>,
  baseWidth = BASE_RAMP_WIDTH
): number {
  const user = clampRampWidthPx(arena?.rampWidthPx ?? BASE_RAMP_WIDTH);
  const scale = user / BASE_RAMP_WIDTH;
  return Math.max(1, Math.round(baseWidth * scale));
}

export function appendIcePatches(obstacles: Obstacle[], patches: { x: number; width: number }[]) {
  const h = scaleD(8);
  for (const patch of patches) {
    obstacles.push({ type: 'ice', x: patch.x, y: GROUND_Y - h, width: patch.width, height: h });
  }
}

/** Pit: floor collision disabled across [x, x+width]. */
export function makePit(x: number, width: number): Obstacle {
  return { type: 'pit', x, y: GROUND_Y, width, height: BASE_PIT_DEPTH };
}

/** Landing / elevated pad as a static box (platforms removed). */
export function makePad(
  x: number,
  yTop: number,
  width: number,
  thickness: number,
  label?: string
): Obstacle {
  const h = Math.max(2, thickness);
  return {
    type: 'box',
    x,
    y: yTop,
    width,
    height: h,
    label: label ?? 'pad',
  };
}

/**
 * Right-triangle ramp from ground. label 'TAKEOFF' is reserved for Para Ramp curriculum only.
 */
export function makeRamp(x: number, width: number, angleDeg: number, label?: string): Obstacle {
  const height = rampHeightForAngle(width, angleDeg);
  return {
    type: 'ramp',
    x,
    y: GROUND_Y - height,
    width,
    height,
    angle: angleDeg,
    label,
  };
}

export function makeFinish(x: number, label = 'FINISH'): Obstacle {
  const h = Math.max(100, scaleD(140) * 2);
  return { type: 'finish', x, y: GROUND_Y - h, width: scaleW(8), height: h, label };
}

/** Vertical launch tower with a platform at the top for parachute goals. */
export function makeTower(
  x: number,
  height: number,
  width = CHUTE_TOWER_WIDTH,
  label = 'TOWER'
): Obstacle {
  const h = Math.max(scaleD(80), Math.round(height));
  return {
    type: 'tower',
    x,
    y: GROUND_Y - h,
    width,
    height: h,
    label,
  };
}

export function makeCheckpoint(x: number, index: number): Obstacle {
  const h = Math.max(80, scaleD(110) * 2);
  return {
    type: 'checkpoint',
    x,
    y: GROUND_Y - h,
    width: scaleW(5),
    height: h,
    checkpointIndex: index,
  };
}

export function makeLoop(
  centerX: number,
  centerY: number,
  radius: number,
  tube = scaleW(18)
): Obstacle {
  return {
    type: 'loop',
    x: centerX,
    y: centerY,
    width: tube,
    height: radius,
  };
}

const HOOP_TUBE = Math.max(10, scaleD(14) * 2);

/** Private rolling hoop sized to fit the creature blueprint. */
export function makeHoopForBlueprint(blueprint: CreatureBlueprint): WorldObject {
  const inner = hoopInnerRadiusForBlueprint(
    blueprint.relativePositions,
    blueprint.nodes.map(n => n.radius)
  );
  const outer = inner + HOOP_TUBE;
  const x = AGENT_SPAWN_X;
  const y = GROUND_Y - outer;
  return {
    id: 'hoop',
    type: 'hoop',
    x,
    y,
    oldX: x,
    oldY: y,
    radius: inner,
    tubeThickness: HOOP_TUBE,
    width: outer * 2,
    height: outer * 2,
    mass: 6.5 + inner * 0.04,
    startX: x,
    startY: y,
    angle: 0,
  };
}

export function makeTarget(x: number, y: number, radius: number): Obstacle {
  return {
    type: 'target',
    x: x - radius,
    y: y - radius,
    width: radius * 2,
    height: radius * 2,
    targetRadius: radius,
  };
}

/**
 * Optional user ramp + pit for any goal/model.
 * Never labels ramps as TAKEOFF — ParaPilot phases stay Para Ramp–only.
 * Skipped when the active goal already owns a curriculum ramp/pit (avoids doubles).
 */
export function appendOptionalRampPit(
  obstacles: Obstacle[],
  goal: EvolutionGoal,
  arena?: Partial<ArenaModifiers>
) {
  if (!arena) return;
  const wantsRamp = !!arena.rampEnabled;
  const wantsPit = !!arena.pitEnabled;
  if (!wantsRamp && !wantsPit) return;

  if (
    goal === EvolutionGoal.PARA_RAMP_GLIDE ||
    goal === EvolutionGoal.CHUTE_DESCENT ||
    goal === EvolutionGoal.AERIAL_CROSSING ||
    goal === EvolutionGoal.MOTOR_GAP ||
    goal === EvolutionGoal.MOTOR_LAUNCH_LAND ||
    goal === EvolutionGoal.MOTOR_RAMP ||
    goal === EvolutionGoal.MOTOR_BRIDGE ||
    goal === EvolutionGoal.BALANCE_BEAM
  ) {
    return;
  }

  const angle = effectiveRampAngle(arena);
  const gapW = effectiveGapWidth(arena);
  let x = S + scaleW(40);

  if (wantsRamp) {
    const rampW = effectiveRampWidth(arena);
    obstacles.push(makeRamp(x, rampW, angle, 'RAMP'));
    x += rampW;
  }

  if (wantsPit) {
    obstacles.push(makePit(x, gapW));
    const padH = scaleD(18);
    obstacles.push(makePad(x + gapW, GROUND_Y - padH, scaleW(140), padH, 'LAND'));
  }
}

type ArenaOpts = Partial<ArenaModifiers> | undefined;

/** Build arenas for every goal that needs custom geometry. */
export function buildGoalArena(goal: EvolutionGoal, arena?: ArenaOpts): Obstacle[] {
  const obstacles: Obstacle[] = [];
  const d = clampDifficulty(arena?.difficulty);
  const tier = progressiveFactor(arena?.progressiveTier);
  const angle = effectiveRampAngle(arena);

  switch (goal) {
    case EvolutionGoal.MOTOR_GAP: {
      const gapW = effectiveGapWidth(arena, 1);
      const gapStart = GAP_START;
      obstacles.push(makePit(gapStart, gapW));
      const padH = scaleD(14);
      obstacles.push(makePad(gapStart + gapW, GROUND_Y - padH, scaleW(90), padH, 'LAND'));
      break;
    }

    case EvolutionGoal.AERIAL_CROSSING: {
      const gapW = effectiveGapWidth(arena, 1.5);
      const gapStart = GAP_START;
      const rampW = effectiveRampWidth(arena, scaleW(180));
      obstacles.push(makeRamp(gapStart - rampW - scaleW(20), rampW, angle, 'RAMP'));
      obstacles.push(makePit(gapStart, gapW));
      const padH = scaleD(18);
      obstacles.push(makePad(gapStart + gapW, GROUND_Y - padH, scaleW(140), padH, 'LAND'));
      break;
    }

    case EvolutionGoal.PARA_RAMP_GLIDE: {
      const rampX = paraRampStartX(d);
      const rampW = effectiveRampWidth(arena, Math.round(PARA_RAMP_WIDTH * (0.95 + d * 0.05)));
      obstacles.push(makeRamp(rampX, rampW, angle, 'TAKEOFF'));
      const gapStart = rampX + rampW;
      const paraGap = Math.round(
        clampGapWidthPx(arena?.gapWidthPx ?? scaleW(320)) * d * tier
      );
      obstacles.push(makePit(gapStart, paraGap));
      const rampH = rampHeightForAngle(rampW, angle);
      const padH = Math.round(rampH * 0.45);
      const padThick = scaleD(20);
      obstacles.push(makePad(gapStart + paraGap, GROUND_Y - padH, scaleW(240), padThick, 'LAND'));
      obstacles.push(
        makePad(
          gapStart + paraGap + scaleW(280),
          GROUND_Y - Math.round(padH * 0.55),
          scaleW(200),
          scaleD(18)
        )
      );
      break;
    }

    case EvolutionGoal.CHUTE_DESCENT: {
      const towerH = effectiveTowerHeight(arena);
      const towerW = CHUTE_TOWER_WIDTH;
      obstacles.push(makeTower(CHUTE_TOWER_X, towerH, towerW, 'TOWER'));
      const padW = scaleW(220);
      const padThick = scaleD(18);
      obstacles.push(
        makePad(CHUTE_TOWER_X - scaleW(20), GROUND_Y - padThick, padW, padThick, 'LAND')
      );
      break;
    }

    case EvolutionGoal.MOTOR_LAUNCH_LAND: {
      const pitW = effectiveGapWidth(arena, 220 / 216);
      const rampW = effectiveRampWidth(arena, scaleW(260));
      obstacles.push(makeRamp(S + scaleW(60), rampW, angle, 'RAMP'));
      const pitStart = S + scaleW(60) + rampW;
      obstacles.push(makePit(pitStart, pitW));
      const padH = scaleD(20);
      const landY = GROUND_Y - Math.max(padH, rampHeightForAngle(rampW, angle) * 0.55);
      obstacles.push(makePad(pitStart + pitW, landY, scaleW(240), padH, 'LAND'));
      obstacles.push(makePad(pitStart + pitW + scaleW(280), landY, scaleW(180), padH));
      break;
    }

    case EvolutionGoal.MOTOR_LOOP:
      break;

    case EvolutionGoal.MOTOR_HURDLES: {
      const hurdleW = Math.max(scaleW(TYPICAL_NODE_RADIUS * 2.8), scaleW(34));
      const baseH = Math.round(Math.max(scaleD(28), TYPICAL_BODY_HEIGHT * 0.28) * tier);
      const spacing = Math.round(scaleW(2100) * (0.85 + d * 0.2));
      const count = 6;
      const start = S + scaleW(1200);
      for (let i = 0; i < count; i++) {
        const h = Math.round((baseH + 8 + (i % 3) * 6) * (0.85 + d * 0.2));
        const x = start + i * spacing;
        obstacles.push({
          type: 'box',
          x,
          y: GROUND_Y - h,
          width: hurdleW,
          height: h,
          hurdleIndex: i,
        });
      }
      obstacles.push(makeFinish(start + count * spacing + scaleW(1800)));
      break;
    }

    case EvolutionGoal.SPRINT_FINISH: {
      const run = finishRunLength(arena);
      const finishX = S + run;
      obstacles.push(makeCheckpoint(S + Math.round(run * 0.28), 0));
      obstacles.push(makeCheckpoint(S + Math.round(run * 0.58), 1));
      obstacles.push(makeFinish(finishX));
      break;
    }

    case EvolutionGoal.ROUGH_TERRAIN_TRAVERSE: {
      const run = finishRunLength(arena);
      const section = Math.round(run / 4);
      obstacles.push(makeCheckpoint(S + section, 0));
      obstacles.push(makeCheckpoint(S + section * 2, 1));
      obstacles.push(makeCheckpoint(S + section * 3, 2));
      obstacles.push(makeFinish(S + section * 4));
      break;
    }

    case EvolutionGoal.MOTOR_LANDSPEED:
      // Flat open track — peak ground speed only (no finish race).
      break;

    case EvolutionGoal.MOTOR_BRIDGE: {
      const pitW = effectiveGapWidth(arena, 560 / 216);
      const pitX = S + scaleW(40);
      obstacles.push(makePit(pitX, pitW));
      // Bridge spans the pit lip-to-lip. The legacy layout floated a shorter
      // deck 70px (unscaled, pre-CREATURE_WORLD_SCALE) above ground with lip
      // holes on both sides — unreachable and unfinishable for ~12px bodies.
      const deckLip = scaleD(12);
      const beamH = scaleD(18) + deckLip;
      obstacles.push(makePad(pitX, GROUND_Y - deckLip, pitW, beamH, 'bridge'));
      break;
    }

    case EvolutionGoal.MOTOR_SLALOM: {
      const run = finishRunLength(arena);
      const start = S + Math.round(run * 0.08);
      const section = Math.round(run * 0.12);
      obstacles.push(makeRamp(start, Math.round(section * 0.65), 18, 'TECH'));
      obstacles.push(makePad(start + section, GROUND_Y - scaleD(34), Math.round(section * 0.42), scaleD(12), 'TECH'));
      obstacles.push(makePad(start + section * 2, GROUND_Y - scaleD(62), Math.round(section * 0.32), scaleD(12), 'TECH'));
      const riserHeight = Math.round((48 + d * 10) * Math.max(1, tier * 0.5 + 0.75));
      obstacles.push({
        type: 'box',
        x: start + section * 3,
        y: GROUND_Y - riserHeight,
        width: Math.max(scaleW(22), scaleW(TYPICAL_NODE_RADIUS * 1.8)),
        height: riserHeight,
        label: 'TECH',
      });
      obstacles.push(makeRamp(start + section * 4, Math.round(section * 0.7), 24, 'TECH'));
      obstacles.push(makePad(start + section * 5, GROUND_Y - scaleD(18), Math.round(section * 0.36), scaleD(8), 'TECH'));
      obstacles.push(makeCheckpoint(start + section * 3 - scaleW(30), 0));
      obstacles.push(makeCheckpoint(start + section * 5 - scaleW(30), 1));
      obstacles.push(makeFinish(S + run));
      break;
    }

    case EvolutionGoal.MOTOR_RAMP: {
      // Incline only — no summit pad (flat lip caused carts to slam and crash).
      const rampW = effectiveRampWidth(arena, Math.round(scaleW(640) * d));
      obstacles.push(makeRamp(S + scaleW(40), rampW, angle, 'RAMP'));
      break;
    }

    case EvolutionGoal.BALANCE_BEAM: {
      const pitW = effectiveGapWidth(arena, 640 / 216);
      const pitX = S + scaleW(40);
      const beamThickness = Math.max(scaleD(10), Math.round(scaleD(16) - d));
      obstacles.push(makePit(pitX, pitW));
      // Beam spans the pit lip-to-lip with a small mountable deck lip. The
      // legacy layout started 90px inside the pit (a guaranteed fall) and sat
      // 55px (unscaled, pre-CREATURE_WORLD_SCALE) above ground — unmountable.
      const deckLip = scaleD(12);
      obstacles.push(
        makePad(pitX, GROUND_Y - deckLip, pitW, beamThickness + deckLip, 'beam')
      );
      break;
    }

    case EvolutionGoal.PARKING_ZONE: {
      const zoneX = S + Math.round(scaleW(480) * d * tier);
      const zoneW = PARK_ZONE_WIDTH;
      const markH = scaleD(8);
      obstacles.push(makePad(zoneX, GROUND_Y - markH, zoneW, markH, 'park'));
      obstacles.push({
        type: 'finish',
        x: zoneX,
        y: GROUND_Y - 60,
        width: zoneW,
        height: 60,
        label: 'PARK',
        zoneWidth: zoneW,
      });
      break;
    }

    case EvolutionGoal.HIT_TARGET: {
      obstacles.push(
        makeTarget(S + Math.round(scaleW(480) * d), GROUND_Y - 160, scaleW(40))
      );
      obstacles.push(
        makeTarget(S + Math.round(scaleW(720) * d), GROUND_Y - 110, scaleW(32))
      );
      break;
    }

    case EvolutionGoal.KICK_GOAL: {
      const goalX = S + Math.round(scaleW(700) * d);
      const postW = scaleW(14);
      const mouth = scaleW(90);
      const postH = 110;
      const innerLeft = goalX + postW;
      const innerRight = goalX + mouth;
      const mouthInner = innerRight - innerLeft;
      obstacles.push({
        type: 'box',
        x: goalX,
        y: GROUND_Y - postH,
        width: postW,
        height: postH,
        label: 'GOAL_POST',
      });
      obstacles.push({
        type: 'box',
        x: innerRight,
        y: GROUND_Y - postH,
        width: postW,
        height: postH,
        label: 'GOAL_POST',
      });
      obstacles.push({
        type: 'bar',
        x: innerLeft,
        y: GROUND_Y - postH,
        width: mouthInner,
        height: scaleD(5),
        barClearHeight: postH,
        label: 'GOAL',
      });
      obstacles.push({
        type: 'finish',
        x: innerLeft,
        y: GROUND_Y - 100,
        width: mouthInner,
        height: 100,
        label: 'NET',
        zoneWidth: mouthInner,
      });
      break;
    }

    case EvolutionGoal.BOWLING_PINS:
      break;

    case EvolutionGoal.DODGEBALL: {
      const hazardH = scaleD(18);
      const run = finishRunLength(arena);
      const hazards = [
        { x: S + Math.round(run * 0.12), y: GROUND_Y - 60, w: scaleW(800) },
        { x: S + Math.round(run * 0.42), y: GROUND_Y - 95, w: scaleW(700) },
        { x: S + Math.round(run * 0.72), y: GROUND_Y - 55, w: scaleW(800) },
      ];
      for (let index = 0; index < hazards.length; index += 1) {
        const h = hazards[index];
        obstacles.push({
          ...makePad(h.x, h.y, h.w, hazardH, 'hazard'),
          hazardOrder: index,
        });
      }
      obstacles.push(makeFinish(S + run));
      break;
    }

    default:
      break;
  }

  return obstacles;
}

/** Extra private world objects for sports / object goals. */
export function buildGoalWorldObjects(
  goal: EvolutionGoal,
  blueprint?: CreatureBlueprint,
  difficulty = 1
): WorldObject[] {
  const objects: WorldObject[] = [];
  const d = clampDifficulty(difficulty);

  if (goal === EvolutionGoal.MOTOR_LOOP && blueprint) {
    objects.push(makeHoopForBlueprint(blueprint));
  }

  if (
    goal === EvolutionGoal.CARRY_BALL ||
    goal === EvolutionGoal.CUSTOM ||
    goal === EvolutionGoal.KICK_GOAL ||
    goal === EvolutionGoal.HIT_TARGET
  ) {
    const x =
      goal === EvolutionGoal.KICK_GOAL || goal === EvolutionGoal.HIT_TARGET
        ? S + Math.round(scaleW(200) * d)
        : S + Math.round(scaleW(140) * d);
    const radius = scaleW(14);
    const y = GROUND_Y - radius;
    objects.push({
      id: 'ball',
      type: 'ball',
      x,
      y,
      oldX: x,
      oldY: y,
      radius,
      width: radius * 2,
      height: radius * 2,
      mass: 0.8,
      startX: x,
      startY: y,
    });
  }

  if (goal === EvolutionGoal.PUSH_BOX || goal === EvolutionGoal.CUSTOM) {
    const x = S + Math.round(scaleW(240) * d);
    const w = scaleW(40);
    const h = scaleD(40);
    const y = GROUND_Y - h;
    objects.push({
      id: 'crate',
      type: 'box',
      x,
      y,
      oldX: x,
      oldY: y,
      radius: Math.max(w, h) / 2,
      width: w,
      height: h,
      mass: 2.2,
      startX: x,
      startY: y,
    });
  }

  if (goal === EvolutionGoal.BOWLING_PINS) {
    const baseX = S + Math.round(scaleW(520) * d);
    const rows = [1, 2, 3, 4];
    let pinId = 0;
    const pinW = scaleW(18);
    const pinH = scaleD(32);
    for (let r = 0; r < rows.length; r++) {
      const count = rows[r];
      for (let i = 0; i < count; i++) {
        const x =
          baseX + r * scaleW(32) + i * scaleW(30) - ((count - 1) * scaleW(30)) / 2;
        const y = GROUND_Y - pinH;
        objects.push({
          id: `pin_${pinId++}`,
          type: 'box',
          x,
          y,
          oldX: x,
          oldY: y,
          radius: Math.max(pinW, pinH) / 2,
          width: pinW,
          height: pinH,
          mass: 0.9,
          startX: x,
          startY: y,
        });
      }
    }
  }

  return objects;
}

export function applyArenaModifiers(
  obstacles: Obstacle[],
  goal: EvolutionGoal,
  arena?: SimulationConfig['arena']
) {
  if (goal === EvolutionGoal.MOTOR_ICE || arena?.iceEnabled) {
    const icePatches =
      goal === EvolutionGoal.MOTOR_ICE
        ? [
            { x: S + scaleW(80), width: scaleW(280) },
            { x: S + scaleW(420), width: scaleW(340) },
            { x: S + scaleW(860), width: scaleW(300) },
            { x: S + scaleW(1280), width: scaleW(360) },
          ]
        : [
            { x: S + scaleW(120), width: scaleW(200) },
            { x: S + scaleW(520), width: scaleW(280) },
            { x: S + scaleW(1000), width: scaleW(220) },
          ];
    appendIcePatches(obstacles, icePatches);
  }

  appendOptionalRampPit(obstacles, goal, arena);
}
