/**
 * D10/D11 — plain-language training recipes and GA knob presets.
 * Physics-free: only brain/GA search parameters.
 */
import {
  ELITE_COUNT,
  EPISODE_SECONDS,
  LIVE_BATCH_SIZE,
  LIVE_MAX_GENERATIONS,
  LIVE_POPULATION_SIZE,
  MUTATION_RESET_RATE,
  MUTATION_SIGMA,
  TOURNAMENT_SIZE,
} from './constants';

export type MutationStyleId = 'careful' | 'balanced' | 'wild';
export type RecipeId =
  | 'balanced'
  | 'quick_look'
  | 'serious_search'
  | 'fine_tune'
  | 'wild_ideas';
export type StartFromMode = 'fresh' | 'best_of_run' | 'saved';
export type BreedStrictness = 'open' | 'normal' | 'strict';

export interface GaKnobSet {
  populationSize: number;
  batchSize: number;
  episodeSeconds: number;
  mutationSigma: number;
  mutationResetRate: number;
  eliteCount: number;
  tournamentSize: number;
  maxGenerations: number;
  mutationStyle: MutationStyleId;
  recipeId: RecipeId;
  startFrom: StartFromMode;
  /** Settled when startFrom === 'saved'. */
  savedModelId: string | null;
  /** D12 */
  annealMutation: boolean;
  shortTriesFirst: boolean;
  stopAfterFall: boolean;
  crossover: boolean;
}

export interface MutationStyleDef {
  id: MutationStyleId;
  label: string;
  hint: string;
  sigma: number;
  resetRate: number;
}

export interface RecipeDef {
  id: RecipeId;
  label: string;
  pitch: string;
  apply: (base: GaKnobSet) => Partial<GaKnobSet>;
}

export const MUTATION_STYLES: readonly MutationStyleDef[] = [
  {
    id: 'careful',
    label: 'Careful',
    hint: 'Small tweaks — good for polishing a brain.',
    sigma: 0.06,
    resetRate: 0.02,
  },
  {
    id: 'balanced',
    label: 'Balanced',
    hint: 'Default sandbox feel.',
    sigma: MUTATION_SIGMA,
    resetRate: MUTATION_RESET_RATE,
  },
  {
    id: 'wild',
    label: 'Wild',
    hint: 'Big random changes when stuck.',
    sigma: 0.28,
    resetRate: 0.1,
  },
] as const;

export const BREED_STRICTNESS: Record<
  BreedStrictness,
  { label: string; tournamentSize: number; hint: string }
> = {
  open: {
    label: 'Open',
    tournamentSize: 2,
    hint: 'Looser parent picks — more variety.',
  },
  normal: {
    label: 'Normal',
    tournamentSize: TOURNAMENT_SIZE,
    hint: 'Default tournament selection.',
  },
  strict: {
    label: 'Strict',
    tournamentSize: 5,
    hint: 'Stricter picks — exploit the best.',
  },
};

export function breedStrictnessFromTournament(
  size: number,
): BreedStrictness {
  if (size <= 2) return 'open';
  if (size >= 5) return 'strict';
  return 'normal';
}

export const TRAINING_RECIPES: readonly RecipeDef[] = [
  {
    id: 'balanced',
    label: 'Balanced',
    pitch: 'Default sandbox feel',
    apply: () => ({
      populationSize: LIVE_POPULATION_SIZE,
      batchSize: LIVE_BATCH_SIZE,
      episodeSeconds: EPISODE_SECONDS,
      mutationStyle: 'balanced',
      mutationSigma: MUTATION_SIGMA,
      mutationResetRate: MUTATION_RESET_RATE,
      eliteCount: ELITE_COUNT,
      tournamentSize: TOURNAMENT_SIZE,
      startFrom: 'fresh',
    }),
  },
  {
    id: 'quick_look',
    label: 'Quick look',
    pitch: 'Fast feedback, rough scores',
    apply: () => ({
      populationSize: 12,
      batchSize: 6,
      episodeSeconds: 5,
      mutationStyle: 'wild',
      mutationSigma: 0.28,
      mutationResetRate: 0.1,
      eliteCount: ELITE_COUNT,
      tournamentSize: TOURNAMENT_SIZE,
      startFrom: 'fresh',
    }),
  },
  {
    id: 'serious_search',
    label: 'Serious search',
    pitch: 'Slower, stronger learning',
    apply: () => ({
      populationSize: 48,
      batchSize: 8,
      episodeSeconds: 20,
      mutationStyle: 'balanced',
      mutationSigma: MUTATION_SIGMA,
      mutationResetRate: MUTATION_RESET_RATE,
      eliteCount: 3,
      tournamentSize: TOURNAMENT_SIZE,
      startFrom: 'fresh',
    }),
  },
  {
    id: 'fine_tune',
    label: 'Fine tune',
    pitch: 'Polish a good brain',
    apply: () => ({
      populationSize: 24,
      batchSize: 8,
      episodeSeconds: 20,
      mutationStyle: 'careful',
      mutationSigma: 0.06,
      mutationResetRate: 0.02,
      eliteCount: 3,
      tournamentSize: 4,
      startFrom: 'best_of_run',
    }),
  },
  {
    id: 'wild_ideas',
    label: 'Wild ideas',
    pitch: 'Chaos for stuck runs',
    apply: () => ({
      populationSize: 36,
      batchSize: 12,
      episodeSeconds: 8,
      mutationStyle: 'wild',
      mutationSigma: 0.28,
      mutationResetRate: 0.1,
      eliteCount: 1,
      tournamentSize: 2,
      startFrom: 'fresh',
    }),
  },
] as const;

