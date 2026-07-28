import {
  CreatureBlueprint,
  EvolutionGoal,
  isFlightGoal,
  isJumpGoal,
} from './types';
import {
  ArenaZoneId,
  ARENA_ZONES,
  blueprintAllowedInZone,
  goalAllowedInZone,
  inspectBlueprint,
} from './zones';
import {
  GOAL_CATEGORY_LABELS,
  GOAL_ORDER,
  GoalCategory,
  getGoalInfo,
} from './goalCatalog';

export interface EligibilityContext {
  zoneId?: ArenaZoneId;
  goal: EvolutionGoal;
  allowedEquipment?: {
    motorWheels?: boolean;
    passiveWheels?: boolean;
    aero?: boolean;
  };
}
export interface EligibilityResult {
  eligible: boolean;
  reasons: string[];
  allowedDestinations: ArenaZoneId[];
}

/** One goal a shelf model may continue-train into (category + zone permitting). */
export interface TrainableGoalOption {
  goal: EvolutionGoal;
  zoneId: ArenaZoneId;
  category: GoalCategory;
  label: string;
  categoryLabel: string;
  requiresZoneSwitch: boolean;
  zoneTitle: string;
}

const MOTOR_GOALS = new Set<EvolutionGoal>([
  EvolutionGoal.MOTOR_DRIVE,
  EvolutionGoal.MOTOR_RAMP,
  EvolutionGoal.MOTOR_ICE,
  EvolutionGoal.MOTOR_GAP,
  EvolutionGoal.MOTOR_LAUNCH_LAND,
  EvolutionGoal.MOTOR_LOOP,
  EvolutionGoal.MOTOR_HURDLES,
  EvolutionGoal.MOTOR_LANDSPEED,
  EvolutionGoal.MOTOR_BRIDGE,
  EvolutionGoal.MOTOR_SLALOM,
]);

const ZONE_FALLBACK_ORDER: ArenaZoneId[] = ['free', 'flying', 'motor', 'walking', 'jumping'];

export function evaluateEligibility(
  blueprint: CreatureBlueprint,
  context: EligibilityContext
): EligibilityResult {
  const reasons: string[] = [];
  const traits = inspectBlueprint(blueprint);
  const zoneId = context.zoneId ?? 'free';
  if (!goalAllowedInZone(context.goal, zoneId)) {
    reasons.push(`${context.goal} is not offered in ${ARENA_ZONES[zoneId].title}`);
  }
  if (!blueprintAllowedInZone(blueprint, zoneId)) {
    reasons.push(`body equipment is not eligible for ${ARENA_ZONES[zoneId].title}`);
  }
  if (MOTOR_GOALS.has(context.goal) && !traits.hasMotorWheel) {
    reasons.push('this goal requires at least one powered wheel');
  }
  if (
    context.goal === EvolutionGoal.MOTOR_LAUNCH_LAND &&
    blueprint.nodes.filter(node => node.isMotorWheel).length < 2
  ) {
    reasons.push('Launch & Land requires two powered wheels');
  }
  if (isFlightGoal(context.goal) && !traits.hasAero) {
    reasons.push('this flight goal requires aero equipment');
  }
  if (
    context.goal === EvolutionGoal.GLIDE_RANGE &&
    !traits.hasParaglider
  ) {
    reasons.push('Glide Range requires a paraglider');
  }
  if (
    context.goal === EvolutionGoal.PARA_RAMP_GLIDE &&
    (
      !traits.hasParaglider ||
      blueprint.nodes.filter(node => node.isMotorWheel).length < 2
    )
  ) {
    reasons.push('Para Ramp requires a paraglider and two powered wheels');
  }
  if (isJumpGoal(context.goal) && (traits.hasAero || traits.hasMotorWheel)) {
    reasons.push('jump goals require a muscle body without aero or motor drive');
  }
  const equipment = context.allowedEquipment;
  if (equipment?.motorWheels === false && traits.hasMotorWheel) reasons.push('powered wheels are not allowed');
  if (equipment?.passiveWheels === false && traits.hasPassiveWheel) reasons.push('passive wheels are not allowed');
  if (equipment?.aero === false && traits.hasAero) reasons.push('aero equipment is not allowed');

  const allowedDestinations = (Object.keys(ARENA_ZONES) as ArenaZoneId[])
    .filter(id => blueprintAllowedInZone(blueprint, id) && goalAllowedInZone(context.goal, id));
  return { eligible: reasons.length === 0, reasons, allowedDestinations };
}

export function eligibilityMessage(result: EligibilityResult): string {
  if (result.eligible) return 'Eligible';
  const destinations = result.allowedDestinations.length
    ? ` Allowed destinations: ${result.allowedDestinations.map(id => ARENA_ZONES[id].title).join(', ')}.`
    : '';
  return `${result.reasons.join('; ')}.${destinations}`;
}

/**
 * Pick the best zone to run `goal` with this body. Prefers the current zone,
 * then Free, then other equipment-compatible arenas.
 */
export function resolveTrainingZone(
  blueprint: CreatureBlueprint,
  goal: EvolutionGoal,
  preferredZone: ArenaZoneId
): ArenaZoneId | null {
  const ordered: ArenaZoneId[] = [];
  const seen = new Set<ArenaZoneId>();
  for (const id of [preferredZone, ...ZONE_FALLBACK_ORDER]) {
    if (seen.has(id)) continue;
    seen.add(id);
    ordered.push(id);
  }
  for (const zoneId of ordered) {
    if (!blueprintAllowedInZone(blueprint, zoneId)) continue;
    if (!goalAllowedInZone(goal, zoneId)) continue;
    if (evaluateEligibility(blueprint, { zoneId, goal }).eligible) return zoneId;
  }
  return null;
}

/** All goals this body may continue-train into from the shelf (category permitting). */
export function listTrainableGoalsForBlueprint(
  blueprint: CreatureBlueprint,
  currentZone: ArenaZoneId
): TrainableGoalOption[] {
  const options: TrainableGoalOption[] = [];
  for (const goal of GOAL_ORDER) {
    const zoneId = resolveTrainingZone(blueprint, goal, currentZone);
    if (!zoneId) continue;
    const info = getGoalInfo(goal);
    options.push({
      goal,
      zoneId,
      category: info.category,
      label: info.shortLabel,
      categoryLabel: GOAL_CATEGORY_LABELS[info.category],
      requiresZoneSwitch: zoneId !== currentZone,
      zoneTitle: ARENA_ZONES[zoneId].title,
    });
  }
  return options;
}

/** Group trainable options by catalog category for optgroup / chip UIs. */
export function groupTrainableGoalsByCategory(
  options: TrainableGoalOption[]
): { category: GoalCategory; categoryLabel: string; goals: TrainableGoalOption[] }[] {
  const order = Object.keys(GOAL_CATEGORY_LABELS) as GoalCategory[];
  const map = new Map<GoalCategory, TrainableGoalOption[]>();
  for (const cat of order) map.set(cat, []);
  for (const opt of options) map.get(opt.category)!.push(opt);
  return order
    .map(category => ({
      category,
      categoryLabel: GOAL_CATEGORY_LABELS[category],
      goals: map.get(category) ?? [],
    }))
    .filter(group => group.goals.length > 0);
}
