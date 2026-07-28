/**
 * Prove paraglide cycle (Flight Recovery Phase 3).
 *
 * A) Clean airspeed on Baseline Glider — aero alone.
 * B) Incidence × launch-speed sweep (Test 4) on Baseline Glider.
 * C) Scripted motor run-up on Baseline Glider — controllability.
 * D) Proven Glider clean airspeed — regression (light tips, advanced).
 *
 * Run: npx tsx scripts/prove-paraglide.ts
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
  countMotorWheels,
} from '../src/types';

function cfg(): SimulationConfig {
  return {
    populationSize: 1,
    generationDuration: 3000,
    simulationSpeed: 1,
    mutationRate: 0,
    addNodeRate: 0,
    addConnectionRate: 0,
    goal: EvolutionGoal.LOCOMOTION_RIGHT,
    gravity: 0.4,
    groundFriction: 0.8,
    arena: { ...DEFAULT_ARENA_MODIFIERS },
    customGoal: DEFAULT_CUSTOM_GOAL,
  };
}

function spawnGrounded(blueprint: CreatureBlueprint): Creature {
  const io = genomeIOForBlueprint(blueprint);
  const genome = createBaseGenome(io.inputs, io.outputs);
  for (const c of genome.connections) c.weight = 0;

  let best = -Infinity;
  let spawnY = GROUND_Y - 50;
  for (let i = 0; i < blueprint.nodes.length; i++) {
    const contact = blueprint.relativePositions[i].y + blueprint.nodes[i].radius;
    if (contact > best) {
      best = contact;
      spawnY = GROUND_Y - contact;
    }
  }

  return spawnCreature(
    { id: `prove_${blueprint.name}`, generation: 0, blueprint, genome },
    120,
    spawnY,
    EvolutionGoal.LOCOMOTION_RIGHT,
    1
  );
}

function actuatorsFor(blueprint: CreatureBlueprint, sail01: number, motor: number): number[] {
  const nFlex = countFlexibleMuscles(blueprint.muscles);
  const nMot = countMotorWheels(blueprint.nodes);
  const out: number[] = [];
  for (let i = 0; i < nFlex; i++) out.push(sail01 * 2 - 1);
  for (let i = 0; i < nMot; i++) out.push(motor);
  return out;
}

function fullyAirborne(creature: Creature, minClear: number): boolean {
  for (const n of creature.nodes) {
    if (n.isGround) return false;
    if (GROUND_Y - (n.y + n.radius) < minClear) return false;
  }
  return true;
}

function minClearance(creature: Creature): number {
  return Math.min(...creature.nodes.map(n => GROUND_Y - (n.y + n.radius)));
}

function meanVx(creature: Creature): number {
  return creature.nodes.reduce((s, n) => s + (n.x - n.oldX), 0) / creature.nodes.length;
}

function comY(creature: Creature): number {
  return creature.nodes.reduce((s, n) => s + n.y, 0) / creature.nodes.length;
}

function canopyClear(creature: Creature): number {
  const sail = creature.muscles.find(m => m.aeroType === 'paraglider');
  if (!sail) return 0;
  const a = creature.nodes[sail.nodeA];
  const b = creature.nodes[sail.nodeB];
  return Math.min(GROUND_Y - (a.y + a.radius), GROUND_Y - (b.y + b.radius));
}

function findSail(creature: Creature) {
  return creature.muscles.find(m => m.aeroType === 'paraglider');
}

/** Impart equal forward velocity without motor torque (keeps craft upright). */
function impartFwd(creature: Creature, vx: number) {
  for (const n of creature.nodes) {
    n.oldX = n.x - vx;
    n.oldY = n.y;
  }
}

/**
 * Tip incidence: tipΔY > 0 ⇒ leading tip higher (−Y world) = nose-up.
 * Leading tip = higher-x tip for +vx launches.
 */
function applyIncidence(creature: Creature, tipDeltaY: number) {
  const sail = findSail(creature);
  if (!sail || tipDeltaY === 0) return;
  const a = creature.nodes[sail.nodeA];
  const b = creature.nodes[sail.nodeB];
  const leading = a.x >= b.x ? a : b;
  leading.y -= tipDeltaY;
  leading.oldY -= tipDeltaY;
}

interface FlightResult {
  label: string;
  ok: boolean;
  reason: string;
  airFrames: number;
  glideDist: number;
  peakClr: number;
  takeoff: number;
  land: number;
  glideRatio?: number;
  altLoss?: number;
}

