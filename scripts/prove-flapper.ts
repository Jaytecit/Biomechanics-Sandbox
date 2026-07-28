/**
 * Prove scripted Flapper net lift / reduced sink (Flight Recovery Phase 4 / Test 7).
 *
 * No NEAT. Sweep deterministic stroke waveforms on the Flapper template and
 * compare sink vs an inert muscle-hold drop under the same initial conditions.
 *
 * Run: npx tsx scripts/prove-flapper.ts
 */
import { spawnCreature, updateCreaturePhysics, GROUND_Y } from '../src/physics';
import { createBaseGenome } from '../src/neat';
import { CREATURE_TEMPLATES } from '../src/templates';
import {
  Creature,
  CreatureBlueprint,
  EvolutionGoal,
  SimulationConfig,
  DEFAULT_ARENA_MODIFIERS,
  DEFAULT_CUSTOM_GOAL,
  genomeIOForBlueprint,
  countFlexibleMuscles,
} from '../src/types';

/** Frames per trial after release. */
const TRIAL_FRAMES = 180;
/** Flapper must sink this much slower than inert (fraction of inert Δy). */
const SINK_IMPROVEMENT = 0.12;
/** Absolute minimum Δy gap (inert − flap) in px over the trial. */
const MIN_DY_GAP = 8;
/** Require this many distinct ICs to pass with the pinned reference stroke. */
const REQUIRED_ICS = 3;

/** Distinct drop ICs — clearance, launch vx, and tip incidence (not just spawn X). */
const INITIAL_CONDITIONS: Array<{
  id: number;
  clearance: number;
  launchVx: number;
  /** Tip Δy vs body (negative = tips higher). */
  tipDeltaY: number;
}> = [
  { id: 0, clearance: 160, launchVx: 0, tipDeltaY: -25 },
  { id: 1, clearance: 140, launchVx: 1.5, tipDeltaY: -20 },
  { id: 2, clearance: 180, launchVx: -1.2, tipDeltaY: -30 },
  { id: 3, clearance: 150, launchVx: 2.5, tipDeltaY: -18 },
  { id: 4, clearance: 170, launchVx: 0.8, tipDeltaY: -28 },
];

type StrokeKind =
  | 'hold'
  | 'sine_inphase'
  | 'sine_antiphase'
  | 'asymmetric_down'
  | 'square_power'
  | 'fast_contract';

interface StrokeParams {
  kind: StrokeKind;
  amp: number;
  omega: number;
  /** Foot actuator (−1…1); 0 = mid stance. */
  foot: number;
}

/** Pinned reference stroke (grid winner; reconstructable exit criterion). */
const REFERENCE_STROKE: StrokeParams = {
  kind: 'sine_inphase',
  amp: 0.55,
  omega: 0.4,
  foot: -0.35,
};

interface TrialResult {
  label: string;
  kind: StrokeKind;
  amp: number;
  omega: number;
  foot: number;
  seed: number;
  startY: number;
  endY: number;
  /** Positive = net descent (Y down). */
  dy: number;
  peakClr: number;
  minClr: number;
  airFrames: number;
  finite: boolean;
  /** Sum of −ΔCOM_y when COM rose (diagnostic). */
  upImpulse: number;
}

function cfg(): SimulationConfig {
  return {
    populationSize: 1,
    generationDuration: 4000,
    simulationSpeed: 1,
    mutationRate: 0,
    addNodeRate: 0,
    addConnectionRate: 0,
    goal: EvolutionGoal.FLIGHT_TIME,
    gravity: 0.4,
    groundFriction: 0.8,
    arena: { ...DEFAULT_ARENA_MODIFIERS },
    customGoal: DEFAULT_CUSTOM_GOAL,
  };
}

function flapperBlueprint(): CreatureBlueprint {
  const t = CREATURE_TEMPLATES.find(b => b.name === 'Flapper');
  if (!t) throw new Error('Missing Flapper template');
  return t;
}

