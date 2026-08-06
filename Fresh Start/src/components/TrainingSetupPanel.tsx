/**
 * D10–D12 — Training setup dock: recipes + knobs always visible.
 */
import type { ReactNode } from 'react';
import {
  BREED_STRICTNESS,
  MUTATION_STYLES,
  TRAINING_RECIPES,
  breedStrictnessFromTournament,
  type BreedStrictness,
  type GaKnobSet,
  type MutationStyleId,
  type RecipeId,
  type StartFromMode,
} from '../brain/trainingRecipes';

interface Props {
  knobs: GaKnobSet;
  disabled: boolean;
  hasBestOfRun: boolean;
  savedBrainOptions: { id: string; name: string }[];
  onChange: (next: GaKnobSet) => void;
  /** Show D12 schedule toggles. */
  showSchedules?: boolean;
}

const POP_PRESETS = [6, 12, 24, 36, 48, 80] as const;
const BATCH_PRESETS = [4, 6, 8, 12, 24] as const;
const TRY_PRESETS = [5, 8, 20, 40, 80] as const;
const ROUND_PRESETS = [25, 50, 100, 200] as const;

function KnobRow({
  label,
  title,
  children,
}: {
  label: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className="train-knob">
      <span className="train-knob-label" title={title}>
        {label}
      </span>
      <div className="button-row wrap train-knob-controls">{children}</div>
    </div>
  );
}