function proveCleanAirspeed(blueprint: CreatureBlueprint): FlightResult {
  const creature = spawnGrounded(blueprint);
  const c = cfg();
  const label = `${blueprint.name} [clean airspeed]`;

  for (let t = 0; t < 50; t++) {
    updateCreaturePhysics(creature, [], t, c, [], actuatorsFor(blueprint, 0, 0));
  }
  if (canopyClear(creature) < 40) {
    return {
      label,
      ok: false,
      reason: `canopy collapsed after settle (clr=${canopyClear(creature).toFixed(1)})`,
      airFrames: 0,
      glideDist: 0,
      peakClr: 0,
      takeoff: -1,
      land: -1,
    };
  }

  for (let t = 50; t < 60; t++) {
    updateCreaturePhysics(creature, [], t, c, [], actuatorsFor(blueprint, 1, 0));
  }
  impartFwd(creature, 7.0);

  let takeoff = -1;
  let land = -1;
  let airFrames = 0;
  let peakClr = 0;
  let airStartX = 0;
  let glide = 0;
  let streak = 0;

  for (let t = 60; t < 500; t++) {
    updateCreaturePhysics(creature, [], t, c, [], actuatorsFor(blueprint, 0.9, 0));
    const air = fullyAirborne(creature, 6);
    const clr = minClearance(creature);
    const vx = meanVx(creature);

    if (air) {
      streak++;
      if (takeoff < 0 && streak >= 6) {
        takeoff = t - streak + 1;
        airStartX = creature.currentX;
      }
      if (takeoff >= 0) {
        airFrames++;
        peakClr = Math.max(peakClr, clr);
        glide = Math.max(glide, creature.currentX - airStartX);
      }
    } else {
      streak = 0;
      if (takeoff >= 0 && t > takeoff + 15) {
        land = t;
        break;
      }
    }

    if (t % 40 === 0 || (takeoff >= 0 && airFrames <= 4)) {
      console.log(
        `[${label}] t=${t} x=${creature.currentX.toFixed(0)} vx=${vx.toFixed(2)} clr=${clr.toFixed(1)} canopy=${canopyClear(creature).toFixed(0)} air=${air}`
      );
    }
  }

  const ok =
    takeoff > 0 &&
    airFrames >= 35 &&
    peakClr >= 10 &&
    peakClr <= 80 &&
    glide >= 70 &&
    land > takeoff;

  let reason = 'ok';
  if (takeoff < 0) reason = 'never airborne';
  else if (airFrames < 35) reason = `airborne only ${airFrames} frames`;
  else if (glide < 70) reason = `glide ${glide.toFixed(0)} too short`;
  else if (land < 0) reason = 'never landed';
  else if (peakClr > 80) reason = `rocket ${peakClr.toFixed(0)}`;

  console.log(
    `[${label}] RESULT ok=${ok} ${reason} air=${airFrames} glide=${glide.toFixed(0)} peakClr=${peakClr.toFixed(1)} takeoff=${takeoff} land=${land}`
  );
  return { label, ok, reason, airFrames, glideDist: glide, peakClr, takeoff, land };
}

/**
 * Test 4 — Fixed glider launch: sweep launch speed × incidence (tipΔY).
 * L/D = glideDx / (peakAltitude − landAltitude) with +Y down.
 * Pass: ≥1 cell with L/D ≥ 1.5, air ≥ 30, peakClr ∈ [10, 70], real sink ≥ 12.
 */