export function defaultGaKnobSet(): GaKnobSet {
  return {
    populationSize: LIVE_POPULATION_SIZE,
    batchSize: LIVE_BATCH_SIZE,
    episodeSeconds: EPISODE_SECONDS,
    mutationSigma: MUTATION_SIGMA,
    mutationResetRate: MUTATION_RESET_RATE,
    eliteCount: ELITE_COUNT,
    tournamentSize: TOURNAMENT_SIZE,
    maxGenerations: LIVE_MAX_GENERATIONS,
    mutationStyle: 'balanced',
    recipeId: 'balanced',
    startFrom: 'fresh',
    savedModelId: null,
    annealMutation: false,
    shortTriesFirst: false,
    stopAfterFall: false,
    crossover: false,
  };
}

export function applyRecipe(recipeId: RecipeId, current: GaKnobSet): GaKnobSet {
  const recipe = TRAINING_RECIPES.find((r) => r.id === recipeId);
  if (!recipe) return { ...current, recipeId };
  const patch = recipe.apply(current);
  const next = { ...current, ...patch, recipeId };
  next.batchSize = Math.max(1, Math.min(next.batchSize, next.populationSize));
  return next;
}

export function applyMutationStyle(
  styleId: MutationStyleId,
  current: GaKnobSet,
): GaKnobSet {
  const style = MUTATION_STYLES.find((s) => s.id === styleId);
  if (!style) return current;
  return {
    ...current,
    mutationStyle: styleId,
    mutationSigma: style.sigma,
    mutationResetRate: style.resetRate,
    recipeId: current.recipeId === 'balanced' ? current.recipeId : current.recipeId,
  };
}

const STORAGE_KEY = 'freshstart_train_recipe_v1';

export function loadGaKnobSet(): GaKnobSet {
  const base = defaultGaKnobSet();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<GaKnobSet>;
    const next = { ...base, ...parsed };
    next.batchSize = Math.max(1, Math.min(next.batchSize, next.populationSize));
    next.eliteCount = Math.max(1, Math.min(4, next.eliteCount | 0));
    next.tournamentSize = Math.max(2, Math.min(8, next.tournamentSize | 0));
    next.populationSize = Math.max(2, Math.min(120, next.populationSize | 0));
    next.maxGenerations = Math.max(1, Math.min(500, next.maxGenerations | 0));
    return next;
  } catch {
    return base;
  }
}

export function saveGaKnobSet(knobs: GaKnobSet): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(knobs));
  } catch {
    /* ignore quota */
  }
}

/** D12 — anneal σ from exploratory → fine over generations. */
export function annealedMutationSigma(
  baseSigma: number,
  generation: number,
  maxGenerations: number,
  enabled: boolean,
): number {
  if (!enabled || maxGenerations <= 1) return baseSigma;
  const t = Math.min(1, generation / Math.max(1, maxGenerations - 1));
  const start = Math.max(baseSigma, 0.25);
  const end = Math.min(baseSigma, 0.08);
  return start + (end - start) * t;
}

/** D12 — shorter episodes early, stretch later (never longer than base). */
export function adaptiveEpisodeSeconds(
  baseSeconds: number,
  generation: number,
  enabled: boolean,
): number {
  if (!enabled) return baseSeconds;
  const early = Math.min(baseSeconds, Math.max(3, Math.round(baseSeconds * 0.35)));
  const mid = Math.min(baseSeconds, Math.max(early, Math.round(baseSeconds * 0.7)));
  if (generation < 3) return early;
  if (generation < 8) return mid;
  return baseSeconds;
}