export function TrainingSetupPanel({
  knobs,
  disabled,
  hasBestOfRun,
  savedBrainOptions,
  onChange,
  showSchedules = true,
}: Props) {
  const strictness = breedStrictnessFromTournament(knobs.tournamentSize);

  const patch = (partial: Partial<GaKnobSet>) => {
    const next = { ...knobs, ...partial };
    next.batchSize = Math.max(1, Math.min(next.batchSize, next.populationSize));
    onChange(next);
  };

  return (
    <div className="dock-col training-setup">
      <h3 className="subhead">Training setup</h3>
      {disabled && (
        <p className="hint muted">
          Knobs lock while evolving — Stop, then change for the next run.
        </p>
      )}

      <div className="train-setup-grid">
        <KnobRow label="Recipe">
          {TRAINING_RECIPES.map((r) => (
            <button
              key={r.id}
              type="button"
              className={knobs.recipeId === r.id ? 'active' : ''}
              disabled={disabled}
              title={r.pitch}
              onClick={() => {
                const recipe = TRAINING_RECIPES.find((x) => x.id === r.id);
                if (!recipe) return;
                const next = {
                  ...knobs,
                  ...recipe.apply(knobs),
                  recipeId: r.id as RecipeId,
                };
                next.batchSize = Math.max(
                  1,
                  Math.min(next.batchSize, next.populationSize),
                );
                onChange(next);
              }}
            >
              {r.label}
            </button>
          ))}
        </KnobRow>

        <KnobRow
          label="How many try"
          title="populationSize — More brains each round. Higher is usually smarter but slower."
        >
          {POP_PRESETS.map((n) => (
            <button
              key={n}
              type="button"
              className={knobs.populationSize === n ? 'active' : ''}
              disabled={disabled}
              onClick={() => patch({ populationSize: n })}
            >
              {n}
            </button>
          ))}
        </KnobRow>

        <KnobRow
          label="How many you watch"
          title="batchSize — Only the on-screen pack. Learning uses everyone in How many try."
        >
          {BATCH_PRESETS.filter((n) => n <= knobs.populationSize).map((n) => (
            <button
              key={n}
              type="button"
              className={knobs.batchSize === n ? 'active' : ''}
              disabled={disabled}
              onClick={() => patch({ batchSize: n })}
            >
              {n}
            </button>
          ))}
        </KnobRow>

        <KnobRow
          label="Try length"
          title="episodeSeconds — Seconds each creature gets per round"
        >
          {TRY_PRESETS.map((s) => (
            <button
              key={s}
              type="button"
              className={knobs.episodeSeconds === s ? 'active' : ''}
              disabled={disabled}
              onClick={() => patch({ episodeSeconds: s })}
            >
              {s}s
            </button>
          ))}
        </KnobRow>

        <KnobRow
          label="Mutation style"
          title="Careful = small tweaks. Wild = big random changes when stuck."
        >
          {MUTATION_STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              className={knobs.mutationStyle === s.id ? 'active' : ''}
              disabled={disabled}
              title={`${s.hint} (σ≈${s.sigma})`}
              onClick={() =>
                patch({
                  mutationStyle: s.id as MutationStyleId,
                  mutationSigma: s.sigma,
                  mutationResetRate: s.resetRate,
                })
              }
            >
              {s.label}
            </button>
          ))}
        </KnobRow>

        <KnobRow label="Start from">
          {(
            [
              ['fresh', 'Fresh random'],
              ['best_of_run', 'Best of this run'],
              ['saved', 'Saved brain…'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={knobs.startFrom === id ? 'active' : ''}
              disabled={
                disabled ||
                (id === 'best_of_run' && !hasBestOfRun) ||
                (id === 'saved' && savedBrainOptions.length === 0)
              }
              title={
                id === 'fresh'
                  ? 'Random brains each Evolve'
                  : id === 'best_of_run'
                    ? 'Warm-start from this run’s elite'
                    : 'Copy a trained brain, then keep improving it for this goal'
              }
              onClick={() => patch({ startFrom: id as StartFromMode })}
            >
              {label}
            </button>
          ))}
          {knobs.startFrom === 'saved' && savedBrainOptions.length > 0 && (
            <select
              className="train-knob-select"
              value={knobs.savedModelId ?? ''}
              disabled={disabled}
              aria-label="Saved brain"
              onChange={(e) => patch({ savedModelId: e.target.value || null })}
            >
              <option value="">Pick…</option>
              {savedBrainOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
        </KnobRow>

        <KnobRow
          label="Keep the champions"
          title="ELITE_COUNT — Always copy the top scorers into the next round unchanged"
        >
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              type="button"
              className={knobs.eliteCount === n ? 'active' : ''}
              disabled={disabled}
              onClick={() => patch({ eliteCount: n })}
            >
              {n}
            </button>
          ))}
        </KnobRow>

        <KnobRow
          label="Who gets to breed"
          title="TOURNAMENT_SIZE — Stricter = exploit best; looser = more variety"
        >
          {(Object.keys(BREED_STRICTNESS) as BreedStrictness[]).map((id) => {
            const def = BREED_STRICTNESS[id];
            return (
              <button
                key={id}
                type="button"
                className={strictness === id ? 'active' : ''}
                disabled={disabled}
                title={def.hint}
                onClick={() => patch({ tournamentSize: def.tournamentSize })}
              >
                {def.label}
              </button>
            );
          })}
        </KnobRow>

        <KnobRow
          label="Rounds limit"
          title="maxGenerations — Stop after N generations"
        >
          {ROUND_PRESETS.map((n) => (
            <button
              key={n}
              type="button"
              className={knobs.maxGenerations === n ? 'active' : ''}
              disabled={disabled}
              onClick={() => patch({ maxGenerations: n })}
            >
              {n}
            </button>
          ))}
        </KnobRow>

        {showSchedules && (
          <div className="train-knob train-knob-toggles">
            <span className="train-knob-label">Schedules</span>
            <div className="train-toggle-grid">
              <label className="toggle-row" title="Start exploratory, then fine-tune automatically.">
                <input
                  type="checkbox"
                  checked={knobs.annealMutation}
                  disabled={disabled}
                  onChange={(e) => patch({ annealMutation: e.target.checked })}
                />
                Settle down over time
              </label>
              <label className="toggle-row" title="Spend less time on early chaos; longer tests later.">
                <input
                  type="checkbox"
                  checked={knobs.shortTriesFirst}
                  disabled={disabled}
                  onChange={(e) => patch({ shortTriesFirst: e.target.checked })}
                />
                Short tries first
              </label>
              <label className="toggle-row" title="Don’t waste time on faces-down runs.">
                <input
                  type="checkbox"
                  checked={knobs.stopAfterFall}
                  disabled={disabled}
                  onChange={(e) => patch({ stopAfterFall: e.target.checked })}
                />
                Stop a try after a fall
              </label>
              <label className="toggle-row" title="Children blend two good brains, then mutate.">
                <input
                  type="checkbox"
                  checked={knobs.crossover}
                  disabled={disabled}
                  onChange={(e) => patch({ crossover: e.target.checked })}
                />
                Mix two parents
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