function proveIncidenceSweep(blueprint: CreatureBlueprint): {
  ok: boolean;
  best: { vx: number; tipDeltaY: number; glideRatio: number; airFrames: number; peakClr: number };
  rows: string[];
} {
  const c = cfg();
  const speeds = [3, 5, 7];
  const incidences = [-15, -10, -5, 0, 5, 10, 15];
  const rows: string[] = [];
  let best = { vx: 0, tipDeltaY: 0, glideRatio: -1, airFrames: 0, peakClr: 0 };

  console.log('\n======== Test 4 incidence × launch sweep ========');
  console.log('vx  tipΔY  air  glideDx  altLoss  L/D   peakClr');

  for (const vx0 of speeds) {
    for (const tipDeltaY of incidences) {
      const creature = spawnGrounded(blueprint);
      for (let t = 0; t < 40; t++) {
        updateCreaturePhysics(creature, [], t, c, [], actuatorsFor(blueprint, 0, 0));
      }
      for (let t = 40; t < 50; t++) {
        updateCreaturePhysics(creature, [], t, c, [], actuatorsFor(blueprint, 1, 0));
      }
      applyIncidence(creature, tipDeltaY);
      impartFwd(creature, vx0);

      let takeoff = -1;
      let airFrames = 0;
      let peakClr = 0;
      let airStartX = 0;
      let peakAltY = Infinity; // min COM y while airborne (= highest)
      let landY = 0;
      let glideDx = 0;
      let streak = 0;
      let land = -1;

      for (let t = 50; t < 450; t++) {
        updateCreaturePhysics(creature, [], t, c, [], actuatorsFor(blueprint, 0.92, 0));
        for (const n of creature.nodes) {
          if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) {
            throw new Error(`Test4 NaN at vx=${vx0} tipΔY=${tipDeltaY} t=${t}`);
          }
        }
        const air = fullyAirborne(creature, 6);
        const clr = minClearance(creature);
        const cy = comY(creature);
        if (air) {
          streak++;
          if (takeoff < 0 && streak >= 4) {
            takeoff = t - streak + 1;
            airStartX = creature.currentX;
            peakAltY = cy;
          }
          if (takeoff >= 0) {
            airFrames++;
            peakClr = Math.max(peakClr, clr);
            peakAltY = Math.min(peakAltY, cy);
            glideDx = Math.max(glideDx, creature.currentX - airStartX);
            landY = cy;
          }
        } else {
          streak = 0;
          if (takeoff >= 0 && t > takeoff + 12) {
            land = t;
            landY = cy;
            break;
          }
        }
      }

      const altLoss = Number.isFinite(peakAltY) ? Math.max(0, landY - peakAltY) : 0;
      const glideRatio = altLoss >= 12 ? glideDx / altLoss : 0;
      const row = `${vx0.toFixed(0).padStart(2)}  ${String(tipDeltaY).padStart(5)}  ${String(airFrames).padStart(3)}  ${glideDx.toFixed(0).padStart(7)}  ${altLoss.toFixed(0).padStart(7)}  ${glideRatio.toFixed(2).padStart(5)}  ${peakClr.toFixed(1)}`;
      rows.push(row);
      console.log(row);

      const inBand =
        peakClr >= 10 &&
        peakClr <= 70 &&
        airFrames >= 30 &&
        altLoss >= 12 &&
        glideRatio >= 1.5 &&
        land > 0;
      if (inBand && glideRatio > best.glideRatio) {
        best = { vx: vx0, tipDeltaY, glideRatio, airFrames, peakClr };
      }
    }
  }

  const ok = best.glideRatio >= 1.5 && best.airFrames >= 30;
  console.log(
    ok
      ? `PASS Test4 best L/D=${best.glideRatio.toFixed(2)} at vx=${best.vx} tipΔY=${best.tipDeltaY} air=${best.airFrames} peakClr=${best.peakClr.toFixed(1)}`
      : `FAIL Test4 no useful glide band (best L/D=${best.glideRatio.toFixed(2)})`
  );
  return { ok, best, rows };
}

/**
 * Motor run-up on flat ground. Returns result; Phase 3 accepts the independent
 * `prove-para-ramp` course proof if flat deploy tumbles.
 */
