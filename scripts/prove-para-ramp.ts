/**
 * Prove Para Ramp: reefed run-up must clear the pit, then deploy → glide.
 * Bodies: Jump Cart (speed reference) + Proven Glider (cart + sail).
 *
 * Run: npx tsx scripts/prove-para-ramp.ts
 */
import { spawnCreature, updateCreaturePhysics, generateObstacles, GROUND_Y } from '../src/physics';
import { createBaseGenome, cloneGenome } from '../src/neat';
import { CREATURE_TEMPLATES } from '../src/templates';
import { sailOpenness, hasParaglider } from '../src/aero';
import { createParaPilot } from '../src/types';
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
    goal: EvolutionGoal.PARA_RAMP_GLIDE,
    gravity: 0.4,
    groundFriction: 0.8,
    arena: { ...DEFAULT_ARENA_MODIFIERS, difficulty: 1 },
    customGoal: DEFAULT_CUSTOM_GOAL,
    paraPilotStage: 'eval',
    paraStageBestHistory: [],
  };
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

function meanVx(creature: Creature): number {
  let s = 0;
  for (const n of creature.nodes) s += n.x - n.oldX;
  return s / Math.max(1, creature.nodes.length);
}

function prove(blueprint: CreatureBlueprint): boolean {
  const io = genomeIOForBlueprint(blueprint);
  const genome = createBaseGenome(io.inputs, io.outputs);
  for (const c of genome.connections) c.weight = 0;

  const creature = spawnCreature(
    {
      id: `para_ramp_${blueprint.name}`,
      generation: 0,
      blueprint,
      genome,
      paraPilot: createParaPilot(genome, cloneGenome),
    },
    120,
    GROUND_Y - 50,
    EvolutionGoal.PARA_RAMP_GLIDE,
    1
  );

  const c = cfg();
  const obstacles = generateObstacles(EvolutionGoal.PARA_RAMP_GLIDE, c.arena);
  const ramp = obstacles.find(o => o.type === 'ramp' && o.label === 'TAKEOFF');
  if (!ramp) throw new Error('Missing TAKEOFF ramp');
  const pit = obstacles.find(o => o.type === 'pit');
  if (!pit) throw new Error('Missing pit after TAKEOFF ramp');

  let airFrames = 0;
  let takeoff = -1;
  let peakClr = 0;
  let glide = 0;
  let airStartX = 0;
  let hitRamp = false;
  let opened = false;
  const hasSail = hasParaglider(blueprint);

  for (let t = 0; t < 1400; t++) {
    const distToRamp = ramp.x - creature.currentX;
    const onRamp =
      creature.currentX >= ramp.x - 20 && creature.currentX <= ramp.x + ramp.width + 40;
    const cleared = !!creature.gapCleared;

    let sail = 0;
    let motor = 1;
    if (!cleared) {
      if (onRamp || distToRamp <= 80) hitRamp = true;
      sail = 0;
      motor = 1;
    } else {
      sail = hasSail ? 0.95 : 0;
      motor = 0.12;
      if (hasSail) opened = true;
    }

    updateCreaturePhysics(creature, obstacles, t, c, [], actuatorsFor(blueprint, sail, motor));

    const nowAir = fullyAirborne(creature, 6);
    const clr = Math.max(0, creature.startY - creature.currentY);
    if (nowAir) {
      if (takeoff < 0) {
        takeoff = t;
        airStartX = creature.currentX;
      }
      airFrames++;
      peakClr = Math.max(peakClr, clr);
      glide = Math.max(glide, creature.currentX - airStartX);
    }

    if (t % 50 === 0 || (takeoff >= 0 && airFrames <= 5)) {
      console.log(
        `[${blueprint.name}] t=${t} x=${creature.currentX.toFixed(0)} vx=${meanVx(creature).toFixed(2)} ` +
          `phase=${creature.paraPhase ?? '-'} open=${sailOpenness(creature).toFixed(2)} ` +
          `air=${nowAir} launchV=${(creature.paraLaunchSpeed ?? 0).toFixed(2)} ` +
          `fit=${creature.fitness.toFixed(0)} clear=${!!creature.gapCleared}`
      );
    }

    if (creature.gapCleared && creature.paraPhase && creature.paraPhase !== 'runUp') {
      if (creature.paraPhase === 'glide' && airFrames > 40) break;
      if (!hasSail && airFrames > 40) break;
    }
    if (creature.gapCleared && airFrames > 80) break;
    if (creature.fellInPit && t > (takeoff > 0 ? takeoff + 50 : 250)) break;
  }

  const launchV = creature.paraLaunchSpeed ?? 0;
  let ok = true;
  let reason = 'ok';
  if (!hitRamp && creature.currentX < ramp.x) {
    ok = false;
    reason = 'never reached ramp';
  } else if (!creature.gapCleared) {
    ok = false;
    reason = creature.fellInPit
      ? 'fell in pit before clearing gap'
      : `never cleared gap (x=${creature.currentX.toFixed(0)}, pitEnd=${(pit.x + pit.width).toFixed(0)})`;
  } else if (launchV < 8) {
    ok = false;
    reason = `launch speed ${launchV.toFixed(1)} too low for ballistic clear`;
  } else if (creature.paraPhase === 'runUp' || !creature.paraPhase) {
    ok = false;
    reason = 'phase never left runUp after gap clear';
  } else if (hasSail && !opened && sailOpenness(creature) < 0.5) {
    ok = false;
    reason = 'sail never opened after clear';
  }

  console.log(
    `[${blueprint.name}] RESULT ok=${ok} ${reason} air=${airFrames} glide=${glide.toFixed(0)} ` +
      `launchV=${launchV.toFixed(2)} peakClr=${peakClr.toFixed(1)} ` +
      `gapCleared=${!!creature.gapCleared} phase=${creature.paraPhase} fitness=${creature.fitness.toFixed(0)}`
  );
  return ok;
}

let failed = false;
for (const name of ['Jump Cart', 'Proven Glider'] as const) {
  const bp = CREATURE_TEMPLATES.find(t => t.name === name);
  if (!bp) throw new Error(`Missing template ${name}`);
  if (!prove(bp)) failed = true;
}
if (failed) {
  console.error('\nFAILED: Para Ramp run-up gap clear → deploy handoff');
  process.exit(1);
}
console.log('\nPASSED: Para Ramp run-up gap clear → deploy (Jump Cart + Proven Glider)');
