/**
 * Smoke checks for wing / paraglider aero (no float, flap & airspeed required).
 * Run: npx tsx scripts/smoke-aero.ts
 */
import { applyWingForces, applyParagliderForces, applyParachuteForces, sampleChuteString } from '../src/aero';
import { spawnCreature, updateCreaturePhysics, GROUND_Y } from '../src/physics';
import { createBaseGenome } from '../src/neat';
import { CREATURE_TEMPLATES } from '../src/templates';
import {
  Creature,
  EvolutionGoal,
  SimulationConfig,
  DEFAULT_ARENA_MODIFIERS,
  DEFAULT_CUSTOM_GOAL,
  genomeIOForBlueprint,
  countFlexibleMuscles,
  PhysicsNode,
  PhysicsMuscle,
  CreatureBlueprint,
} from '../src/types';

function comY(nodes: PhysicsNode[]) {
  return nodes.reduce((s, n) => s + n.y, 0) / nodes.length;
}

function comX(nodes: PhysicsNode[]) {
  return nodes.reduce((s, n) => s + n.x, 0) / nodes.length;
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

/** Seed wing stroke accumulator so a single applyWingForces call is a power stroke. */
function seedDownstroke(muscle: Record<string, unknown>, tipRelY: number) {
  muscle._strokeAccum = 6;
  muscle._strokeDir = 1;
  muscle._strokeFrames = 5;
  muscle._prevTipRelY = tipRelY - 1;
  muscle._reversals = [0, 0, 0, 0, 0, 0, 0, 0];
}

function spawnTemplate(name: string): Creature {
  const aliases: Record<string, string> = {
    Flapper: 'RoboBird',
    'Para Cart': 'Glide Cart',
  };
  const resolved = aliases[name] ?? name;
  const template = CREATURE_TEMPLATES.find(t => t.name === resolved || t.name === name);
  if (!template) throw new Error(`Missing template ${name}`);
  const io = genomeIOForBlueprint(template);
  const genome = createBaseGenome(io.inputs, io.outputs);
  // Zero weights → mid-range muscle hold (no commanded flap)
  for (const c of genome.connections) c.weight = 0;
  return spawnCreature(
    {
      id: `smoke_${name}`,
      generation: 0,
      blueprint: template,
      genome,
    },
    100,
    GROUND_Y - 50,
    EvolutionGoal.LOCOMOTION_RIGHT,
    1
  );
}

function settle(creature: Creature, frames: number, cfg: SimulationConfig) {
  for (let i = 0; i < frames; i++) {
    updateCreaturePhysics(creature, [], i, cfg, []);
  }
}

/** Direct plate test: wing moving downward must get upward reaction. */
function testWingPlateDownstroke() {
  const a: PhysicsNode = {
    id: 0,
    mass: 1,
    radius: 8,
    friction: 0.2,
    color: '#fff',
    x: 0,
    y: 100,
    oldX: 0,
    oldY: 97, // moving down (+Y) at 3 px/frame
    vx: 0,
    vy: 0,
    isGround: false,
  };
  const b: PhysicsNode = {
    ...a,
    id: 1,
    x: 60,
    y: 100,
    oldX: 60,
    oldY: 97,
  };
  const creature = {
    nodes: [a, b],
    muscles: [
      {
        id: 0,
        nodeA: 0,
        nodeB: 1,
        originalLength: 60,
        minLength: 30,
        maxLength: 80,
        strength: 0.9,
        phaseOffset: 0,
        targetLength: 40,
        _prevTarget: 70,
        aeroType: 'wing' as const,
        aeroArea: 1,
      },
    ],
  } as unknown as Creature;

  seedDownstroke(creature.muscles[0] as unknown as Record<string, unknown>, 0);
  const yBefore = (a.y + b.y) / 2;
  applyWingForces(creature);
  const yAfter = (a.y + b.y) / 2;
  const lift = yBefore - yAfter; // positive = moved up
  if (lift < 0.05) {
    throw new Error(`Wing downstroke produced no upward reaction (lift=${lift.toFixed(4)})`);
  }
  console.log(`OK wing plate downstroke lift=${lift.toFixed(3)}`);
}

/** Upstroke / recovery must not invent upward lift (oscillation honesty). */
function testWingUpstrokeNoLift() {
  const a: PhysicsNode = {
    id: 0,
    mass: 1,
    radius: 8,
    friction: 0.2,
    color: '#fff',
    x: 0,
    y: 100,
    oldX: 0,
    oldY: 103, // moving up (−Y) at 3 px/frame
    vx: 0,
    vy: 0,
    isGround: false,
  };
  const b: PhysicsNode = {
    ...a,
    id: 1,
    x: 60,
    y: 100,
    oldX: 60,
    oldY: 103,
  };
  const creature = {
    nodes: [a, b],
    muscles: [
      {
        id: 0,
        nodeA: 0,
        nodeB: 1,
        originalLength: 60,
        minLength: 30,
        maxLength: 80,
        strength: 0.9,
        phaseOffset: 0,
        targetLength: 70, // lengthening = recovery
        _prevTarget: 40,
        aeroType: 'wing' as const,
        aeroArea: 1,
      },
    ],
  } as unknown as Creature;

  const yBefore = (a.y + b.y) / 2;
  applyWingForces(creature);
  const yAfter = (a.y + b.y) / 2;
  const lift = yBefore - yAfter; // positive = moved up
  if (lift > 0.02) {
    throw new Error(`Wing upstroke invented lift (lift=${lift.toFixed(4)})`);
  }
  console.log(`OK wing upstroke no lift (Δy=${(yAfter - yBefore).toFixed(4)})`);
}

/**
 * Per-wing lift: only the commanded downstroke wing gets a power impulse.
 * Asymmetric L/R authority remains for directional flight, but is weaker than
 * a matched pair stroke (D143 bird-like lift scale).
 */
function testAsymmetricWingLift() {
  const body: PhysicsNode = {
    id: 0,
    mass: 2.2,
    radius: 12,
    friction: 0.35,
    color: '#0ea5e9',
    x: 0,
    y: 200,
    oldX: 0,
    oldY: 200,
    vx: 0,
    vy: 0,
    isGround: false,
  };
  const tipL: PhysicsNode = {
    id: 1,
    mass: 0.9,
    radius: 8,
    friction: 0.2,
    color: '#38bdf8',
    x: -55,
    y: 175,
    oldX: -55,
    oldY: 172, // descending
    vx: 0,
    vy: 0,
    isGround: false,
  };
  const tipR: PhysicsNode = {
    ...tipL,
    id: 2,
    x: 55,
    oldX: 55,
    oldY: 175, // held — no stroke
  };
  const muscles = [
    {
      id: 0,
      nodeA: 0,
      nodeB: 1,
      originalLength: 55,
      minLength: 28,
      maxLength: 78,
      strength: 0.92,
      phaseOffset: 0,
      targetLength: 40,
      _prevTarget: 70, // left downstroke
      aeroType: 'wing' as const,
      aeroArea: 1,
    },
    {
      id: 1,
      nodeA: 0,
      nodeB: 2,
      originalLength: 55,
      minLength: 28,
      maxLength: 78,
      strength: 0.92,
      phaseOffset: 0,
      targetLength: 55,
      _prevTarget: 55, // right hold
      aeroType: 'wing' as const,
      aeroArea: 1,
    },
  ];
  const creature = {
    nodes: [body, tipL, tipR],
    muscles,
  } as unknown as Creature;

  seedDownstroke(muscles[0] as unknown as Record<string, unknown>, tipL.y - body.y);
  const yL0 = tipL.y;
  const yR0 = tipR.y;
  applyWingForces(creature);
  const dL = yL0 - tipL.y; // positive = tip lifted
  const dR = yR0 - tipR.y;
  if (dL < 0.05) {
    throw new Error(`Left downstroke produced no tip lift (dL=${dL.toFixed(4)})`);
  }
  if (dL < dR + 0.04) {
    throw new Error(
      `Expected left-only power stroke to dominate (dL=${dL.toFixed(4)} dR=${dR.toFixed(4)})`
    );
  }
  console.log(`OK asymmetric wing lift dL=${dL.toFixed(3)} dR=${dR.toFixed(3)}`);
}

/**
 * Matched L/R downstroke must produce more COM lift than a solo left stroke
 * under the same freestream (D143 bird-like symmetry).
 */
function testSymmetricWingLiftBest() {
  function makePair(both: boolean) {
    const body: PhysicsNode = {
      id: 0,
      mass: 2.2,
      radius: 12,
      friction: 0.35,
      color: '#0ea5e9',
      x: 0,
      y: 200,
      oldX: -1.2,
      oldY: 200,
      vx: 0,
      vy: 0,
      isGround: false,
    };
    const tipL: PhysicsNode = {
      id: 1,
      mass: 0.9,
      radius: 8,
      friction: 0.2,
      color: '#38bdf8',
      x: -55,
      y: 175,
      oldX: -55 - 1.2,
      oldY: 172,
      vx: 0,
      vy: 0,
      isGround: false,
    };
    const tipR: PhysicsNode = {
      ...tipL,
      id: 2,
      x: 55,
      oldX: 55 - 1.2,
      oldY: both ? 172 : 175,
    };
    const muscles = [
      {
        id: 0,
        nodeA: 0,
        nodeB: 1,
        originalLength: 55,
        minLength: 28,
        maxLength: 78,
        strength: 0.92,
        phaseOffset: 0,
        targetLength: 40,
        _prevTarget: 70,
        aeroType: 'wing' as const,
        aeroArea: 1,
      },
      {
        id: 1,
        nodeA: 0,
        nodeB: 2,
        originalLength: 55,
        minLength: 28,
        maxLength: 78,
        strength: 0.92,
        phaseOffset: 0,
        targetLength: both ? 40 : 55,
        _prevTarget: both ? 70 : 55,
        aeroType: 'wing' as const,
        aeroArea: 1,
      },
    ];
    seedDownstroke(muscles[0] as unknown as Record<string, unknown>, tipL.y - body.y);
    if (both) {
      seedDownstroke(muscles[1] as unknown as Record<string, unknown>, tipR.y - body.y);
    }
    return {
      nodes: [body, tipL, tipR],
      muscles,
    } as unknown as Creature;
  }

  const solo = makePair(false);
  const y0Solo = comY(solo.nodes);
  applyWingForces(solo);
  const liftSolo = y0Solo - comY(solo.nodes);

  const twin = makePair(true);
  const y0Twin = comY(twin.nodes);
  applyWingForces(twin);
  const liftTwin = y0Twin - comY(twin.nodes);

  if (liftTwin < 0.08) {
    throw new Error(`Symmetric downstroke produced weak COM lift (${liftTwin.toFixed(4)})`);
  }
  if (liftTwin < liftSolo * 1.2) {
    throw new Error(
      `Symmetric lift must beat solo (sym=${liftTwin.toFixed(4)} solo=${liftSolo.toFixed(4)})`
    );
  }
  if ((twin.wingSymFlapFrames ?? 0) < 1) {
    throw new Error('Symmetric stroke must credit wingSymFlapFrames');
  }
  console.log(
    `OK symmetric wing lift best sym=${liftTwin.toFixed(3)} solo=${liftSolo.toFixed(3)} birdFrames=${twin.wingSymFlapFrames}`
  );
}

/** Still canopy must not float. */
function testParaStillNoFloat() {
  const a: PhysicsNode = {
    id: 0,
    mass: 0.7,
    radius: 7,
    friction: 0.1,
    color: '#fff',
    x: 0,
    y: 100,
    oldX: 0,
    oldY: 100,
    vx: 0,
    vy: 0,
    isGround: false,
  };
  const b: PhysicsNode = { ...a, id: 1, x: 96, oldX: 96 };
  const creature = {
    nodes: [a, b],
    muscles: [
      {
        id: 0,
        nodeA: 0,
        nodeB: 1,
        originalLength: 96,
        minLength: 88,
        maxLength: 104,
        strength: 0.55,
        phaseOffset: 0,
        targetLength: 96,
        aeroType: 'paraglider' as const,
        aeroArea: 1.4,
      },
    ],
  } as unknown as Creature;
  const yBefore = (a.y + b.y) / 2;
  applyParagliderForces(creature);
  const yAfter = (a.y + b.y) / 2;
  if (Math.abs(yAfter - yBefore) > 1e-6) {
    throw new Error(`Still paraglider moved (dy=${(yAfter - yBefore).toFixed(4)}) — float bug`);
  }
  console.log('OK paraglider still → no force');
}

/** Forward airspeed on level canopy should produce upward lift. */
function testParaForwardLift() {
  const a: PhysicsNode = {
    id: 0,
    mass: 0.7,
    radius: 7,
    friction: 0.1,
    color: '#fff',
    x: 0,
    y: 100,
    oldX: -2.5, // vx = +2.5
    oldY: 100,
    vx: 0,
    vy: 0,
    isGround: false,
  };
  const b: PhysicsNode = { ...a, id: 1, x: 96, oldX: 96 - 2.5 };
  const creature = {
    nodes: [a, b],
    muscles: [
      {
        id: 0,
        nodeA: 0,
        nodeB: 1,
        originalLength: 96,
        minLength: 88,
        maxLength: 104,
        strength: 0.55,
        phaseOffset: 0,
        targetLength: 96,
        aeroType: 'paraglider' as const,
        aeroArea: 1.4,
      },
    ],
  } as unknown as Creature;
  const yBefore = (a.y + b.y) / 2;
  applyParagliderForces(creature);
  const yAfter = (a.y + b.y) / 2;
  const lift = yBefore - yAfter;
  if (lift < 0.02) {
    throw new Error(`Forward canopy produced insufficient lift (lift=${lift.toFixed(4)})`);
  }
  console.log(`OK paraglider forward lift=${lift.toFixed(3)}`);
}

/** Vertical / edge-on canopy must not float from forward speed alone. */
function testParaEdgeOnNoFloat() {
  // Canopy span is vertical — edge-on to horizontal freestream.
  const a: PhysicsNode = {
    id: 0,
    mass: 0.7,
    radius: 7,
    friction: 0.1,
    color: '#fff',
    x: 40,
    y: 40,
    oldX: 40 - 2.8,
    oldY: 40,
    vx: 0,
    vy: 0,
    isGround: false,
  };
  const b: PhysicsNode = {
    ...a,
    id: 1,
    x: 40,
    y: 130,
    oldX: 40 - 2.8,
    oldY: 130,
  };
  const creature = {
    nodes: [a, b],
    muscles: [
      {
        id: 0,
        nodeA: 0,
        nodeB: 1,
        originalLength: 90,
        minLength: 80,
        maxLength: 100,
        strength: 0.55,
        phaseOffset: 0,
        targetLength: 90,
        aeroType: 'paraglider' as const,
        aeroArea: 1.4,
      },
    ],
  } as unknown as Creature;
  const yBefore = (a.y + b.y) / 2;
  applyParagliderForces(creature);
  const dy = Math.abs((a.y + b.y) / 2 - yBefore);
  if (dy > 0.08) {
    throw new Error(`Edge-on paraglider floated (dy=${dy.toFixed(4)})`);
  }
  console.log(`OK paraglider edge-on no float dy=${dy.toFixed(4)}`);
}

/** Nose-up (leading tip higher) lifts more than nose-down at the same airspeed. */
function testParaPitchControlsClimb() {
  function makePitched(noseUp: boolean): Creature {
    // Travel +X; leading tip is the +X node. Nose-up → leading has smaller Y.
    const leadY = noseUp ? 88 : 112;
    const trailY = noseUp ? 112 : 88;
    const trail: PhysicsNode = {
      id: 0,
      mass: 0.7,
      radius: 7,
      friction: 0.1,
      color: '#fff',
      x: 0,
      y: trailY,
      oldX: -2.6,
      oldY: trailY,
      vx: 0,
      vy: 0,
      isGround: false,
    };
    const lead: PhysicsNode = {
      ...trail,
      id: 1,
      x: 90,
      y: leadY,
      oldX: 90 - 2.6,
      oldY: leadY,
    };
    return {
      nodes: [trail, lead],
      muscles: [
        {
          id: 0,
          nodeA: 0,
          nodeB: 1,
          originalLength: 95,
          minLength: 88,
          maxLength: 104,
          strength: 0.55,
          phaseOffset: 0,
          targetLength: 95,
          aeroType: 'paraglider' as const,
          aeroArea: 1.4,
        },
      ],
    } as unknown as Creature;
  }
  const up = makePitched(true);
  const down = makePitched(false);
  const upBefore = comY(up.nodes);
  const downBefore = comY(down.nodes);
  applyParagliderForces(up);
  applyParagliderForces(down);
  const liftUp = upBefore - comY(up.nodes);
  const liftDown = downBefore - comY(down.nodes);
  if (liftUp < liftDown + 0.01) {
    throw new Error(
      `Pitch tip-up should lift more than tip-down (up=${liftUp.toFixed(4)} down=${liftDown.toFixed(4)})`
    );
  }
  console.log(`OK paraglider pitch up=${liftUp.toFixed(3)} down=${liftDown.toFixed(3)}`);
}

/** Held flapper must not balloon upward over many frames. */
function testFlapperHoldNoFloat() {
  const cfg = baseConfig();
  const creature = spawnTemplate('Flapper');
  settle(creature, 90, cfg);
  // Hard-plant and clear stroke memory so the hold trial starts grounded,
  // not mid-tumble with a leftover power-stroke accumulator.
  for (const n of creature.nodes) {
    if (n.y + n.radius > GROUND_Y) {
      n.y = GROUND_Y - n.radius;
      n.oldY = n.y;
      n.oldX = n.x;
    }
    n.isGround = true;
  }
  for (const m of creature.muscles) {
    const wing = m as {
      _strokeAccum?: number;
      _strokeDir?: number;
      _strokeFrames?: number;
      _prevTipRelY?: number;
      _reversals?: number[];
    };
    wing._strokeAccum = 0;
    wing._strokeDir = 0;
    wing._strokeFrames = 0;
    wing._prevTipRelY = undefined;
    wing._reversals = [];
  }
  const startY = comY(creature.nodes);
  const peak = creature.highestY;
  for (let i = 0; i < 180; i++) {
    updateCreaturePhysics(creature, [], 90 + i, cfg, []);
  }
  const endY = comY(creature.nodes);
  const climb = startY - endY; // positive = rose
  if (climb > 2.5) {
    throw new Error(`Flapper floated while holding (climb=${climb.toFixed(1)}px)`);
  }
  const lowest = Math.max(...creature.nodes.map(n => n.y + n.radius));
  const clearance = GROUND_Y - lowest;
  if (clearance > 4) {
    throw new Error(`Flapper hovering (foot clearance=${clearance.toFixed(1)})`);
  }
  console.log(
    `OK flapper hold: climb=${climb.toFixed(1)} clearance=${clearance.toFixed(1)} peakY=${peak.toFixed(1)}`
  );
}

/**
 * Forced flap: alternate wing targets each frame via genome weight hacking is hard,
 * so drive tip motion by briefly yanking targets through the muscle fields between
 * physics calls… brain overwrites targets. Instead: apply muscle length changes
 * by manually oscillating after a custom step sequence on applyWingForces.
 */
function testForcedFlapProducesLift() {
  const body: PhysicsNode = {
    id: 0,
    mass: 2.2,
    radius: 12,
    friction: 0.35,
    color: '#0ea5e9',
    x: 0,
    y: 200,
    oldX: 0,
    oldY: 200,
    vx: 0,
    vy: 0,
    isGround: false,
  };
  const tipL: PhysicsNode = {
    id: 1,
    mass: 0.9,
    radius: 8,
    friction: 0.2,
    color: '#38bdf8',
    x: -55,
    y: 175,
    oldX: -55,
    oldY: 175,
    vx: 0,
    vy: 0,
    isGround: false,
  };
  const tipR: PhysicsNode = {
    ...tipL,
    id: 2,
    x: 55,
    oldX: 55,
  };
  const muscles = [
    {
      id: 0,
      nodeA: 0,
      nodeB: 1,
      originalLength: 55,
      minLength: 28,
      maxLength: 78,
      strength: 0.92,
      phaseOffset: 0,
      targetLength: 55,
      aeroType: 'wing' as const,
      aeroArea: 1,
    },
    {
      id: 1,
      nodeA: 0,
      nodeB: 2,
      originalLength: 55,
      minLength: 28,
      maxLength: 78,
      strength: 0.92,
      phaseOffset: 0,
      targetLength: 55,
      aeroType: 'wing' as const,
      aeroArea: 1,
    },
  ];
  const creature = {
    nodes: [body, tipL, tipR],
    muscles,
  } as unknown as Creature;

  let netLift = 0;
  for (let i = 0; i < 40; i++) {
    // Alternate close/open commands so the flap gate opens
    const closing = i % 2 === 0;
    for (const m of muscles) {
      (m as { _prevTarget?: number })._prevTarget = closing ? 70 : 40;
      m.targetLength = closing ? 40 : 70;
    }
    const stroke = closing ? 2.8 : -0.6;
    tipL.oldY = tipL.y - stroke;
    tipR.oldY = tipR.y - stroke;
    tipL.oldX = tipL.x;
    tipR.oldX = tipR.x;
    body.oldX = body.x;
    body.oldY = body.y;
    const yBefore = comY(creature.nodes);
    applyWingForces(creature);
    const yAfter = comY(creature.nodes);
    netLift += yBefore - yAfter;
  }
  if (netLift < 0.5) {
    throw new Error(`Forced flap net lift too low (${netLift.toFixed(3)})`);
  }
  console.log(`OK forced flap netLift=${netLift.toFixed(3)}`);
}

/** Para cart held on ground without motor drive should not levitate. */
function testParaCartNoFloat() {
  const cfg = baseConfig();
  const creature = spawnTemplate('Para Cart');
  settle(creature, 60, cfg);
  const startY = comY(creature.nodes);
  for (let i = 0; i < 120; i++) {
    updateCreaturePhysics(creature, [], 60 + i, cfg, []);
  }
  const climb = startY - comY(creature.nodes);
  if (climb > 1.5) {
    throw new Error(`Para Cart floated without speed (climb=${climb.toFixed(1)})`);
  }
  const wheelsOnGround = creature.nodes.filter(n => n.isWheel).every(n => n.isGround || n.y + n.radius >= GROUND_Y - 0.2);
  if (!wheelsOnGround && climb > 0.5) {
    throw new Error('Para Cart left ground without airspeed');
  }
  console.log(`OK para cart hold climb=${climb.toFixed(1)} x=${comX(creature.nodes).toFixed(1)}`);
}

/** Inject forward speed into a para cart — canopy should produce upward force on sail. */
function testParaCartAirspeedLiftsSail() {
  const cfg = baseConfig();
  const creature = spawnTemplate('Para Cart');
  settle(creature, 40, cfg);
  // Impart takeoff roll speed on every node
  for (const n of creature.nodes) {
    n.oldX = n.x - 2.2;
    n.oldY = n.y;
  }
  const sail = creature.muscles.find(m => m.aeroType === 'paraglider');
  if (!sail) throw new Error('No paraglider muscle');
  const a = creature.nodes[sail.nodeA];
  const b = creature.nodes[sail.nodeB];
  const yBefore = (a.y + b.y) / 2;
  applyParagliderForces(creature);
  const lift = yBefore - (a.y + b.y) / 2;
  if (lift < 0.05) {
    throw new Error(`Para cart sail did not lift under airspeed (lift=${lift.toFixed(4)})`);
  }
  console.log(`OK para cart airspeed sail lift=${lift.toFixed(3)}`);
}

/** Passive parachute: projected-area cup aero (horizontal inflates; vertical does not). */
function testParachuteAerodynamics() {
  function makeDropper(opts: {
    withChute: boolean;
    /** 'horizontal' span catches a fall; 'vertical' is edge-on to sink. */
    canopy: 'horizontal' | 'vertical';
  }): Creature {
    const horizontal = opts.canopy === 'horizontal';
    const nodes: PhysicsNode[] = horizontal
      ? [
          {
            id: 0,
            x: 100,
            y: 120,
            oldX: 100,
            oldY: 120,
            vx: 0,
            vy: 0,
            mass: 1.0,
            radius: 9,
            friction: 0.2,
            isGround: false,
          },
          {
            id: 1,
            x: 155,
            y: 120,
            oldX: 155,
            oldY: 120,
            vx: 0,
            vy: 0,
            mass: 1.0,
            radius: 9,
            friction: 0.2,
            isGround: false,
          },
          {
            id: 2,
            x: 127,
            y: 175,
            oldX: 127,
            oldY: 175,
            vx: 0,
            vy: 0,
            mass: 1.6,
            radius: 12,
            friction: 0.2,
            isGround: false,
          },
        ]
      : [
          {
            id: 0,
            x: 120,
            y: 100,
            oldX: 120,
            oldY: 100,
            vx: 0,
            vy: 0,
            mass: 1.0,
            radius: 9,
            friction: 0.2,
            isGround: false,
          },
          {
            id: 1,
            x: 120,
            y: 155,
            oldX: 120,
            oldY: 155,
            vx: 0,
            vy: 0,
            mass: 1.0,
            radius: 9,
            friction: 0.2,
            isGround: false,
          },
          {
            id: 2,
            x: 120,
            y: 200,
            oldX: 120,
            oldY: 200,
            vx: 0,
            vy: 0,
            mass: 1.6,
            radius: 12,
            friction: 0.2,
            isGround: false,
          },
        ];
    const span = horizontal ? 55 : 55;
    const muscles: PhysicsMuscle[] = [
      {
        id: 0,
        nodeA: 0,
        nodeB: 1,
        originalLength: span,
        minLength: Math.round(span * 0.72),
        maxLength: Math.round(span * 1.2),
        targetLength: Math.round(span * 1.2),
        strength: 0.45,
        phaseOffset: 0,
        ...(opts.withChute ? { aeroType: 'parachute' as const, aeroArea: 1.2 } : {}),
      },
      {
        id: 1,
        nodeA: 0,
        nodeB: 2,
        originalLength: Math.hypot(nodes[2].x - nodes[0].x, nodes[2].y - nodes[0].y),
        minLength: 40,
        maxLength: 40,
        targetLength: 40,
        strength: 1,
        phaseOffset: 0,
      },
      {
        id: 2,
        nodeA: 1,
        nodeB: 2,
        originalLength: Math.hypot(nodes[2].x - nodes[1].x, nodes[2].y - nodes[1].y),
        minLength: 40,
        maxLength: 40,
        targetLength: 40,
        strength: 1,
        phaseOffset: 0,
      },
    ];
    // Fix rigid riser lengths to match geometry
    muscles[1].originalLength = muscles[1].minLength = muscles[1].maxLength = muscles[1].targetLength =
      Math.round(Math.hypot(nodes[2].x - nodes[0].x, nodes[2].y - nodes[0].y));
    muscles[2].originalLength = muscles[2].minLength = muscles[2].maxLength = muscles[2].targetLength =
      Math.round(Math.hypot(nodes[2].x - nodes[1].x, nodes[2].y - nodes[1].y));

    const blueprint: CreatureBlueprint = {
      name: `${opts.withChute ? 'Chute' : 'Bare'} ${opts.canopy}`,
      nodes: nodes.map(({ id, mass, radius, friction }) => ({
        id,
        mass,
        radius,
        friction,
      })),
      muscles: muscles.map(m => ({
        id: m.id,
        nodeA: m.nodeA,
        nodeB: m.nodeB,
        originalLength: m.originalLength,
        minLength: m.minLength,
        maxLength: m.maxLength,
        strength: m.strength,
        phaseOffset: m.phaseOffset,
        aeroType: m.aeroType,
        aeroArea: m.aeroArea,
      })),
      relativePositions: nodes.map(n => ({ x: n.x - 120, y: n.y - 140 })),
    };
    if (opts.withChute) {
      const brainActs = countFlexibleMuscles(blueprint.muscles);
      if (brainActs !== 0) {
        throw new Error(`Parachute should not consume brain outputs (got ${brainActs})`);
      }
    }
    const io = genomeIOForBlueprint(blueprint);
    const genome = createBaseGenome(io.inputs, io.outputs);
    for (const c of genome.connections) c.weight = 0;
    return spawnCreature(
      {
        id: `smoke_chute_${opts.canopy}_${opts.withChute}`,
        generation: 0,
        blueprint,
        genome,
      },
      120,
      140,
      EvolutionGoal.LOCOMOTION_RIGHT,
      1
    );
  }

  function liftAndDrop(c: Creature) {
    for (const n of c.nodes) {
      n.y -= 200;
      n.oldY = n.y - 2.0;
      n.oldX = n.x;
      n.isGround = false;
    }
  }

  const cfg = baseConfig();

  // --- Horizontal canopy: inflate and slow the fall ---
  const bare = makeDropper({ withChute: false, canopy: 'horizontal' });
  const chute = makeDropper({ withChute: true, canopy: 'horizontal' });
  liftAndDrop(bare);
  liftAndDrop(chute);
  const startBare = comY(bare.nodes);
  const startChute = comY(chute.nodes);
  for (let i = 0; i < 70; i++) {
    updateCreaturePhysics(bare, [], i, cfg, []);
    updateCreaturePhysics(chute, [], i, cfg, []);
  }
  const sinkBare = comY(bare.nodes) - startBare;
  const sinkChute = comY(chute.nodes) - startChute;
  if (sinkChute >= sinkBare * 0.75) {
    throw new Error(
      `Horizontal chute did not slow descent (chute=${sinkChute.toFixed(1)} bare=${sinkBare.toFixed(1)})`
    );
  }
  if (sinkChute < 1) {
    throw new Error(`Horizontal chute floated (sink=${sinkChute.toFixed(1)})`);
  }
  const canopyY = (chute.nodes[0].y + chute.nodes[1].y) / 2;
  const payloadY = chute.nodes[2].y;
  if (canopyY > payloadY - 0.8) {
    throw new Error(
      `Canopy did not settle above payload (canopyY=${canopyY.toFixed(1)} payloadY=${payloadY.toFixed(1)})`
    );
  }
  const inflated = chute.muscles[0]._chuteInflation ?? 0;
  if (inflated < 0.25) {
    throw new Error(`Horizontal chute failed to inflate (inflation=${inflated.toFixed(2)})`);
  }
  console.log(
    `OK chute horizontal sink=${sinkChute.toFixed(1)} bare=${sinkBare.toFixed(1)} ratio=${(
      sinkChute / Math.max(1, sinkBare)
    ).toFixed(2)} inflate=${inflated.toFixed(2)} hang=${(payloadY - canopyY).toFixed(1)}`
  );

  // --- Vertical canopy: edge-on to sink → little capture / no buoyancy ---
  const vertBare = makeDropper({ withChute: false, canopy: 'vertical' });
  const vertChute = makeDropper({ withChute: true, canopy: 'vertical' });
  liftAndDrop(vertBare);
  liftAndDrop(vertChute);
  const vStartBare = comY(vertBare.nodes);
  const vStartChute = comY(vertChute.nodes);
  for (let i = 0; i < 55; i++) {
    updateCreaturePhysics(vertBare, [], i, cfg, []);
    updateCreaturePhysics(vertChute, [], i, cfg, []);
  }
  const vSinkBare = comY(vertBare.nodes) - vStartBare;
  const vSinkChute = comY(vertChute.nodes) - vStartChute;
  // Must remain comparable to freefall — vertical cup must not act like a balloon.
  if (vSinkChute < vSinkBare * 0.55) {
    throw new Error(
      `Vertical chute incorrectly buoyant (chute=${vSinkChute.toFixed(1)} bare=${vSinkBare.toFixed(1)})`
    );
  }
  const vInflate = vertChute.muscles[0]._chuteInflation ?? 0;
  if (vInflate > 0.45) {
    throw new Error(`Vertical chute stayed inflated edge-on (inflation=${vInflate.toFixed(2)})`);
  }
  console.log(
    `OK chute vertical sink=${vSinkChute.toFixed(1)} bare=${vSinkBare.toFixed(1)} ratio=${(
      vSinkChute / Math.max(1, vSinkBare)
    ).toFixed(2)} inflate=${vInflate.toFixed(2)}`
  );

  // String shape: limp ≈ straight chord; inflated bows into a dome.
  const limp = sampleChuteString(0, 0, 100, 0, 0, 0, -1, 90, 12);
  const open = sampleChuteString(0, 0, 100, 0, 1, 0, -1, 90, 12);
  const limpBow = Math.max(...limp.map(p => Math.abs(p.y)));
  const openBow = Math.max(...open.map(p => Math.abs(p.y)));
  if (limpBow > 3) {
    throw new Error(`Limp chute string not straight (bow=${limpBow.toFixed(2)})`);
  }
  if (openBow < limpBow * 8) {
    throw new Error(`Inflated chute string did not dome (limp=${limpBow.toFixed(2)} open=${openBow.toFixed(2)})`);
  }
  console.log(`OK chute string limpBow=${limpBow.toFixed(2)} openBow=${openBow.toFixed(1)}`);
}

function main() {
  testWingPlateDownstroke();
  testWingUpstrokeNoLift();
  testAsymmetricWingLift();
  testSymmetricWingLiftBest();
  testParaStillNoFloat();
  testParaForwardLift();
  testParaEdgeOnNoFloat();
  testParaPitchControlsClimb();
  testForcedFlapProducesLift();
  testFlapperHoldNoFloat();
  testParaCartNoFloat();
  testParaCartAirspeedLiftsSail();
  testParachuteAerodynamics();
  console.log('All aero smoke checks passed.');
}

main();
