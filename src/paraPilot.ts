/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Multi-head paraglider phase machine: run-up → deploy → glide.
 * Hard takeover with a short actuator blend at each gate.
 */

import { evaluateGenome, crossover } from './neat';
import {
  PARA_BLEND_FRAMES,
  PARA_DEPLOY_AIR_GATE,
} from './physicsConstants';
import {
  Creature,
  EvolutionGoal,
  Genome,
  Obstacle,
  ParaPilot,
  ParaPilotPhase,
  ParaPilotStage,
  createParaPilot,
  isBrainDrivenMuscle,
} from './types';
import { sailOpenness, hasParaglider } from './aero';

export function isParaRampGoal(goal: EvolutionGoal): boolean {
  return goal === EvolutionGoal.PARA_RAMP_GLIDE;
}

export function findTakeoffRamp(obstacles: Obstacle[]): Obstacle | undefined {
  return obstacles.find(o => o.type === 'ramp' && o.label === 'TAKEOFF');
}

export function paraStageLabel(stage: ParaPilotStage): string {
  switch (stage) {
    case 'runUp':
      return 'Training: Run-up';
    case 'deploy':
      return 'Training: Deploy';
    case 'glide':
      return 'Training: Glide';
    case 'eval':
      return 'Eval: Full pilot';
  }
}

/** Bars for auto stage advance (recent generation-best metrics). */
export const PARA_STAGE_BARS: Record<Exclude<ParaPilotStage, 'eval'>, number> = {
  runUp: 1, // gap cleared (ballistic jump past the pit)
  deploy: 120, // deploy-stage fitness (forward open transition)
  glide: 400, // forward corridor glide — not loft rockets
};

export const PARA_STAGE_HISTORY_LEN = 6;
export const PARA_STAGE_CLEAR_COUNT = 4;

function genomeForPhase(creature: Creature, phase: ParaPilotPhase): Genome {
  const pilot = creature.paraPilot;
  if (!pilot) return creature.genome;
  if (phase === 'deploy') return pilot.deploy;
  if (phase === 'glide') return pilot.glide;
  return pilot.runUp;
}

function blendOutputs(from: number[], to: number[], t: number): number[] {
  const n = Math.max(from.length, to.length);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = from[i] ?? 0;
    const b = to[i] ?? 0;
    out.push(a * (1 - t) + b * t);
  }
  return out;
}

/**
 * Advance ParaPilot phase gates (gap-clear jump, deploy→glide).
 * Call every frame for PARA_RAMP_GLIDE even when actuators are scripted.
 */
export function updateParaPhaseGates(
  creature: Creature,
  obstacles: Obstacle[],
  horizSpeed: number,
  fullyAirborne: boolean,
  inputsForBlend?: number[]
) {
  if (!creature.paraPilot) {
    creature.paraPhase = creature.paraPhase ?? 'runUp';
  }

  const ramp = findTakeoffRamp(obstacles);
  const rampStart = ramp?.x ?? Infinity;
  const onRamp =
    !!ramp &&
    creature.currentX >= ramp.x - 20 &&
    creature.currentX <= ramp.x + ramp.width + 40;

  let phase: ParaPilotPhase = creature.paraPhase ?? 'runUp';

  // Run-up owns the reefed ballistic jump: record lip speed on the ramp,
  // but hand off to deploy only after the gap is cleared (not at the lip).
  if (phase === 'runUp') {
    if (onRamp || creature.currentX >= rampStart) {
      creature.paraLaunchSpeed = Math.max(creature.paraLaunchSpeed ?? 0, horizSpeed);
    }
    if (creature.gapCleared) {
      if (inputsForBlend && creature.paraPilot) {
        creature.paraBlendFrom = evaluateGenome(genomeForPhase(creature, 'runUp'), inputsForBlend);
      }
      creature.paraBlendFrames = PARA_BLEND_FRAMES;
      phase = 'deploy';
      creature.paraDeployAirFrames = 0;
    }
  }

  if (phase === 'deploy') {
    const open = sailOpenness(creature);
    if (fullyAirborne && open >= 0.72) {
      creature.paraDeployAirFrames = (creature.paraDeployAirFrames ?? 0) + 1;
    } else if (!fullyAirborne) {
      creature.paraDeployAirFrames = 0;
    }
    if ((creature.paraDeployAirFrames ?? 0) >= PARA_DEPLOY_AIR_GATE) {
      if (inputsForBlend && creature.paraPilot) {
        creature.paraBlendFrom = evaluateGenome(genomeForPhase(creature, 'deploy'), inputsForBlend);
      }
      creature.paraBlendFrames = PARA_BLEND_FRAMES;
      phase = 'glide';
    }
  }

  if (
    (phase === 'deploy' || phase === 'glide') &&
    fullyAirborne &&
    creature.currentX >= rampStart
  ) {
    const clear = Math.max(0, creature.startY - creature.currentY);
    // Cap recorded launch height so rocket loft cannot inflate the sensor forever
    creature.paraLaunchHeight = Math.max(
      creature.paraLaunchHeight ?? 0,
      Math.min(clear, 160)
    );
  }

  if (phase === 'deploy' || phase === 'glide') {
    creature.paraPeakX = Math.max(creature.paraPeakX ?? creature.currentX, creature.currentX);
  }

  // Also capture lip speed if we went airborne without flipping phase yet
  if (
    phase === 'runUp' &&
    fullyAirborne &&
    creature.currentX >= rampStart - 30
  ) {
    creature.paraLaunchSpeed = Math.max(creature.paraLaunchSpeed ?? 0, horizSpeed);
  }

  creature.paraPhase = phase;
  if (creature.paraPilot) {
    creature.genome = genomeForPhase(creature, phase);
  }
}