function spawnAirborne(
  blueprint: CreatureBlueprint,
  ic: (typeof INITIAL_CONDITIONS)[number]
): Creature {
  const io = genomeIOForBlueprint(blueprint);
  const genome = createBaseGenome(io.inputs, io.outputs);
  for (const c of genome.connections) c.weight = 0;

  const spawnX = 140 + ic.id * 18;
  const lowestRel = Math.max(
    ...blueprint.relativePositions.map((p, i) => p.y + blueprint.nodes[i].radius)
  );
  const spawnY = GROUND_Y - ic.clearance - lowestRel;

  const creature = spawnCreature(
    { id: `prove_flapper_${ic.id}`, generation: 0, blueprint, genome },
    spawnX,
    spawnY,
    EvolutionGoal.FLIGHT_TIME,
    1
  );

  // Apply tip incidence + launch vx after spawn (body/foot stay; tips re-aimed).
  const body = creature.nodes[0];
  const tipL = creature.nodes[1];
  const tipR = creature.nodes[2];
  const span = 55;
  tipL.x = body.x - span;
  tipR.x = body.x + span;
  tipL.y = body.y + ic.tipDeltaY;
  tipR.y = body.y + ic.tipDeltaY;

  for (const n of creature.nodes) {
    n.oldX = n.x - ic.launchVx;
    n.oldY = n.y;
  }
  return creature;
}

function clamp1(v: number) {
  return Math.max(-1, Math.min(1, v));
}

/**
 * Map stroke waveform → flexible muscle outputs [wingL, wingR, foot].
 * Muscle map: −1 = minLength (folded), +1 = maxLength (extended).
 * Aero power stroke = commanded shortening (cmdDelta > 0) and/or tip descent.
 * Upstroke / recovery produces drag only (D114).
 */
