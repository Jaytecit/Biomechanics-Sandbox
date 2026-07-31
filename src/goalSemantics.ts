import { EvolutionGoal } from './types';
import { GOAL_ORDER } from './goalCatalog';

export type GoalDecision = 'keep' | 'reshape' | 'rename' | 'remove';
export interface GoalSemanticDecision {
  goal: EvolutionGoal;
  decision: GoalDecision;
  geometry: string;
  requirements: string;
  success: string;
  failure: string;
  shortcutAudit: string;
  rationale2d: string;
}

const flat = (goal: EvolutionGoal, success: string): GoalSemanticDecision => ({
  goal, decision: 'keep', geometry: 'Flat side-on ground', requirements: 'Any mechanically valid body',
  success, failure: 'No relevant physical progress', shortcutAudit: 'In-place thrashing is gated by travel/support',
  rationale2d: 'Longitudinal motion and posture are fully observable in side view.',
});
const jump = (goal: EvolutionGoal, success: string): GoalSemanticDecision => ({
  goal, decision: 'keep', geometry: 'Flat runway with goal marker when required',
  requirements: 'At least one flexible actuator; no aero for jump classification', success,
  failure: 'No supported takeoff or no supported landing where required',
  shortcutAudit: 'Flight bodies are ineligible; clearance below ~18% body height and ground thrashing do not count as a jump',
  rationale2d: 'Takeoff, clearance, travel, rotation, and landing are physical 2D events.',
});
const flight = (goal: EvolutionGoal, success: string, geometry = 'Open side-on airspace'): GoalSemanticDecision => ({
  goal, decision: 'keep', geometry, requirements: 'Wing, paraglider, or passive chute as appropriate',
  success, failure: 'No sustained fully-airborne response above body-scaled min clearance',
  shortcutAudit: 'Ground rolling, skimming, and hops below ~½ body height are gated out before any flight reward',
  rationale2d: 'Altitude, airspeed, glide, rotation, and landing are valid planar-flight measures.',
});