/**
 * Evaluate the active ParaPilot head (call after updateParaPhaseGates).
 */
export function evaluateParaPilotOutputs(
  creature: Creature,
  inputs: number[]
): {
  outputs: number[];
  lockSailReefed: boolean;
  dampMotors: boolean;
} {
  const phase: ParaPilotPhase = creature.paraPhase ?? 'runUp';
  if (!creature.paraPilot) {
    return {
      outputs: evaluateGenome(creature.genome, inputs),
      lockSailReefed: false,
      dampMotors: false,
    };
  }

  const raw = evaluateGenome(genomeForPhase(creature, phase), inputs);
  let outputs = raw;
  const blendLeft = creature.paraBlendFrames ?? 0;
  if (blendLeft > 0 && creature.paraBlendFrom) {
    const t = 1 - (blendLeft - 1) / PARA_BLEND_FRAMES;
    outputs = blendOutputs(creature.paraBlendFrom, raw, Math.max(0, Math.min(1, t)));
    creature.paraBlendFrames = blendLeft - 1;
    if (creature.paraBlendFrames <= 0) creature.paraBlendFrom = undefined;
  }

  return {
    outputs,
    lockSailReefed: phase === 'runUp',
    dampMotors: phase === 'deploy',
  };
}

/** @deprecated use updateParaPhaseGates + evaluateParaPilotOutputs */
export function evaluateParaPilot(
  creature: Creature,
  inputs: number[],
  obstacles: Obstacle[],
  horizSpeed: number,
  fullyAirborne: boolean
): {
  outputs: number[];
  lockSailReefed: boolean;
  dampMotors: boolean;
} {
  updateParaPhaseGates(creature, obstacles, horizSpeed, fullyAirborne, inputs);
  return evaluateParaPilotOutputs(creature, inputs);
}

