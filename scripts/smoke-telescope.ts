/**
 * D123 telescoping bone + complementary parallel-link smoke.
 * Run: npx tsx scripts/smoke-telescope.ts
 */
import { spawnCreature, updateCreaturePhysics, GROUND_Y } from '../src/physics';
import { createBaseGenome } from '../src/neat';
import { SOFT_BODY_PHYSICS_VERSION, telescopeCommandDeltaBudget } from '../src/physicsConstants';
import {
  Creature,
  CreatureBlueprint,
  EvolutionGoal,
  SimulationConfig,
  DEFAULT_ARENA_MODIFIERS,
  DEFAULT_CUSTOM_GOAL,
  genomeIOForBlueprint,
  countFlexibleMuscles,
  isBrainDrivenMuscle,
  isHardLengthSlave,
  resolveLinkKind,
} from '../src/types';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function baseConfig(): SimulationConfig {
  return {
    populationSize: 1,
    generationDuration: 600,
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

function strutBlueprint(opts: {
  hard?: 'bone' | 'telescope' | null;
  soft?: boolean;
  softStrength?: number;
}): CreatureBlueprint {
  const muscles: CreatureBlueprint['muscles'] = [];
  let id = 0;
  if (opts.hard) {
    muscles.push({
      id: id++,
      nodeA: 0,
      nodeB: 1,
      originalLength: 80,
      minLength: opts.hard === 'bone' ? 80 : 50,
      maxLength: opts.hard === 'bone' ? 80 : 110,
      strength: 1.0,
      phaseOffset: 0,
      linkKind: opts.hard,
    });
  }
  if (opts.soft) {
    muscles.push({
      id: id++,
      nodeA: 0,
      nodeB: 1,
      originalLength: 80,
      minLength: 50,
      maxLength: 110,
      strength: opts.softStrength ?? 0.6,
      phaseOffset: 0,
      linkKind: 'muscle',
    });
  }
  return {
    name: 'TelescopeSmoke',
    nodes: [
      { id: 0, mass: 1, radius: 10, friction: 0.5 },
      { id: 1, mass: 1, radius: 10, friction: 0.5 },
    ],
    muscles,
    relativePositions: [
      { x: -40, y: -40 },
      { x: 40, y: -40 },
    ],
  };
}

function spawnFrom(blueprint: CreatureBlueprint): Creature {
  const io = genomeIOForBlueprint(blueprint);
  const genome = createBaseGenome(io.inputs, io.outputs);
  for (const c of genome.connections) c.weight = 0;
  return spawnCreature(
    {
      id: 'telescope_smoke',
      generation: 0,
      blueprint,
      genome,
    },
    200,
    GROUND_Y - 80,
    EvolutionGoal.LOCOMOTION_RIGHT,
    1
  );
}

function linkLength(creature: Creature): number {
  const m = creature.muscles[0];
  const a = creature.nodes[m.nodeA];
  const b = creature.nodes[m.nodeB];
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function meanAbsLengthError(
  creature: Creature,
  frames: number,
  cfg: SimulationConfig,
  override: number[]
): number {
  let sum = 0;
  for (let i = 0; i < frames; i++) {
    updateCreaturePhysics(creature, [], i, cfg, [], override);
    const hard = creature.muscles.find(m => resolveLinkKind(m) !== 'muscle') ?? creature.muscles[0];
    const a = creature.nodes[hard.nodeA];
    const b = creature.nodes[hard.nodeB];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    sum += Math.abs(len - hard.targetLength);
  }
  return sum / frames;
}

function testActuatorCounting() {
  const boneOnly = strutBlueprint({ hard: 'bone' });
  assert(countFlexibleMuscles(boneOnly.muscles) === 0, 'fixed bone has 0 actuators');

  const telOnly = strutBlueprint({ hard: 'telescope' });
  assert(countFlexibleMuscles(telOnly.muscles) === 1, 'lone telescope has 1 actuator');
  assert(isBrainDrivenMuscle(telOnly.muscles[0], telOnly.muscles), 'lone telescope is brain-driven');

  const pair = strutBlueprint({ hard: 'bone', soft: true });
  // Soft promote: bone stays linkKind bone in this synthetic blueprint; physics
  // still slaves when hard+soft share a pair. Count must be 1 (soft only).
  assert(countFlexibleMuscles(pair.muscles) === 1, 'hard+soft pair has 1 actuator');
  const soft = pair.muscles.find(m => resolveLinkKind(m) === 'muscle')!;
  const hard = pair.muscles.find(m => resolveLinkKind(m) !== 'muscle')!;
  assert(isBrainDrivenMuscle(soft, pair.muscles), 'soft of pair is brain-driven');
  assert(!isBrainDrivenMuscle(hard, pair.muscles), 'hard of pair is not brain-driven');
  assert(isHardLengthSlave(hard as any, pair.muscles as any), 'hard is slave when soft present');

  const telSoft = strutBlueprint({ hard: 'telescope', soft: true });
  assert(countFlexibleMuscles(telSoft.muscles) === 1, 'telescope+soft pair has 1 actuator');
  console.log('ok actuator counting');
}

function testTelescopeHoldsCommand() {
  const cfg = baseConfig();
  const blueprint = strutBlueprint({ hard: 'telescope' });
  const creature = spawnFrom(blueprint);

  // Drive to max; allow enough frames for rate-limited travel.
  const span = 110 - 50;
  const settleFrames = Math.ceil(span / telescopeCommandDeltaBudget(50, 110)) + 40;
  for (let i = 0; i < settleFrames; i++) {
    updateCreaturePhysics(creature, [], i, cfg, [], [1]);
  }
  const lenMax = linkLength(creature);
  assert(Math.abs(lenMax - 110) < 4, `telescope max hold failed: len=${lenMax}`);

  for (let i = 0; i < settleFrames; i++) {
    updateCreaturePhysics(creature, [], settleFrames + i, cfg, [], [-1]);
  }
  const lenMin = linkLength(creature);
  assert(Math.abs(lenMin - 50) < 4, `telescope min hold failed: len=${lenMin}`);

  const err = meanAbsLengthError(creature, 30, cfg, [-1]);
  assert(err < 2.5, `telescope residual stretch too high: ${err}`);
  console.log(`ok telescope holds min/max (err=${err.toFixed(3)})`);
}

function testParallelSoftDrivesHard() {
  const cfg = baseConfig();
  const blueprint = strutBlueprint({ hard: 'telescope', soft: true });
  const creature = spawnFrom(blueprint);
  const span = 110 - 50;
  const settleFrames = Math.ceil(span / telescopeCommandDeltaBudget(50, 110)) + 40;
  for (let i = 0; i < settleFrames; i++) {
    updateCreaturePhysics(creature, [], i, cfg, [], [1]);
  }
  const hard = creature.muscles.find(m => resolveLinkKind(m) === 'telescope')!;
  const soft = creature.muscles.find(m => resolveLinkKind(m) === 'muscle')!;
  assert(
    Math.abs(hard.targetLength - soft.targetLength) < 0.01,
    'hard slave target must match soft'
  );
  const a = creature.nodes[hard.nodeA];
  const b = creature.nodes[hard.nodeB];
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  assert(Math.abs(len - 110) < 4, `paired telescope max hold failed: len=${len}`);
  console.log('ok parallel soft drives hard telescope');
}

function testSoftWeakerThanTelescope() {
  const cfg = baseConfig();
  // Heavy tip + light root: soft spring must leave residual stretch under gravity.
  const makeLoaded = (kind: 'muscle' | 'telescope', strength: number): CreatureBlueprint => ({
    name: 'LoadedStrut',
    nodes: [
      { id: 0, mass: 0.4, radius: 8, friction: 0.05 },
      { id: 1, mass: 8, radius: 14, friction: 0.05 },
    ],
    muscles: [
      {
        id: 0,
        nodeA: 0,
        nodeB: 1,
        originalLength: 80,
        minLength: 50,
        maxLength: 110,
        strength,
        phaseOffset: 0,
        linkKind: kind,
      },
    ],
    relativePositions: [
      { x: 0, y: -120 },
      { x: 0, y: -40 },
    ],
  });

  const softCreature = spawnFrom(makeLoaded('muscle', 0.45));
  const telCreature = spawnFrom(makeLoaded('telescope', 1.0));

  // Anchor the root by extreme mass so gravity stretches the tip against the link.
  softCreature.nodes[0].mass = 200;
  telCreature.nodes[0].mass = 200;

  for (let i = 0; i < 120; i++) {
    // Command mid-range hold (0 → normalized 0.5 → length 80)
    updateCreaturePhysics(softCreature, [], i, cfg, [], [0]);
    updateCreaturePhysics(telCreature, [], i, cfg, [], [0]);
  }
  const softLen = Math.hypot(
    softCreature.nodes[1].x - softCreature.nodes[0].x,
    softCreature.nodes[1].y - softCreature.nodes[0].y
  );
  const telLen = Math.hypot(
    telCreature.nodes[1].x - telCreature.nodes[0].x,
    telCreature.nodes[1].y - telCreature.nodes[0].y
  );
  const softErr = Math.abs(softLen - 80);
  const telErr = Math.abs(telLen - 80);
  assert(softErr > telErr + 4, `soft (${softErr}) should stretch more than telescope (${telErr})`);
  assert(telErr < softErr * 0.5, `telescope residual (${telErr}) should be clearly below soft (${softErr})`);
  console.log(`ok telescope beats soft stretch (tel=${telErr.toFixed(3)} soft=${softErr.toFixed(3)})`);
}

function testLegacyStiffRangeIsTelescope() {
  const orphan = {
    id: 0,
    nodeA: 0,
    nodeB: 1,
    originalLength: 65,
    minLength: 40,
    maxLength: 130,
    strength: 1.0,
    phaseOffset: 0,
  };
  assert(resolveLinkKind(orphan) === 'telescope', 'stiff variable span must infer telescope');
  assert(isBrainDrivenMuscle(orphan, [orphan]), 'inferred telescope must be brain-driven');
  assert(countFlexibleMuscles([orphan]) === 1, 'inferred telescope must count as actuator');
  console.log('ok legacy stiff range infers telescope');
}

function testPhysicsVersion() {
  assert(SOFT_BODY_PHYSICS_VERSION === '4.21.0', `expected physics 4.21.0 got ${SOFT_BODY_PHYSICS_VERSION}`);
  console.log('ok physics version 4.21.0');
}

function main() {
  testPhysicsVersion();
  testActuatorCounting();
  testLegacyStiffRangeIsTelescope();
  testTelescopeHoldsCommand();
  testParallelSoftDrivesHard();
  testSoftWeakerThanTelescope();
  console.log('smoke-telescope: all checks passed');
}

main();