export const GOAL_SEMANTIC_DECISIONS: Record<EvolutionGoal, GoalSemanticDecision> = {
  [EvolutionGoal.LOCOMOTION_RIGHT]: flat(
    EvolutionGoal.LOCOMOTION_RIGHT,
    'Discrete swing-gated steps toward +X; step points dominate'
  ),
  [EvolutionGoal.LOCOMOTION_LEFT]: flat(
    EvolutionGoal.LOCOMOTION_LEFT,
    'Discrete swing-gated steps toward −X; step points dominate'
  ),
  [EvolutionGoal.SHUFFLE_RIGHT]: flat(
    EvolutionGoal.SHUFFLE_RIGHT,
    'Body travel + oscillation-plant co-progress toward +X; vibration allowed'
  ),
  [EvolutionGoal.SHUFFLE_LEFT]: flat(
    EvolutionGoal.SHUFFLE_LEFT,
    'Body travel + oscillation-plant co-progress toward −X; vibration allowed'
  ),
  [EvolutionGoal.SPEED]: flat(EvolutionGoal.SPEED, 'Peak speed plus real displacement'),
  [EvolutionGoal.SPRINT_FINISH]: { ...flat(EvolutionGoal.SPRINT_FINISH, 'Ordered checkpoint contacts then finish crossing'), geometry: 'Flat track, ordered checkpoints, finish' },
  [EvolutionGoal.ROUGH_TERRAIN_TRAVERSE]: {
    ...flat(EvolutionGoal.ROUGH_TERRAIN_TRAVERSE, 'Cross every ordered marker on seeded rough terrain and finish with support'),
    geometry: 'Seeded rolling terrain with ordered checkpoints and finish',
    failure: 'Missing ordered supported checkpoint or unsupported finish',
    shortcutAudit: 'Endpoint travel, airborne bypass, skipped markers, and shaping-only progress cannot earn completion',
  },
  [EvolutionGoal.STAY_UPRIGHT]: flat(EvolutionGoal.STAY_UPRIGHT, 'Sustained tall supported posture'),
  [EvolutionGoal.HIGH_JUMP]: jump(EvolutionGoal.HIGH_JUMP, 'Isolated jump; peak clearance of the lowest anatomical point'),
  [EvolutionGoal.CLEAR_BAR]: { ...jump(EvolutionGoal.CLEAR_BAR, 'Whole rigid hull clears the bar during an isolated jump'), geometry: 'Runway, uprights, solid crossbar' },
  [EvolutionGoal.JUMP_LAND_UPRIGHT]: jump(EvolutionGoal.JUMP_LAND_UPRIGHT, 'One isolated jump, upright supported landing near takeoff'),
  [EvolutionGoal.LONG_JUMP]: jump(EvolutionGoal.LONG_JUMP, 'Best isolated all-points-off bout of rightward airborne travel'),
  [EvolutionGoal.JUMP_HANG_TIME]: jump(EvolutionGoal.JUMP_HANG_TIME, 'Longest isolated all-points-off bout; hop chains score 0'),
  [EvolutionGoal.JUMP_LEFT]: jump(EvolutionGoal.JUMP_LEFT, 'Best isolated all-points-off bout of leftward airborne travel'),
  [EvolutionGoal.JUMP_SPEED]: jump(EvolutionGoal.JUMP_SPEED, 'Peak physical speed during an isolated jump'),
  [EvolutionGoal.JUMP_ACROBATICS]: jump(EvolutionGoal.JUMP_ACROBATICS, 'Best isolated clearance-gated airborne rotation bout'),
  [EvolutionGoal.HOP_RIGHT]: jump(EvolutionGoal.HOP_RIGHT, 'Accumulated rightward travel across hop-chain bouts'),
  [EvolutionGoal.HOP_LEFT]: jump(EvolutionGoal.HOP_LEFT, 'Accumulated leftward travel across hop-chain bouts'),
  [EvolutionGoal.HOP_SPEED]: jump(EvolutionGoal.HOP_SPEED, 'Peak speed during hop-chain locomotion'),
  [EvolutionGoal.STAIR_CLIMB]: { ...flat(EvolutionGoal.STAIR_CLIMB, 'Supported contact on successively higher treads'), geometry: 'Deterministic tread/riser staircase' },
  [EvolutionGoal.OBSTACLE_CLIMB]: { ...flat(EvolutionGoal.OBSTACLE_CLIMB, 'Stable supported contact on authored box tops in course order'), geometry: 'Seeded boxes and stepped platforms', failure: 'No ordered authored box-top mount evidence', shortcutAudit: 'Free jumps, ground bypasses, user boxes, and out-of-order landings score no progress' },
  [EvolutionGoal.BALANCE_BEAM]: { ...flat(EvolutionGoal.BALANCE_BEAM, 'Continuous authored-beam support accumulates travel and posture before far-end completion'), geometry: 'Thin elevated beam over pit', failure: 'No continuous beam-supported traversal', shortcutAudit: 'Endpoint travel, beam bypass, airborne leaps, and final-pose posture score no traversal' },
  [EvolutionGoal.CARRY_BALL]: { ...flat(EvolutionGoal.CARRY_BALL, 'Ball is transported rightward through a continuous direct-contact chain; lift counts only during transport'), geometry: 'Flat ground and private dynamic ball', failure: 'No collision-proven lifted transport', shortcutAudit: 'Proximity, stationary contact, uncontacted motion, and post-release travel score no carry progress' },
  [EvolutionGoal.PUSH_BOX]: { ...flat(EvolutionGoal.PUSH_BOX, 'Private crate moves while creature remains in contact range'), geometry: 'Flat ground and private dynamic crate' },
  [EvolutionGoal.MOTOR_DRIVE]: flat(EvolutionGoal.MOTOR_DRIVE, 'Powered-wheel supported displacement'),
  [EvolutionGoal.MOTOR_RAMP]: { ...flat(EvolutionGoal.MOTOR_RAMP, 'Powered-wheel supported ascent on swept ramp surface'), geometry: 'Triangular incline with solid end cap', requirements: 'At least one powered wheel' },
  [EvolutionGoal.MOTOR_ICE]: { ...flat(EvolutionGoal.MOTOR_ICE, 'Powered-wheel travel across low-friction zones'), geometry: 'Flat track with ice surface zones', requirements: 'At least one powered wheel' },
  [EvolutionGoal.MOTOR_GAP]: { ...flat(EvolutionGoal.MOTOR_GAP, 'Leave near-side support, clear pit, regain far-side support'), geometry: 'Pit with physical lips and far landing surface', requirements: 'Powered wheel launch body', failure: 'Any rigid hull falls below pit threshold' },
  [EvolutionGoal.MOTOR_LAUNCH_LAND]: { ...flat(EvolutionGoal.MOTOR_LAUNCH_LAND, 'Gap clear followed by both motor wheels supported on LAND pad'), geometry: 'Ramp, pit, thin landing pad', requirements: 'Two powered wheels', failure: 'Pit fall, belly landing, or one-wheel landing' },
  [EvolutionGoal.MOTOR_LOOP]: { ...flat(EvolutionGoal.MOTOR_LOOP, 'Grounded hoop rolling distance across seeded terrain'), geometry: 'Private containment hoop and seeded terrain', requirements: 'Body eligible for hoop containment' },
  [EvolutionGoal.MOTOR_HURDLES]: { ...flat(EvolutionGoal.MOTOR_HURDLES, 'Whole rigid hull clears each solid hurdle in order'), decision: 'reshape', geometry: 'Solid hurdles and finish', requirements: 'Motor body capable of supported launch' },
  [EvolutionGoal.MOTOR_LANDSPEED]: { ...flat(EvolutionGoal.MOTOR_LANDSPEED, 'Peak speed while physically supported'), requirements: 'At least one powered wheel' },
  [EvolutionGoal.MOTOR_BRIDGE]: {
    ...flat(EvolutionGoal.MOTOR_BRIDGE, 'Retired legacy score path only'),
    decision: 'remove',
    geometry: 'Legacy elevated bridge over pit',
    requirements: 'Not selectable',
    failure: 'No distinct behaviour from flat-ground driving in strict side view',
    shortcutAudit: 'R4 retained the failed learned-policy seeds and retired the redundant goal',
    rationale2d: 'With no lateral axis or dynamic bridge physics, supported traversal is ordinary longitudinal driving.',
  },
  [EvolutionGoal.MOTOR_SLALOM]: { ...flat(EvolutionGoal.MOTOR_SLALOM, 'Cross ordered checkpoints with support, then cross the gated finish with support'), geometry: 'Inclines, drops, narrow pads, riser, checkpoints', requirements: 'Powered wheel body', failure: 'Missing checkpoint or unsupported finish', shortcutAudit: 'Endpoint travel, checkpoint bypass, and unsupported finish cannot earn completion; supported travel shaping is bounded below one checkpoint', rationale2d: 'Renamed Motor Technical Course; every action is planar and visible.' },
  [EvolutionGoal.PARKING_ZONE]: { ...flat(EvolutionGoal.PARKING_ZONE, 'Whole body supported inside bay while slow and upright'), geometry: 'Marked physical bay' },
  [EvolutionGoal.HIT_TARGET]: { ...flat(EvolutionGoal.HIT_TARGET, 'Private ball physically contacts each bullseye'), geometry: 'Private ball and target circles' },
  [EvolutionGoal.KICK_GOAL]: { ...flat(EvolutionGoal.KICK_GOAL, 'Private ball enters goal mouth after physical contact'), geometry: 'Private ball, solid posts/crossbar, net volume' },
  [EvolutionGoal.BOWLING_PINS]: { ...flat(EvolutionGoal.BOWLING_PINS, 'Body-ram private pins off their supported start poses (Pin Smash — not chain-reaction bowling)'), geometry: 'Flat lane and private dynamic pins' },
  [EvolutionGoal.DODGEBALL]: { ...flat(EvolutionGoal.DODGEBALL, 'Cross authored static hazards in course order, then reach the finish with support'), geometry: 'Ordered static hazard pads and finish', failure: 'Missing ordered hazard crossings or unsupported finish', shortcutAudit: 'Camping and final-position bypass earn no section or finish credit; upright shaping accrues only with new rightward progress' },
  [EvolutionGoal.FLIGHT_TIME]: flight(EvolutionGoal.FLIGHT_TIME, 'Best single fully-airborne bout; any ground contact ends the attempt'),
  [EvolutionGoal.FLIGHT_HEIGHT]: flight(EvolutionGoal.FLIGHT_HEIGHT, 'Best sustained aero-climb bout: cruise altitude under a flight gate, with flap-powered post-takeoff climb'),
  [EvolutionGoal.FLIGHT_RIGHT]: flight(EvolutionGoal.FLIGHT_RIGHT, 'Best single sustained rightward airborne bout'),
  [EvolutionGoal.FLIGHT_LEFT]: flight(EvolutionGoal.FLIGHT_LEFT, 'Best single sustained leftward airborne bout'),
  [EvolutionGoal.FLIGHT_AIRSPEED]: flight(EvolutionGoal.FLIGHT_AIRSPEED, 'Best single fully-airborne bout peak airspeed; landing ends the attempt'),
  [EvolutionGoal.FLIGHT_LAND]: flight(EvolutionGoal.FLIGHT_LAND, 'Best single complete climb, controlled descent, and supported soft upright landing'),
  [EvolutionGoal.FLIGHT_ACROBATICS]: flight(EvolutionGoal.FLIGHT_ACROBATICS, 'Best single clearance-gated airborne rotation bout'),
  [EvolutionGoal.GLIDE_RANGE]: flight(EvolutionGoal.GLIDE_RANGE, 'Best uninterrupted corridor glide distance; landing ends each attempt'),
  [EvolutionGoal.AERIAL_CROSSING]: flight(EvolutionGoal.AERIAL_CROSSING, 'Airborne pit crossing followed by far-side support; flight shaping is best-single-bout', 'Ramp, pit, landing pad'),
  [EvolutionGoal.PARA_RAMP_GLIDE]: flight(EvolutionGoal.PARA_RAMP_GLIDE, 'Grounded run-up, ramp departure, deploy, then best single airborne glide bout', 'Long runway, ramp, pit, landing pads'),
  [EvolutionGoal.CHUTE_DESCENT]: flight(EvolutionGoal.CHUTE_DESCENT, 'Tower spawn, parachute-controlled descent, soft upright landing on pad', 'Adjustable tower + landing pad'),
  [EvolutionGoal.CUSTOM]: { ...flat(EvolutionGoal.CUSTOM, 'Only validated physical metric rules contribute'), decision: 'reshape', geometry: 'Selected deterministic environment', shortcutAudit: 'Freeform text never executes or grants a per-frame reward' },
};

export function validateGoalSemanticMatrix(): string[] {
  const errors: string[] = [];
  const catalog = new Set(GOAL_ORDER);
  for (const goal of Object.values(EvolutionGoal)) {
    const decision = GOAL_SEMANTIC_DECISIONS[goal];
    if (!decision) errors.push(`${goal}: no semantic decision`);
    else {
      if (decision.decision !== 'remove' && !catalog.has(goal)) {
        errors.push(`${goal}: active goal missing from GOAL_ORDER`);
      }
      if (decision.decision === 'remove' && catalog.has(goal)) {
        errors.push(`${goal}: removed goal remains in GOAL_ORDER`);
      }
      for (const field of ['geometry', 'requirements', 'success', 'failure', 'shortcutAudit', 'rationale2d'] as const) {
        if (!decision[field]?.trim()) errors.push(`${goal}: empty ${field}`);
      }
    }
  }
  return errors;
}
