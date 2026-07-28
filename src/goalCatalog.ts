/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { EvolutionGoal } from './types';
import { LAND_CEILING_FLIGHT, JUMP_LAND_MIN_HEIGHT, JUMP_LAND_RETURN_TOLERANCE } from './physicsConstants';

export type GoalCategory =
  | 'locomotion'
  | 'shuffle'
  | 'jump'
  | 'flight'
  | 'climb'
  | 'object'
  | 'motor'
  | 'sports'
  | 'precision'
  | 'custom';

export interface GoalInfo {
  id: EvolutionGoal;
  title: string;
  shortLabel: string;
  category: GoalCategory;
  description: string;
  howToAchieve: string;
  reward: string;
  tip: string;
  activeClass: string;
}

export const GOAL_CATALOG: Record<EvolutionGoal, GoalInfo> = {
  [EvolutionGoal.LOCOMOTION_RIGHT]: {
    id: EvolutionGoal.LOCOMOTION_RIGHT,
    title: 'Run Right',
    shortLabel: 'Run Right',
    category: 'locomotion',
    description:
      'Flat ground. Walk right with discrete steps: each plant must follow a swing phase (foot off the floor), with spacing between steps.',
    howToAchieve:
      'Lift a marked foot, plant it further right, then transfer to the other marked foot. Only foot→foot transfers count as alternating steps.',
    reward:
      'Forward body travel (primary) plus a small alternating-step bonus. Needs at least one foot-to-foot transfer and swing-gated steps. Vibration, grounded flicker, and sliding without steps score 0.',
    tip: 'Amber record line marks the best gait distance. Use Shuffle Right if you want vibration scooting.',
    activeClass: 'border-emerald-600 bg-emerald-50 text-emerald-800',
  },
  [EvolutionGoal.LOCOMOTION_LEFT]: {
    id: EvolutionGoal.LOCOMOTION_LEFT,
    title: 'Run Left',
    shortLabel: 'Run Left',
    category: 'locomotion',
    description:
      'Flat ground. Walk left with discrete swing-gated steps (same rules as Run Right, mirrored).',
    howToAchieve:
      'Invert a rightward gait: each new plant must follow a swing and advance left of the last credited plant. Mark feet in Studio so only those plants count.',
    reward:
      'Forward body travel (primary) plus a small alternating-step bonus. Needs foot-to-foot transfers and swing-gated steps. Vibration without real steps scores 0.',
    tip: 'Camera still follows the pack.',
    activeClass: 'border-blue-600 bg-blue-50 text-blue-800',
  },
  [EvolutionGoal.SHUFFLE_RIGHT]: {
    id: EvolutionGoal.SHUFFLE_RIGHT,
    title: 'Shuffle Right',
    shortLabel: 'Shuffle Right',
    category: 'shuffle',
    description:
      'Flat ground. Travel right by any supported means — vibrating muscles, contact flicker, and scooting are allowed and rewarded.',
    howToAchieve:
      'Pump soft links or chatter contacts while the body drifts right. True walking steps are optional here.',
    reward:
      'Points from body travel plus weighted oscillation-plant progress that co-moves with the body. Pure sliding still scores travel; vibration adds bonus.',
    tip: 'Run Right will not pay for this gait — train Shuffle when vibration is the strategy.',
    activeClass: 'border-lime-700 bg-lime-50 text-lime-950',
  },
  [EvolutionGoal.SHUFFLE_LEFT]: {
    id: EvolutionGoal.SHUFFLE_LEFT,
    title: 'Shuffle Left',
    shortLabel: 'Shuffle Left',
    category: 'shuffle',
    description:
      'Flat ground. Travel left by vibration, scooting, or any supported shuffle (mirrored Shuffle Right).',
    howToAchieve:
      'Oscillate actuators and contacts while the body drifts left.',
    reward:
      'Points from body travel plus weighted oscillation-plant progress capped by body travel.',
    tip: 'Sister goal of Shuffle Right for leftward packing.',
    activeClass: 'border-teal-700 bg-teal-50 text-teal-950',
  },
  [EvolutionGoal.SPEED]: {
    id: EvolutionGoal.SPEED,
    title: 'Max Speed',
    shortLabel: 'Max Speed',
    category: 'locomotion',
    description: 'Flat sprint rewarding peak burst plus travel.',
    howToAchieve: 'Short powerful strides or motor carts that ramp up fast.',
    reward: 'Points ≈ peak speed × 45 + distance × 0.35.',
    tip: 'Thrashing in place scores poorly.',
    activeClass: 'border-sky-600 bg-sky-50 text-sky-800',
  },
  [EvolutionGoal.SPRINT_FINISH]: {
    id: EvolutionGoal.SPRINT_FINISH,
    title: 'Sprint Finish',
    shortLabel: 'Sprint Finish',
    category: 'locomotion',
    description: 'Race through checkpoints to the finish line. Faster finish = higher score.',
    howToAchieve: 'Build a fast reliable gait and stay upright through the course.',
    reward: 'Points: big bonus for finishing early; partial credit for checkpoints and progress.',
    tip: 'Works for walkers and Motor Cart alike.',
    activeClass: 'border-sky-700 bg-sky-100 text-sky-950',
  },
  [EvolutionGoal.ROUGH_TERRAIN_TRAVERSE]: {
    id: EvolutionGoal.ROUGH_TERRAIN_TRAVERSE,
    title: 'Rough Terrain Traverse',
    shortLabel: 'Rough Traverse',
    category: 'locomotion',
    description: 'Cross a seeded course of rolling hills through ordered markers and finish supported.',
    howToAchieve: 'Evolve a stable gait that keeps contact and recovers as the ground height changes.',
    reward: 'Points: ordered supported sections and a gated supported finish dominate bounded travel and finish-time shaping.',
    tip: 'Endpoint travel, airborne bypass, and skipped markers cannot earn completion.',
    activeClass: 'border-emerald-700 bg-emerald-100 text-emerald-950',
  },
  [EvolutionGoal.STAY_UPRIGHT]: {
    id: EvolutionGoal.STAY_UPRIGHT,
    title: 'Stay Tall',
    shortLabel: 'Stay Tall',
    category: 'locomotion',
    description: 'Sustain a tall posture while physically supported.',
    howToAchieve: 'Make continuous balance corrections and recover quickly from disturbances.',
    reward: 'Points from integrated normalized supported posture minus time spent fallen; final pose alone cannot win.',
    tip: 'Jumping earns no posture credit, and a late recovery does not erase an earlier collapse.',
    activeClass: 'border-indigo-600 bg-indigo-50 text-indigo-800',
  },
  [EvolutionGoal.HIGH_JUMP]: {
    id: EvolutionGoal.HIGH_JUMP,
    title: 'Jump Height',
    shortLabel: 'Jump Height',
    category: 'jump',
    description:
      'Flat floor. Maximize peak clearance of the lowest point on the body during one isolated jump.',
    howToAchieve:
      'All contact points leave the floor together; the jump ends when any point touches again. Hop chains do not score.',
    reward:
      'Points from best isolated-jump peak of the lowest anatomical point (not COM).',
    tip: 'A dangling foot caps your height. Bunny-hopping scores on Hop goals instead.',
    activeClass: 'border-amber-600 bg-amber-50 text-amber-800',
  },
  [EvolutionGoal.CLEAR_BAR]: {
    id: EvolutionGoal.CLEAR_BAR,
    title: 'Clear the Bar',
    shortLabel: 'Clear Bar',
    category: 'jump',
    description: 'Clear a high-jump crossbar plane on the runway (precision jump challenge).',
    howToAchieve:
      'Approach, then pass the whole hull above the bar in an isolated jump. Hop chains cannot clear.',
    reward: 'Points from lowest-point jump height + large clear bonus.',
    tip: 'Hopping in place never clears the bar.',
    activeClass: 'border-yellow-600 bg-yellow-50 text-yellow-900',
  },
  [EvolutionGoal.JUMP_HANG_TIME]: {
    id: EvolutionGoal.JUMP_HANG_TIME,
    title: 'Hang Time',
    shortLabel: 'Hang Time',
    category: 'jump',
    description:
      'Longest single isolated jump: all points leave the floor until any point returns.',
    howToAchieve:
      'Launch from support and stay continuously airborne. A quick re-takeoff is hopping and scores zero here.',
    reward:
      'Points from best isolated jump bout: airborne duration dominates, with bounded clearance shaping.',
    tip: 'Repeated hopping never scores Hang Time. One longer isolated jump wins.',
    activeClass: 'border-amber-500 bg-amber-50 text-amber-900',
  },
  [EvolutionGoal.LONG_JUMP]: {
    id: EvolutionGoal.LONG_JUMP,
    title: 'Jump Right',
    shortLabel: 'Jump Right',
    category: 'jump',
    description:
      'Maximize rightward distance in one isolated jump — all points off until any returns.',
    howToAchieve: 'Build speed, leap once, and cover ground in the air. Hop chains score on Hop Right instead.',
    reward: 'Points ≈ isolated-jump distance right + light clearance shaping.',
    tip: 'Bunny-hopping travel does not count here.',
    activeClass: 'border-amber-700 bg-amber-100 text-amber-950',
  },
  [EvolutionGoal.JUMP_LEFT]: {
    id: EvolutionGoal.JUMP_LEFT,
    title: 'Jump Left',
    shortLabel: 'Jump Left',
    category: 'jump',
    description:
      'Maximize leftward distance in one isolated jump — twin of Jump Right.',
    howToAchieve: 'Leap left in one isolated jump. Hop chains score on Hop Left instead.',
    reward: 'Points ≈ isolated-jump distance left + light clearance shaping.',
    tip: 'Repeated hopping left does not count here.',
    activeClass: 'border-orange-600 bg-orange-50 text-orange-900',
  },
  [EvolutionGoal.JUMP_SPEED]: {
    id: EvolutionGoal.JUMP_SPEED,
    title: 'Jump Speed',
    shortLabel: 'Jump Speed',
    category: 'jump',
    description: 'Peak takeoff / airspeed during an isolated jump — twin of Flight Airspeed.',
    howToAchieve: 'Explosive isolated launch with real airtime; hop chains do not score.',
    reward: 'Points ≈ peak airspeed in the best isolated jump + height/air shaping.',
    tip: 'Need all points off the ground for airspeed to count.',
    activeClass: 'border-yellow-700 bg-yellow-50 text-yellow-950',
  },
  [EvolutionGoal.JUMP_LAND_UPRIGHT]: {
    id: EvolutionGoal.JUMP_LAND_UPRIGHT,
    title: 'Jump & Land',
    shortLabel: 'Jump & Land',
    category: 'jump',
    description:
      'Make the highest isolated jump you can, then land back near the takeoff spot.',
    howToAchieve:
      'All points leave, then stick the landing close to takeoff. Only your best isolated attempt counts; hop chains score nothing.',
    reward:
      'Points = best single isolated attempt: peak height × return-to-takeoff × upright × soft landing.',
    tip: `Jumps under ~${JUMP_LAND_MIN_HEIGHT}px ignore. Drift beyond ~${JUMP_LAND_RETURN_TOLERANCE}px from takeoff zeroes that attempt.`,
    activeClass: 'border-teal-600 bg-teal-50 text-teal-800',
  },
  [EvolutionGoal.JUMP_ACROBATICS]: {
    id: EvolutionGoal.JUMP_ACROBATICS,
    title: 'Jump Flips',
    shortLabel: 'Jump Flips',
    category: 'jump',
    description: 'Accumulate rotation and flips in one isolated jump — twin of Aero Acrobatics.',
    howToAchieve: 'Leave the ground with height in an isolated jump, then tumble before landing.',
    reward: 'Points from rotation + full-flip bonuses gated by airtime and height. Hop chains score 0.',
    tip: 'Spinning while grounded scores near zero.',
    activeClass: 'border-rose-600 bg-rose-50 text-rose-900',
  },
  [EvolutionGoal.HOP_RIGHT]: {
    id: EvolutionGoal.HOP_RIGHT,
    title: 'Hop Right',
    shortLabel: 'Hop Right',
    category: 'jump',
    description:
      'Travel right by repeated hopping — successive all-points-off bouts chained by brief landings.',
    howToAchieve:
      'Bounce repeatedly so each quick re-takeoff continues the hop chain and accumulates distance.',
    reward: 'Points from total rightward travel across hop-chain bouts.',
    tip: 'One long isolated jump scores Jump Right instead; hop chains are for this goal.',
    activeClass: 'border-lime-700 bg-lime-50 text-lime-950',
  },
  [EvolutionGoal.HOP_LEFT]: {
    id: EvolutionGoal.HOP_LEFT,
    title: 'Hop Left',
    shortLabel: 'Hop Left',
    category: 'jump',
    description:
      'Travel left by repeated hopping — successive all-points-off bouts chained by brief landings.',
    howToAchieve: 'Bounce repeatedly leftward so hop-chain distance accumulates.',
    reward: 'Points from total leftward travel across hop-chain bouts.',
    tip: 'Isolated leaps score Jump Left; keep landing briefly and hopping again here.',
    activeClass: 'border-lime-600 bg-lime-50 text-lime-900',
  },
  [EvolutionGoal.HOP_SPEED]: {
    id: EvolutionGoal.HOP_SPEED,
    title: 'Hop Speed',
    shortLabel: 'Hop Speed',
    category: 'jump',
    description: 'Repeated hopping for the fastest hop-bout travel speed.',
    howToAchieve: 'Chain short hops with high horizontal speed; isolated jumps do not feed this score.',
    reward: 'Points ≈ peak hop-chain speed + light total hop travel shaping.',
    tip: 'Build a bounce rhythm — hanging in one long jump is the wrong skill.',
    activeClass: 'border-green-700 bg-green-50 text-green-950',
  },
  [EvolutionGoal.FLIGHT_TIME]: {
    id: EvolutionGoal.FLIGHT_TIME,
    title: 'Stay Aloft',
    shortLabel: 'Stay Aloft',
    category: 'flight',
    description: 'Keep the whole body off the floor for the longest single flight.',
    howToAchieve:
      'Best with Flapper: learn a matched L/R flap cycle (bird-like). Touching down ends that flight; later hops do not add up.',
    reward:
      'Points from best single fully-airborne bout: duration dominates, with cruise height + wing-flap work + symmetrical flap bonus − leapiness. Separate hops never accumulate.',
    tip: 'Pick the Flapper template. Flap both wings together — matched strokes lift best and score best. Holding still will not float.',
    activeClass: 'border-sky-600 bg-sky-50 text-sky-900',
  },
  [EvolutionGoal.FLIGHT_HEIGHT]: {
    id: EvolutionGoal.FLIGHT_HEIGHT,
    title: 'Flight Height',
    shortLabel: 'Flight Height',
    category: 'flight',
    description: 'Climb and hold altitude with sustained flight — not a single hop apex.',
    howToAchieve:
      'Flap both wings together to climb after takeoff and stay aloft at height. Ballistic hops and one-sided thrashing score poorly.',
    reward:
      'Points from best bout: sustained cruise altitude dominates, with flap-gated peak, powered-climb credit, and symmetrical flap bonus. Leapiness is penalised.',
    tip: 'Pick the Flapper template. Matched L/R strokes give the strongest lift; peak height from a launch impulse loses to a longer climb-and-hold.',
    activeClass: 'border-sky-700 bg-sky-100 text-sky-950',
  },
  [EvolutionGoal.FLIGHT_RIGHT]: {
    id: EvolutionGoal.FLIGHT_RIGHT,
    title: 'Fly Right',
    shortLabel: 'Fly Right',
    category: 'flight',
    description: 'Maximize rightward distance in one fully-airborne bout.',
    howToAchieve: 'Stay aloft and cruise right. Touching down ends that attempt.',
    reward:
      'Points from best single airborne bout: distance right + airtime shaping. Separate hops never add together.',
    tip: 'Proven Glider or Flapper. Stretch generation length for longer flights.',
    activeClass: 'border-cyan-600 bg-cyan-50 text-cyan-900',
  },
  [EvolutionGoal.FLIGHT_LEFT]: {
    id: EvolutionGoal.FLIGHT_LEFT,
    title: 'Fly Left',
    shortLabel: 'Fly Left',
    category: 'flight',
    description: 'Maximize leftward distance in one fully-airborne bout.',
    howToAchieve: 'Turn or launch left and stay airborne while covering ground. Landing ends the attempt.',
    reward:
      'Points from best single airborne bout: distance left + airtime shaping. Separate hops never add together.',
    tip: 'Same bodies as Fly Right — invert heading or evolve leftward trim.',
    activeClass: 'border-cyan-700 bg-cyan-100 text-cyan-950',
  },
  [EvolutionGoal.FLIGHT_AIRSPEED]: {
    id: EvolutionGoal.FLIGHT_AIRSPEED,
    title: 'Airspeed',
    shortLabel: 'Airspeed',
    category: 'flight',
    description: 'Peak speed magnitude during a single fully-airborne bout.',
    howToAchieve: 'Dive, flap hard, or dive-glide to build real airspeed aloft. Landing ends that attempt.',
    reward:
      'Points from best single airborne bout: peak airspeed × 55 + light bout airtime/distance. Hop stacking does not accumulate.',
    tip: 'Speed on the ground does not count. Any body part on the ground ends the bout.',
    activeClass: 'border-blue-600 bg-blue-50 text-blue-900',
  },
  [EvolutionGoal.FLIGHT_LAND]: {
    id: EvolutionGoal.FLIGHT_LAND,
    title: 'Flight Land',
    shortLabel: 'Flight Land',
    category: 'flight',
    description:
      'Reach a flight ceiling, then descend and stick a soft upright landing — one complete attempt.',
    howToAchieve:
      'Climb/clear to the approach ceiling, begin a controlled descent (extra height gain is penalized), then flare and land upright. Touching down ends the bout.',
    reward:
      'Points from best complete climb→descent→stick bout. Re-takeoffs after landing start a new attempt (max, not sum).',
    tip: `Ceiling ≈ ${LAND_CEILING_FLIGHT}px. Re-climbing after you start descending is also penalized.`,
    activeClass: 'border-teal-700 bg-teal-50 text-teal-950',
  },
  [EvolutionGoal.FLIGHT_ACROBATICS]: {
    id: EvolutionGoal.FLIGHT_ACROBATICS,
    title: 'Aero Acrobatics',
    shortLabel: 'Acrobatics',
    category: 'flight',
    description: 'Accumulate airborne rotation and full flips in one flight bout.',
    howToAchieve: 'Get clear of the floor, then tumble / loop using wings or body torque before landing.',
    reward:
      'Points from best single bout: rotation + flip bonuses gated by airtime and clearance. Separate hops never combine.',
    tip: 'Ground spinning is ignored. Full 360° flips pay big. Touching down ends the attempt.',
    activeClass: 'border-fuchsia-600 bg-fuchsia-50 text-fuchsia-900',
  },
  [EvolutionGoal.GLIDE_RANGE]: {
    id: EvolutionGoal.GLIDE_RANGE,
    title: 'Glide Range',
    shortLabel: 'Glide Range',
    category: 'flight',
    description: 'Longest uninterrupted mid-height glide — landing ends the attempt.',
    howToAchieve:
      'Proven Glider: reefed run-up, open at 15+ px/frame, then hold a long level cruise. Ballistic arcs score poorly.',
    reward:
      'Points from best single fully-airborne bout: glide-corridor time/distance and sustained range dominate. Separate hops never add together.',
    tip: 'Stretch generation length so agents have time aloft. Reef/trim to stay level — touching down ends that glide attempt.',
    activeClass: 'border-violet-600 bg-violet-50 text-violet-900',
  },
  [EvolutionGoal.AERIAL_CROSSING]: {
    id: EvolutionGoal.AERIAL_CROSSING,
    title: 'Aerial Crossing',
    shortLabel: 'Air Cross',
    category: 'flight',
    description: 'Launch off a ramp, fly across a wide pit, land on the far pad.',
    howToAchieve:
      'Glider: build speed on the runway, open sail on the ramp. Flapper: flap across the gap. Landing ends flight shaping for that attempt.',
    reward:
      'Points from supported far-side landing bonus; flight shaping is from the best single airborne bout and capped below completion.',
    tip: 'Difficulty widens the pit. Hopping across the near edge cannot stack flight shaping.',
    activeClass: 'border-fuchsia-700 bg-fuchsia-100 text-fuchsia-950',
  },
  [EvolutionGoal.PARA_RAMP_GLIDE]: {
    id: EvolutionGoal.PARA_RAMP_GLIDE,
    title: 'Para Ramp',
    shortLabel: 'Para Ramp',
    category: 'flight',
    description:
      'Long run-up to a distant takeoff ramp. Three brains: speed → deploy → glide (hard handoff).',
    howToAchieve:
      'Jump Cart / Proven Glider: Head 1 builds speed and jumps the gap reefed; Head 2 opens after clear; Head 3 trims for cruise. Touching down ends that glide bout.',
    reward:
      'Points: run-up locks only when the pit is cleared. Deploy/glide score the best single uninterrupted airborne bout — hops after landing do not accumulate.',
    tip: 'Stall at the lip fails Run-up — floor the motors and clear the gap. Jump Cart is the speed reference; Proven Glider adds a light sail for Deploy/Glide.',
    activeClass: 'border-indigo-600 bg-indigo-50 text-indigo-950',
  },
  [EvolutionGoal.STAIR_CLIMB]: {
    id: EvolutionGoal.STAIR_CLIMB,
    title: 'Stair Climb',
    shortLabel: 'Stair Climb',
    category: 'climb',
    description: 'Endless staircase. Stand on successive treads.',
    howToAchieve: 'Step up risers carefully; reckless leaps miss treads.',
    reward: 'Points from highest tread stood on + light forward progress.',
    tip: 'Free jumps before the stairs barely count.',
    activeClass: 'border-orange-600 bg-orange-50 text-orange-900',
  },
  [EvolutionGoal.OBSTACLE_CLIMB]: {
    id: EvolutionGoal.OBSTACLE_CLIMB,
    title: 'Climb Obstacles',
    shortLabel: 'Obstacles',
    category: 'climb',
    description: 'Parkour boxes — travel right and mount taller tops.',
    howToAchieve: 'Mount each authored box top in course order with stable support.',
    reward: 'Points from ordered box mounts + supported top height and position.',
    tip: 'Free jumps, ground bypasses, and skipped boxes do not score.',
    activeClass: 'border-red-600 bg-red-50 text-red-800',
  },
  [EvolutionGoal.BALANCE_BEAM]: {
    id: EvolutionGoal.BALANCE_BEAM,
    title: 'Balance Beam',
    shortLabel: 'Balance Beam',
    category: 'precision',
    description: 'Narrow elevated beam over a pit. Stay on and move along it.',
    howToAchieve: 'Keep COM centered; slow careful steps beat thrashing.',
    reward: 'Points from continuous beam-supported travel + supported posture + far-end completion.',
    tip: 'Jumping past the beam and final-pose recovery do not score.',
    activeClass: 'border-violet-600 bg-violet-50 text-violet-900',
  },
  [EvolutionGoal.PARKING_ZONE]: {
    id: EvolutionGoal.PARKING_ZONE,
    title: 'Parking Zone',
    shortLabel: 'Parking',
    category: 'precision',
    description: 'Enter the marked bay and stay slow while upright.',
    howToAchieve: 'Approach, brake (cut motor drive), hold posture inside the zone.',
    reward: 'Points from frames parked slowly upright + approach credit.',
    tip: 'Motor Cart: learn to output near-zero drive in the bay.',
    activeClass: 'border-violet-700 bg-violet-100 text-violet-950',
  },
  [EvolutionGoal.HIT_TARGET]: {
    id: EvolutionGoal.HIT_TARGET,
    title: 'Hit Targets',
    shortLabel: 'Targets',
    category: 'precision',
    description: 'Private ball must touch elevated bullseyes.',
    howToAchieve: 'Carry, kick, or fling the ball into each target circle.',
    reward: 'Points per contact-caused unique hit + bounded post-hit loft.',
    tip: 'Each agent has a private ball.',
    activeClass: 'border-rose-600 bg-rose-50 text-rose-900',
  },
  [EvolutionGoal.CARRY_BALL]: {
    id: EvolutionGoal.CARRY_BALL,
    title: 'Carry Ball',
    shortLabel: 'Carry Ball',
    category: 'object',
    description: 'Contact, lift, and ferry the ball rightward.',
    howToAchieve: 'Cup the ball between nodes, then walk.',
    reward: 'Points from direct-contact carry distance + lift while transporting.',
    tip: 'Private ball per agent — pack cannot steal yours.',
    activeClass: 'border-orange-500 bg-orange-50 text-orange-800',
  },
  [EvolutionGoal.PUSH_BOX]: {
    id: EvolutionGoal.PUSH_BOX,
    title: 'Push Box',
    shortLabel: 'Push Box',
    category: 'object',
    description: 'Shove the private crate right while staying near it.',
    howToAchieve: 'Brace and drive; motor carts make good bulldozers.',
    reward: 'Points from proximity × crate travel.',
    tip: 'Private crate per agent.',
    activeClass: 'border-amber-700 bg-amber-50 text-amber-900',
  },
  [EvolutionGoal.MOTOR_DRIVE]: {
    id: EvolutionGoal.MOTOR_DRIVE,
    title: 'Motor Drive',
    shortLabel: 'Motor Drive',
    category: 'motor',
    description: 'Flat track for powered wheels. Drive only works while grounded.',
    howToAchieve: 'Use Motor Cart; evolve steady forward drive.',
    reward: 'Points from distance traveled right.',
    tip: 'Passive rollers cannot self-propel.',
    activeClass: 'border-lime-600 bg-lime-50 text-lime-900',
  },
  [EvolutionGoal.MOTOR_RAMP]: {
    id: EvolutionGoal.MOTOR_RAMP,
    title: 'Motor Ramp',
    shortLabel: 'Motor Ramp',
    category: 'motor',
    description: 'Climb a long incline without flipping.',
    howToAchieve: 'Keep drive engaged; low COM helps.',
    reward: 'Points ≈ peak ramp height × 2.5 + forward × 0.4.',
    tip: 'Raise motor power in the Studio if you stall.',
    activeClass: 'border-lime-700 bg-lime-100 text-lime-950',
  },
  [EvolutionGoal.MOTOR_ICE]: {
    id: EvolutionGoal.MOTOR_ICE,
    title: 'Motor Ice Run',
    shortLabel: 'Motor Ice',
    category: 'motor',
    description: 'Long ice patches kill grip — torque wins.',
    howToAchieve: 'Enter with speed and keep commanding drive.',
    reward: 'Points from distance traveled right.',
    tip: 'Ice is always on for this goal.',
    activeClass: 'border-cyan-600 bg-cyan-50 text-cyan-900',
  },
  [EvolutionGoal.MOTOR_GAP]: {
    id: EvolutionGoal.MOTOR_GAP,
    title: 'Clear the Gap',
    shortLabel: 'Clear Gap',
    category: 'motor',
    description: 'Pit in the floor. Jump or speed-bridge to the far side.',
    howToAchieve: 'Build speed on approach; Motor Cart may need a hop or high speed.',
    reward: 'Points from clear bonus + progress; falling in nearly zeroes the score.',
    tip: 'Recommended: Motor Cart with strong drive.',
    activeClass: 'border-lime-600 bg-lime-50 text-lime-800',
  },
  [EvolutionGoal.MOTOR_LAUNCH_LAND]: {
    id: EvolutionGoal.MOTOR_LAUNCH_LAND,
    title: 'Launch & Land',
    shortLabel: 'Launch Land',
    category: 'motor',
    description: 'Ramp launch over a pit onto an elevated pad — land on both motor wheels.',
    howToAchieve: 'Hit the ramp fast, clear the pit, touch down with both wheels on the pad.',
    reward:
      'Points from best both-wheel pad landing (max) + gap-clear bonus. Ramp driving / hops barely score.',
    tip: 'One-wheel or belly landings are weak; both wheels on the LAND pad maximizes score.',
    activeClass: 'border-emerald-700 bg-emerald-100 text-emerald-950',
  },
  [EvolutionGoal.MOTOR_LOOP]: {
    id: EvolutionGoal.MOTOR_LOOP,
    title: 'Hamster Hoop',
    shortLabel: 'Hoop Roll',
    category: 'motor',
    description:
      'Spawn inside a sized hoop and roll it across endless procedural hills, valleys, rocks, and boulders.',
    howToAchieve:
      'Shift weight against the rim or drive motor wheels on the inner surface to tip and roll the hoop.',
    reward: 'Points from grounded hoop travel + finish − outside-hoop time − loft penalty. Ballistic hoop launches barely score.',
    tip: 'Terrain is clear by default — turn on Obstacles in Discovery for rocks. Raise Difficulty to pack denser. Launching the hoop into the sky is penalized.',
    activeClass: 'border-green-700 bg-green-100 text-green-950',
  },
  [EvolutionGoal.MOTOR_HURDLES]: {
    id: EvolutionGoal.MOTOR_HURDLES,
    title: 'Jump Hurdles',
    shortLabel: 'Hurdles',
    category: 'motor',
    description: 'Clear a series of thick hurdles then reach a distant finish. Difficulty raises height.',
    howToAchieve: 'Hop or vault so COM passes above each hurdle top.',
    reward: 'Points per hurdle + finish bonus + progress.',
    tip: 'Hurdles are solid — smashing through at speed no longer tunnels.',
    activeClass: 'border-teal-700 bg-teal-100 text-teal-950',
  },
  [EvolutionGoal.MOTOR_LANDSPEED]: {
    id: EvolutionGoal.MOTOR_LANDSPEED,
    title: 'Landspeed',
    shortLabel: 'Landspeed',
    category: 'motor',
    description: 'Peak ground speed on a flat track — motor twin of Flight Airspeed.',
    howToAchieve: 'Full-throttle Motor Cart; stay upright and build a real burst.',
    reward: 'Points ≈ peak land speed × 55 + light travel.',
    tip: 'Flipping or spinning in place kills the peak — clean roll wins.',
    activeClass: 'border-cyan-700 bg-cyan-100 text-cyan-950',
  },
  [EvolutionGoal.MOTOR_BRIDGE]: {
    id: EvolutionGoal.MOTOR_BRIDGE,
    title: 'Retired: Bridge Crossing',
    shortLabel: 'Retired Goal',
    category: 'motor',
    description: 'Legacy save metadata for a removed goal that duplicated flat-ground driving in 2D.',
    howToAchieve: 'This goal is no longer selectable.',
    reward: 'Legacy points reader retained for old saves only.',
    tip: 'R4 retained its failed seeds and retired the goal instead of presenting visual width as physical balance.',
    activeClass: 'border-stone-600 bg-stone-100 text-stone-900',
  },
  [EvolutionGoal.MOTOR_SLALOM]: {
    id: EvolutionGoal.MOTOR_SLALOM,
    title: 'Motor Technical Course',
    shortLabel: 'Technical',
    category: 'motor',
    description: 'Strict side-view inclines, drops, narrow pads, a riser, and braking zones.',
    howToAchieve: 'Control speed and posture through each physical section, then cross the finish.',
    reward: 'Points from ordered supported checkpoints + bounded supported travel + gated finish.',
    tip: 'The finish is locked until every checkpoint is crossed in order with support.',
    activeClass: 'border-stone-700 bg-stone-50 text-stone-900',
  },
  [EvolutionGoal.KICK_GOAL]: {
    id: EvolutionGoal.KICK_GOAL,
    title: 'Score a Goal',
    shortLabel: 'Soccer Goal',
    category: 'locomotion',
    description: 'Get the private ball into the goal mouth between the posts.',
    howToAchieve: 'Herd or kick the ball right into the net zone.',
    reward: 'Points from contact-caused goal bonus + bounded contacted ball travel.',
    tip: 'Touching the posts is fine — the ball must enter the net zone.',
    activeClass: 'border-green-600 bg-green-50 text-green-900',
  },
  [EvolutionGoal.BOWLING_PINS]: {
    id: EvolutionGoal.BOWLING_PINS,
    title: 'Bowling',
    shortLabel: 'Bowling',
    category: 'sports',
    description: 'Knock down the triangle of pins (private per agent).',
    howToAchieve: 'Rush the lane and smash the rack, or roll the body through.',
    reward: '40 points per pin down + light approach credit.',
    tip: 'Motor Cart makes a great bowling ball.',
    activeClass: 'border-red-700 bg-red-50 text-red-950',
  },
  [EvolutionGoal.DODGEBALL]: {
    id: EvolutionGoal.DODGEBALL,
    title: 'Hazard Dash',
    shortLabel: 'Hazard Dash',
    category: 'locomotion',
    description: 'Reach the finish while static hazard pads block the side-on lane.',
    howToAchieve: 'Traverse the physical pads; stay upright and keep moving right.',
    reward: 'Points from ordered hazard crossings + supported finish + upright new progress.',
    tip: 'Pack/Focused view helps you watch one agent’s timing.',
    activeClass: 'border-fuchsia-700 bg-fuchsia-50 text-fuchsia-950',
  },
  [EvolutionGoal.CUSTOM]: {
    id: EvolutionGoal.CUSTOM,
    title: 'Custom Goal',
    shortLabel: 'Custom',
    category: 'custom',
    description: 'Blend your own metrics in Discovery.',
    howToAchieve: 'Add weighted rules and optional threshold bonuses.',
    reward: 'Points = Σ (metric × weight) + bonuses.',
    tip: 'Start with one dominant metric.',
    activeClass: 'border-fuchsia-600 bg-fuchsia-50 text-fuchsia-800',
  },
};