/** Stage-weighted fitness for PARA_RAMP_GLIDE. */
export function paraRampFitness(
  creature: Creature,
  stage: ParaPilotStage = 'runUp'
): number {
  const launchSpeed = Math.min(creature.paraLaunchSpeed ?? 0, 40);
  const height = Math.min(creature.paraLaunchHeight ?? 0, 140);
  // Glide/air terms come from the best single uninterrupted bout (D113).
  const flyDist = creature.glideBoutDistance ?? 0;
  const openGlide = creature.glideBoutOpenDist ?? 0;
  const corridor = creature.glideBoutCorridorFrames ?? 0;
  const corridorDist = creature.glideBoutCorridorDist ?? 0;
  const streak = creature.glideBoutFrames ?? 0;
  const peak = creature.glideBoutPeakClearance ?? 0;
  const air = creature.glideBoutFrames ?? 0;
  const meanClear = air > 0 ? (creature.glideBoutHeightIntegral ?? 0) / air : 0;
  const deploy = creature.sailDeploySpeed ?? 0;
  const fell = !!creature.fellInPit;
  const clear = creature.gapCleared ? 1 : 0;
  const peakX = creature.paraPeakX ?? creature.currentX;
  const backslide = Math.max(0, peakX - creature.currentX);

  // Rocket signature: peak much higher than mean cruise → heavy penalty
  const leapiness = peak > 50 ? Math.max(0, peak / Math.max(18, meanClear) - 1.35) : 0;
  const leapPenalty = leapiness * peak * 0.85;
  // Pure loft without forward corridor is worthless
  const loftWithoutGlide =
    peak > 90 && corridorDist < 40 ? (peak - 90) * 1.2 + backslide * 0.8 : backslide * 0.55;

  const speedScore = launchSpeed * 8;
  // Prefer mid-height cruise, not max loft
  const cruiseHeight = Math.min(meanClear, 120) * 1.1 + Math.min(height, 100) * 0.35;
  const distScore = openGlide * 2.8 + flyDist * 1.1;
  const corridorBonus =
    corridor * 5.5 +
    corridorDist * 4.5 +
    Math.pow(Math.max(0, streak - 40), 1.15) * 0.35;
  const deployBonus =
    deploy >= 12 ? 50 + (Math.min(deploy, 40) - 12) * 3.5 : deploy * 1.2;
  const clearBonus = clear * (50 + Math.min(200, corridorDist * 1.4));
  const pitMul = fell ? 0.1 : 1;
  const forwardGate = Math.min(1, (openGlide + corridorDist) / 80);

  const activeAirScore = ((): number => {
    if (stage === 'runUp') {
      return Math.min(flyDist, 40) * 0.05;
    }
    if (stage === 'deploy') {
      return (
        distScore * 0.45 +
        cruiseHeight * 0.2 -
        leapPenalty * 0.5 -
        loftWithoutGlide * 0.4
      );
    }
    return (
      cruiseHeight * 0.55 * forwardGate +
      distScore * 1.35 +
      corridorBonus +
      clearBonus -
      leapPenalty -
      loftWithoutGlide
    );
  })();
  const airScore = Math.max(creature.paraAirBestBoutScore ?? 0, activeAirScore);

  if (stage === 'runUp') {
    // Lock-in = clear the pit with a fast reefed jump. Speed is the shaping signal.
    const clearScore = clear * (280 + Math.min(launchSpeed, 35) * 8);
    const landBonus =
      clear && !fell && creature.nodes.some(n => n.isGround) ? 100 : 0;
    const approach = Math.min(Math.max(0, creature.currentX - creature.startX), 2000) * 0.03;
    return Math.max(
      0,
      (speedScore * 2.2 + clearScore + landBonus + approach + airScore) * pitMul
    );
  }
  if (stage === 'deploy') {
    return Math.max(
      0,
      (speedScore * 0.4 + deployBonus * 1.6 + airScore) * pitMul
    );
  }
  // glide + eval: forward corridor dominates; loft rockets score poorly
  return Math.max(
    0,
    (speedScore * 0.2 + deployBonus * 0.35 + airScore) * pitMul
  );
}

/** Air/glide component of Para Ramp for one uninterrupted bout (for bout finalize). */
export function paraRampAirBoutScore(
  creature: Creature,
  stage: ParaPilotStage = 'glide'
): number {
  const flyDist = creature.glideBoutDistance ?? 0;
  const openGlide = creature.glideBoutOpenDist ?? 0;
  const corridor = creature.glideBoutCorridorFrames ?? 0;
  const corridorDist = creature.glideBoutCorridorDist ?? 0;
  const streak = creature.glideBoutFrames ?? 0;
  const peak = creature.glideBoutPeakClearance ?? 0;
  const air = creature.glideBoutFrames ?? 0;
  const meanClear = air > 0 ? (creature.glideBoutHeightIntegral ?? 0) / air : 0;
  const height = Math.min(creature.paraLaunchHeight ?? 0, 140);
  const peakX = creature.paraPeakX ?? creature.currentX;
  const backslide = Math.max(0, peakX - creature.currentX);
  const clear = creature.gapCleared ? 1 : 0;

  const leapiness = peak > 50 ? Math.max(0, peak / Math.max(18, meanClear) - 1.35) : 0;
  const leapPenalty = leapiness * peak * 0.85;
  const loftWithoutGlide =
    peak > 90 && corridorDist < 40 ? (peak - 90) * 1.2 + backslide * 0.8 : backslide * 0.55;
  const cruiseHeight = Math.min(meanClear, 120) * 1.1 + Math.min(height, 100) * 0.35;
  const distScore = openGlide * 2.8 + flyDist * 1.1;
  const corridorBonus =
    corridor * 5.5 +
    corridorDist * 4.5 +
    Math.pow(Math.max(0, streak - 40), 1.15) * 0.35;
  const clearBonus = clear * (50 + Math.min(200, corridorDist * 1.4));
  const forwardGate = Math.min(1, (openGlide + corridorDist) / 80);

  if (stage === 'runUp') return Math.min(flyDist, 40) * 0.05;
  if (stage === 'deploy') {
    return (
      distScore * 0.45 +
      cruiseHeight * 0.2 -
      leapPenalty * 0.5 -
      loftWithoutGlide * 0.4
    );
  }
  return (
    cruiseHeight * 0.55 * forwardGate +
    distScore * 1.35 +
    corridorBonus +
    clearBonus -
    leapPenalty -
    loftWithoutGlide
  );
}