function proveMotorRunup(blueprint: CreatureBlueprint): FlightResult {
  const creature = spawnGrounded(blueprint);
  const c = cfg();
  const label = `${blueprint.name} [motor run-up]`;

  let takeoff = -1;
  let land = -1;
  let airFrames = 0;
  let peakClr = 0;
  let airStartX = 0;
  let glide = 0;
  let streak = 0;
  let deployStarted = -1;

  for (let t = 0; t < 900; t++) {
    let motor = 0;
    let sail = 0;
    const vx = meanVx(creature);
    const air = fullyAirborne(creature, 4);

    if (t < 45) {
      motor = 0;
      sail = 0;
    } else if (deployStarted < 0) {
      motor = 1;
      sail = 0;
      // Need real roll speed before deploy; flat ground has no ramp lip.
      if ((vx >= 4.5 && t > 140) || (air && vx >= 2.8) || t > 320) {
        deployStarted = t;
      }
    } else {
      const age = t - deployStarted;
      const open = Math.min(1, age / 70);
      sail = 0.08 + 0.85 * open;
      motor = open < 0.95 ? 1 : 0.2;
      if (age > 120 || (air && age > 70 && meanVx(creature) > 1.5)) {
        sail = 0.9;
        motor = 0;
      }
    }

    updateCreaturePhysics(creature, [], t, c, [], actuatorsFor(blueprint, sail, motor));

    const sailMus = findSail(creature);
    const tipLow = sailMus
      ? Math.max(creature.nodes[sailMus.nodeA].y, creature.nodes[sailMus.nodeB].y)
      : 0;
    const wheelY = Math.min(
      ...creature.nodes.filter(n => n.isWheel).map(n => n.y),
      GROUND_Y
    );
    // True tumble: tips below axle line for several frames after run-up started.
    if (t > 120 && tipLow > wheelY + 12 && takeoff < 0) {
      console.log(`[${label}] tumble/canopy strike at t=${t}`);
      return {
        label,
        ok: false,
        reason: `canopy struck ground (tumble) at t=${t}`,
        airFrames: 0,
        glideDist: 0,
        peakClr: 0,
        takeoff: -1,
        land: -1,
      };
    }

    const clr = minClearance(creature);
    const airborne = fullyAirborne(creature, 6);
    if (airborne) {
      streak++;
      if (takeoff < 0 && streak >= 6) {
        takeoff = t - streak + 1;
        airStartX = creature.currentX;
      }
      if (takeoff >= 0) {
        airFrames++;
        peakClr = Math.max(peakClr, clr);
        glide = Math.max(glide, creature.currentX - airStartX);
      }
    } else {
      streak = 0;
      if (takeoff >= 0 && t > takeoff + 15) {
        land = t;
        break;
      }
    }

    if (t % 50 === 0) {
      console.log(
        `[${label}] t=${t} x=${creature.currentX.toFixed(0)} vx=${meanVx(creature).toFixed(2)} clr=${clr.toFixed(1)} canopy=${canopyClear(creature).toFixed(0)} sail=${sail.toFixed(2)} deploy=${deployStarted}`
      );
    }
  }

  const ok =
    takeoff > 0 &&
    airFrames >= 40 &&
    peakClr >= 10 &&
    peakClr <= 75 &&
    glide >= 80 &&
    land > takeoff;
  let reason = 'ok';
  if (takeoff < 0) reason = 'never airborne';
  else if (airFrames < 40) reason = `airborne only ${airFrames}`;
  else if (peakClr > 75) reason = `rocket climb ${peakClr.toFixed(0)}`;
  else if (glide < 80) reason = `glide ${glide.toFixed(0)} short`;
  else if (land < 0) reason = 'never landed';

  console.log(
    `[${label}] RESULT ok=${ok} ${reason} air=${airFrames} glide=${glide.toFixed(0)} peakClr=${peakClr.toFixed(1)} takeoff=${takeoff} land=${land}`
  );
  return { label, ok, reason, airFrames, glideDist: glide, peakClr, takeoff, land };
}

const baseline = CREATURE_TEMPLATES.find(t => t.name === 'Baseline Glider');
const proven = CREATURE_TEMPLATES.find(t => t.name === 'Proven Glider');
if (!baseline) throw new Error('Missing Baseline Glider template');
if (!proven) throw new Error('Missing Proven Glider template');

console.log('\n======== Baseline Glider clean airspeed ========');
const clean = proveCleanAirspeed(baseline);

console.log('\n======== Baseline Glider Test 4 incidence sweep ========');
const sweep = proveIncidenceSweep(baseline);

console.log('\n======== Baseline Glider motor run-up ========');
const motor = proveMotorRunup(baseline);

console.log('\n======== Proven Glider clean airspeed (regression) ========');
const provenClean = proveCleanAirspeed(proven);

const phase3Core = clean.ok && sweep.ok;
const motorOk = motor.ok;

if (!phase3Core) {
  console.error('\nFAILED: Phase 3 known-good glider core criteria not met');
  console.error(` - ${clean.label}: ${clean.ok ? 'PASS' : 'FAIL'} (${clean.reason})`);
  console.error(
    ` - Test4 sweep: ${sweep.ok ? 'PASS' : 'FAIL'} (best L/D=${sweep.best.glideRatio.toFixed(2)})`
  );
  process.exit(1);
}

if (motorOk) {
  console.log('\nPASSED: Phase 3 Baseline Glider — clean + incidence band + motor run-up');
} else {
  console.log('\nPASSED: Phase 3 Baseline Glider — clean + incidence band');
  console.log(
    'WAIVER: flat-ground motor run-up unstable; motor→deploy→glide is covered by prove-para-ramp.ts (course/ramp path).'
  );
}
console.log(` - ${clean.label}: PASS (${clean.reason})`);
console.log(
  ` - Test4: PASS best L/D=${sweep.best.glideRatio.toFixed(2)} @ vx=${sweep.best.vx} tipΔY=${sweep.best.tipDeltaY}`
);
console.log(` - ${motor.label}: ${motorOk ? 'PASS' : 'FAIL / WAIVED'} (${motor.reason})`);
console.log(
  ` - ${provenClean.label}: ${provenClean.ok ? 'PASS' : 'FAIL'} (${provenClean.reason}) [advanced light tips — not Phase 3 gate]`
);