export function getGoalInfo(goal: EvolutionGoal): GoalInfo {
  return GOAL_CATALOG[goal];
}

export const GOAL_ORDER: EvolutionGoal[] = [
  // locomotion (step-strict Run)
  EvolutionGoal.LOCOMOTION_RIGHT,
  EvolutionGoal.LOCOMOTION_LEFT,
  EvolutionGoal.SPEED,
  EvolutionGoal.SPRINT_FINISH,
  EvolutionGoal.ROUGH_TERRAIN_TRAVERSE,
  EvolutionGoal.STAY_UPRIGHT,
  // shuffle (vibration / scoot travel)
  EvolutionGoal.SHUFFLE_RIGHT,
  EvolutionGoal.SHUFFLE_LEFT,
  // jump (isolated jumps + hop locomotion + Clear Bar)
  EvolutionGoal.JUMP_HANG_TIME,
  EvolutionGoal.HIGH_JUMP,
  EvolutionGoal.LONG_JUMP,
  EvolutionGoal.JUMP_LEFT,
  EvolutionGoal.JUMP_SPEED,
  EvolutionGoal.JUMP_LAND_UPRIGHT,
  EvolutionGoal.JUMP_ACROBATICS,
  EvolutionGoal.HOP_RIGHT,
  EvolutionGoal.HOP_LEFT,
  EvolutionGoal.HOP_SPEED,
  EvolutionGoal.CLEAR_BAR,
  // flight
  EvolutionGoal.FLIGHT_TIME,
  EvolutionGoal.FLIGHT_HEIGHT,
  EvolutionGoal.FLIGHT_RIGHT,
  EvolutionGoal.FLIGHT_LEFT,
  EvolutionGoal.FLIGHT_AIRSPEED,
  EvolutionGoal.FLIGHT_LAND,
  EvolutionGoal.FLIGHT_ACROBATICS,
  EvolutionGoal.GLIDE_RANGE,
  EvolutionGoal.AERIAL_CROSSING,
  EvolutionGoal.PARA_RAMP_GLIDE,
  // climb
  EvolutionGoal.STAIR_CLIMB,
  EvolutionGoal.OBSTACLE_CLIMB,
  // object
  EvolutionGoal.CARRY_BALL,
  EvolutionGoal.PUSH_BOX,
  // motor
  EvolutionGoal.MOTOR_DRIVE,
  EvolutionGoal.MOTOR_RAMP,
  EvolutionGoal.MOTOR_ICE,
  EvolutionGoal.MOTOR_GAP,
  EvolutionGoal.MOTOR_LAUNCH_LAND,
  EvolutionGoal.MOTOR_LOOP,
  EvolutionGoal.MOTOR_HURDLES,
  EvolutionGoal.MOTOR_LANDSPEED,
  EvolutionGoal.MOTOR_SLALOM,
  // sports
  EvolutionGoal.KICK_GOAL,
  EvolutionGoal.BOWLING_PINS,
  EvolutionGoal.DODGEBALL,
  // precision
  EvolutionGoal.BALANCE_BEAM,
  EvolutionGoal.PARKING_ZONE,
  EvolutionGoal.HIT_TARGET,
  // custom
  EvolutionGoal.CUSTOM,
];

export const GOAL_CATEGORY_LABELS: Record<GoalCategory, string> = {
  locomotion: 'Locomotion',
  shuffle: 'Shuffle',
  jump: 'Jumping',
  flight: 'Flight',
  climb: 'Climbing',
  object: 'Objects',
  motor: 'Motor wheels',
  sports: 'Sports',
  precision: 'Precision',
  custom: 'Custom',
};