/** Metric used for auto stage-advance bars. */
export function paraStageMetric(creature: Creature, stage: ParaPilotStage): number {
  if (stage === 'runUp') {
    // Binary lock-in: must clear the gap without falling. Speed alone cannot advance.
    if (creature.fellInPit || !creature.gapCleared) return 0;
    return 1;
  }
  if (stage === 'deploy') {
    return (creature.sailDeploySpeed ?? 0) * 4 + (creature.sailOpenGlideDist ?? 0) * 0.5;
  }
  // glide / eval: forward corridor distance, not loft-inflated fitness
  return (creature.glideCorridorDist ?? 0) * 2 + (creature.sailOpenGlideDist ?? 0);
}

export function maybeAdvanceParaStage(
  stage: ParaPilotStage,
  history: number[],
  generationBest: number
): { stage: ParaPilotStage; history: number[] } {
  if (stage === 'eval') return { stage, history };

  const nextHist = [...history, generationBest].slice(-PARA_STAGE_HISTORY_LEN);
  const bar = PARA_STAGE_BARS[stage];
  const clears = nextHist.filter(v => v >= bar).length;
  if (clears < PARA_STAGE_CLEAR_COUNT || nextHist.length < PARA_STAGE_CLEAR_COUNT) {
    return { stage, history: nextHist };
  }

  const order: ParaPilotStage[] = ['runUp', 'deploy', 'glide', 'eval'];
  const idx = order.indexOf(stage);
  const advanced = order[Math.min(order.length - 1, idx + 1)];
  return { stage: advanced, history: [] };
}

/** Count flexible + motor actuators for blend buffer sizing. */
export function countActuators(creature: Creature): number {
  let n = 0;
  for (const m of creature.muscles) {
    if (isBrainDrivenMuscle(m, creature.muscles)) n += 1;
  }
  for (const node of creature.nodes) {
    if (node.isMotorWheel) n += 1;
  }
  return n;
}

export function ensureParaPilot(creature: Creature, cloneGenome: (g: Genome) => Genome) {
  if (creature.paraPilot) return;
  creature.paraPilot = {
    runUp: cloneGenome(creature.genome),
    deploy: cloneGenome(creature.genome),
    glide: cloneGenome(creature.genome),
  };
  creature.paraPhase = 'runUp';
}

export function hasParaPilotBody(creature: { blueprint: { muscles: { aeroType?: string }[] } }) {
  return hasParaglider(creature.blueprint);
}

/** Clone a full ParaPilot package. */
export function cloneParaPilot(pilot: ParaPilot, cloneGenome: (g: Genome) => Genome): ParaPilot {
  return {
    runUp: cloneGenome(pilot.runUp),
    deploy: cloneGenome(pilot.deploy),
    glide: cloneGenome(pilot.glide),
  };
}

/**
 * Breed children for Para Ramp: crossover+mutate only the active head;
 * freeze prior heads from the fitter parent.
 */
export function breedParaPilotChild(
  parentA: Creature,
  parentB: Creature,
  stage: ParaPilotStage,
  mutateChild: (g: Genome) => Genome,
  cloneGenome: (g: Genome) => Genome,
  compatible: (g: Genome) => Genome
): { genome: Genome; paraPilot: ParaPilot } {
  const a = parentA.paraPilot ?? createParaPilot(parentA.genome, cloneGenome);
  const b = parentB.paraPilot ?? createParaPilot(parentB.genome, cloneGenome);
  const fitter = parentA.fitness >= parentB.fitness ? a : b;

  const child: ParaPilot = {
    runUp: cloneGenome(fitter.runUp),
    deploy: cloneGenome(fitter.deploy),
    glide: cloneGenome(fitter.glide),
  };

  const evolveKey: keyof ParaPilot =
    stage === 'deploy' ? 'deploy' : stage === 'glide' || stage === 'eval' ? 'glide' : 'runUp';

  // Eval still evolves glide lightly so the package can polish
  let evolved = crossover(
    a[evolveKey],
    b[evolveKey],
    parentA.fitness,
    parentB.fitness
  );
  evolved = mutateChild(evolved);
  evolved = compatible(evolved);
  child[evolveKey] = evolved;

  return { genome: child[evolveKey], paraPilot: child };
}

export function eliteParaPilot(
  parent: Creature,
  cloneGenome: (g: Genome) => Genome,
  compatible: (g: Genome) => Genome,
  stage: ParaPilotStage
): { genome: Genome; paraPilot: ParaPilot } {
  const pilot = parent.paraPilot
    ? cloneParaPilot(parent.paraPilot, cloneGenome)
    : createParaPilot(compatible(cloneGenome(parent.genome)), cloneGenome);
  const key: keyof ParaPilot =
    stage === 'deploy' ? 'deploy' : stage === 'glide' || stage === 'eval' ? 'glide' : 'runUp';
  pilot[key] = compatible(cloneGenome(pilot[key]));
  return { genome: pilot[key], paraPilot: pilot };
}