function actuatorsAt(frame: number, p: StrokeParams, nFlex: number): number[] {
  const t = frame;
  const phase = t * p.omega;
  let wingL = 0;
  let wingR = 0;

  switch (p.kind) {
    case 'hold':
      wingL = 0;
      wingR = 0;
      break;
    case 'sine_inphase': {
      const s = p.amp * Math.sin(phase);
      wingL = s;
      wingR = s;
      break;
    }
    case 'sine_antiphase': {
      wingL = p.amp * Math.sin(phase);
      wingR = p.amp * Math.sin(phase + Math.PI);
      break;
    }
    case 'asymmetric_down': {
      // Fast contract (power), slow extend (recovery) — sawtooth on both wings.
      const u = ((phase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const duty = 0.35; // fraction of cycle spent contracting
      const cut = duty * Math.PI * 2;
      let w: number;
      if (u < cut) {
        // open → closed quickly
        w = p.amp * (1 - (2 * u) / cut);
      } else {
        // closed → open slowly
        w = p.amp * (-1 + (2 * (u - cut)) / (Math.PI * 2 - cut));
      }
      wingL = w;
      wingR = w;
      break;
    }
    case 'square_power': {
      const half = Math.sin(phase) >= 0 ? p.amp : -p.amp;
      wingL = half;
      wingR = half;
      break;
    }
    case 'fast_contract': {
      // Mostly extended; brief hard folds every period (impulsive downstroke).
      const u = ((phase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const pulse = u < 0.55 ? -p.amp : p.amp * 0.85;
      wingL = pulse;
      wingR = pulse;
      break;
    }
  }

  const out: number[] = [];
  if (nFlex >= 1) out.push(clamp1(wingL));
  if (nFlex >= 2) out.push(clamp1(wingR));
  if (nFlex >= 3) out.push(clamp1(p.foot));
  while (out.length < nFlex) out.push(0);
  return out;
}

function comY(c: Creature) {
  return c.nodes.reduce((s, n) => s + n.y, 0) / c.nodes.length;
}

function minClearance(c: Creature) {
  return Math.min(...c.nodes.map(n => GROUND_Y - (n.y + n.radius)));
}

function isFiniteCreature(c: Creature) {
  return c.nodes.every(
    n => Number.isFinite(n.x) && Number.isFinite(n.y) && Number.isFinite(n.oldX) && Number.isFinite(n.oldY)
  );
}

function runTrial(icId: number, params: StrokeParams): TrialResult {
  const blueprint = flapperBlueprint();
  const nFlex = countFlexibleMuscles(blueprint.muscles);
  const ic = INITIAL_CONDITIONS.find(c => c.id === icId);
  if (!ic) throw new Error(`Unknown IC ${icId}`);
  const creature = spawnAirborne(blueprint, ic);
  const config = cfg();
  const startY = comY(creature);
  let peakClr = minClearance(creature);
  let minClr = peakClr;
  let airFrames = 0;
  let upImpulse = 0;
  let prevY = startY;

  for (let i = 0; i < TRIAL_FRAMES; i++) {
    const acts = actuatorsAt(i, params, nFlex);
    updateCreaturePhysics(creature, [], i, config, [], acts);
    if (!isFiniteCreature(creature)) {
      return {
        label: `${params.kind} a=${params.amp} ω=${params.omega}`,
        kind: params.kind,
        amp: params.amp,
        omega: params.omega,
        foot: params.foot,
        seed: icId,
        startY,
        endY: comY(creature),
        dy: Infinity,
        peakClr,
        minClr: -Infinity,
        airFrames,
        finite: false,
        upImpulse,
      };
    }
    const y = comY(creature);
    if (y < prevY) upImpulse += prevY - y;
    prevY = y;
    const clr = minClearance(creature);
    peakClr = Math.max(peakClr, clr);
    minClr = Math.min(minClr, clr);
    if (clr > 4) airFrames += 1;
  }

  const endY = comY(creature);
  return {
    label: `${params.kind} a=${params.amp.toFixed(2)} ω=${params.omega.toFixed(3)} f=${params.foot}`,
    kind: params.kind,
    amp: params.amp,
    omega: params.omega,
    foot: params.foot,
    seed: icId,
    startY,
    endY,
    dy: endY - startY,
    peakClr,
    minClr,
    airFrames,
    finite: true,
    upImpulse,
  };
}

function buildGrid(): StrokeParams[] {
  const grid: StrokeParams[] = [];
  const amps = [0.55, 0.75, 0.95];
  const omegas = [0.12, 0.18, 0.28, 0.4];
  const feet = [0, -0.35];
  const kinds: StrokeKind[] = [
    'sine_inphase',
    'sine_antiphase',
    'asymmetric_down',
    'square_power',
    'fast_contract',
  ];
  for (const kind of kinds) {
    for (const amp of amps) {
      for (const omega of omegas) {
        for (const foot of feet) {
          grid.push({ kind, amp, omega, foot });
        }
      }
    }
  }
  return grid;
}

function beatsInert(flap: TrialResult, inert: TrialResult): boolean {
  if (!flap.finite || !inert.finite) return false;
  if (!Number.isFinite(flap.dy) || !Number.isFinite(inert.dy)) return false;
  const gap = inert.dy - flap.dy; // positive => flapper sank less
  const rel = gap / Math.max(1, inert.dy);
  return gap >= MIN_DY_GAP && rel >= SINK_IMPROVEMENT;
}

function main() {
  console.log('=== Prove Flapper (Phase 4 / Test 7) ===');
  console.log(
    `trialFrames=${TRIAL_FRAMES} improve≥${(SINK_IMPROVEMENT * 100).toFixed(0)}% gap≥${MIN_DY_GAP}px ICs=${INITIAL_CONDITIONS.length}`
  );
  console.log(
    `reference=${REFERENCE_STROKE.kind} amp=${REFERENCE_STROKE.amp} ω=${REFERENCE_STROKE.omega} foot=${REFERENCE_STROKE.foot}`
  );

  const icIds = INITIAL_CONDITIONS.map(c => c.id);
  const hold: StrokeParams = { kind: 'hold', amp: 0, omega: 0, foot: 0 };
  const inertByIc = new Map<number, TrialResult>();
  for (const id of icIds) {
    const inert = runTrial(id, hold);
    inertByIc.set(id, inert);
    const ic = INITIAL_CONDITIONS.find(c => c.id === id)!;
    console.log(
      `inert ic=${id} clr=${ic.clearance} vx=${ic.launchVx} tipΔY=${ic.tipDeltaY} dy=${inert.dy.toFixed(1)} air=${inert.airFrames} up=${inert.upImpulse.toFixed(2)}`
    );
  }

  // Exit criterion: pinned reference stroke must beat inert on ≥REQUIRED_ICS.
  const refPass: number[] = [];
  console.log('\nReference stroke vs inert:');
  for (const id of icIds) {
    const inert = inertByIc.get(id)!;
    const flap = runTrial(id, REFERENCE_STROKE);
    const gap = inert.dy - flap.dy;
    const rel = gap / Math.max(1, inert.dy);
    const ok = beatsInert(flap, inert);
    if (ok) refPass.push(id);
    console.log(
      `  ic=${id} inertDy=${inert.dy.toFixed(1)} flapDy=${flap.dy.toFixed(1)} gap=${gap.toFixed(1)} (${(rel * 100).toFixed(1)}%) air=${flap.airFrames} up=${flap.upImpulse.toFixed(2)} ${ok ? 'PASS' : 'fail'}`
    );
  }

  // Discovery grid (informational) — does not replace the pinned reference gate.
  const grid = buildGrid();
  console.log(`\nScanning ${grid.length} stroke configs × ${icIds.length} ICs (discovery)…`);

  type ScoreRow = {
    params: StrokeParams;
    passIcs: number[];
    meanGap: number;
    meanRel: number;
    meanDy: number;
    meanUp: number;
  };
  const scored: ScoreRow[] = [];

  for (const params of grid) {
    const passIcs: number[] = [];
    let gapSum = 0;
    let relSum = 0;
    let dySum = 0;
    let upSum = 0;
    let n = 0;
    for (const id of icIds) {
      const inert = inertByIc.get(id)!;
      const flap = runTrial(id, params);
      if (!flap.finite) continue;
      const gap = inert.dy - flap.dy;
      const rel = gap / Math.max(1, inert.dy);
      gapSum += gap;
      relSum += rel;
      dySum += flap.dy;
      upSum += flap.upImpulse;
      n += 1;
      if (beatsInert(flap, inert)) passIcs.push(id);
    }
    if (n === 0) continue;
    scored.push({
      params,
      passIcs,
      meanGap: gapSum / n,
      meanRel: relSum / n,
      meanDy: dySum / n,
      meanUp: upSum / n,
    });
  }

  scored.sort((a, b) => {
    if (b.passIcs.length !== a.passIcs.length) return b.passIcs.length - a.passIcs.length;
    return b.meanGap - a.meanGap;
  });

  console.log('Top 8 discovery strategies:');
  for (const row of scored.slice(0, 8)) {
    const p = row.params;
    console.log(
      `  ${p.kind.padEnd(16)} a=${p.amp.toFixed(2)} ω=${p.omega.toFixed(3)} foot=${p.foot.toFixed(2)} | pass=${row.passIcs.length}/${icIds.length} gap=${row.meanGap.toFixed(1)} rel=${(row.meanRel * 100).toFixed(1)}%`
    );
  }

  if (refPass.length < REQUIRED_ICS) {
    console.error(
      `\nFAIL Test 7 — reference stroke passed ${refPass.length}/${REQUIRED_ICS} required ICs.`
    );
    process.exit(1);
  }

  console.log(
    `\nPASS Test 7 — scripted Flapper (${REFERENCE_STROKE.kind}) beats inert sink by ≥${(SINK_IMPROVEMENT * 100).toFixed(0)}% and ≥${MIN_DY_GAP}px on ${refPass.length} ICs [${refPass.join(',')}] (D077).`
  );
}

main();
