/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Shared eligible-goal scenario picker for continue-training (shelf clone)
 * and fresh training starts from an untrained body.
 */

import React, { useMemo, useState } from 'react';
import { ArrowRight, Play, X } from 'lucide-react';
import { CreatureBlueprint, EvolutionGoal } from '../types';
import { getGoalInfo } from '../goalCatalog';
import { ArenaZoneId } from '../zones';
import {
  groupTrainableGoalsByCategory,
  listTrainableGoalsForBlueprint,
  TrainableGoalOption,
} from '../eligibility';

export function pickDefaultTrainableGoal(
  options: TrainableGoalOption[],
  currentGoal: EvolutionGoal,
  preferredGoal?: EvolutionGoal
): EvolutionGoal {
  if (options.some(o => o.goal === currentGoal)) return currentGoal;
  if (preferredGoal && options.some(o => o.goal === preferredGoal)) return preferredGoal;
  return options[0]?.goal ?? currentGoal;
}

export interface TrainableGoalPickerProps {
  blueprint: CreatureBlueprint;
  activeZone: ArenaZoneId;
  currentGoal: EvolutionGoal;
  /** When set, same-category goals appear as related quick picks. */
  relatedFromGoal?: EvolutionGoal;
  title?: string;
  description?: string;
  confirmLabel?: string;
  /** Extra line under the transfer summary (clone topology note, etc.). */
  transferHint?: string;
  onConfirm: (goal: EvolutionGoal) => void;
  onClose?: () => void;
}

export const TrainableGoalPicker: React.FC<TrainableGoalPickerProps> = ({
  blueprint,
  activeZone,
  currentGoal,
  relatedFromGoal,
  title = 'Continue training (clone)',
  description =
    'Shelf copy stays frozen. Pick any eligible goal — same category transfers are listed first as quick picks.',
  confirmLabel = 'Start cloned run',
  transferHint = 'Topology frozen · weights mutate · Freeze saves a new product.',
  onConfirm,
  onClose,
}) => {
  const options = useMemo(
    () => listTrainableGoalsForBlueprint(blueprint, activeZone),
    [blueprint, activeZone]
  );
  const groups = useMemo(() => groupTrainableGoalsByCategory(options), [options]);
  const [selectedGoal, setSelectedGoal] = useState<EvolutionGoal>(() =>
    pickDefaultTrainableGoal(options, currentGoal, relatedFromGoal)
  );
  const [categoryFilter, setCategoryFilter] = useState<string | 'all'>('all');

  const selected = options.find(o => o.goal === selectedGoal) ?? options[0];
  const filteredGroups =
    categoryFilter === 'all' ? groups : groups.filter(g => g.category === categoryFilter);

  const related =
    relatedFromGoal != null
      ? options.filter(
          o =>
            o.category === getGoalInfo(relatedFromGoal).category &&
            o.goal !== relatedFromGoal
        )
      : [];

  if (options.length === 0) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 space-y-2">
        <p className="text-[10px] text-amber-900 leading-relaxed">
          No compatible goals for this body from the current arena rules. Switch zone
          (e.g. Free) or open a matching equipment arena, then try again.
        </p>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-[10px] font-semibold text-amber-800 underline cursor-pointer"
          >
            Close
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-2.5 space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-900">
            {title}
          </div>
          <p className="text-[10px] text-emerald-800/90 leading-relaxed mt-0.5">{description}</p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-emerald-700/70 hover:text-emerald-950 cursor-pointer"
            title="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {related.length > 0 && relatedFromGoal != null && (
        <div className="space-y-1">
          <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-800/80">
            Related to {getGoalInfo(relatedFromGoal).shortLabel}
          </div>
          <div className="flex flex-wrap gap-1">
            {related.slice(0, 8).map(opt => (
              <button
                key={opt.goal}
                type="button"
                onClick={() => setSelectedGoal(opt.goal)}
                className={`px-1.5 py-1 rounded-md text-[10px] font-semibold border cursor-pointer ${
                  selectedGoal === opt.goal
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white text-emerald-900 border-emerald-200 hover:bg-emerald-100'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1">
        <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-800/80">
          Category
        </div>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => setCategoryFilter('all')}
            className={`px-1.5 py-1 rounded-md text-[10px] font-semibold border cursor-pointer ${
              categoryFilter === 'all'
                ? 'bg-slate-800 text-white border-slate-800'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            All ({options.length})
          </button>
          {groups.map(g => (
            <button
              key={g.category}
              type="button"
              onClick={() => {
                setCategoryFilter(g.category);
                if (!g.goals.some(o => o.goal === selectedGoal) && g.goals[0]) {
                  setSelectedGoal(g.goals[0].goal);
                }
              }}
              className={`px-1.5 py-1 rounded-md text-[10px] font-semibold border cursor-pointer ${
                categoryFilter === g.category
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {g.categoryLabel} ({g.goals.length})
            </button>
          ))}
        </div>
      </div>

      <label className="block space-y-1">
        <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-800/80">
          Goal scenario
        </span>
        <select
          value={selected?.goal ?? ''}
          onChange={e => setSelectedGoal(e.target.value as EvolutionGoal)}
          className="w-full px-2 py-1.5 text-[11px] rounded-md border border-emerald-300 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
        >
          {filteredGroups.map(g => (
            <optgroup key={g.category} label={g.categoryLabel}>
              {g.goals.map(opt => (
                <option key={opt.goal} value={opt.goal}>
                  {opt.label}
                  {relatedFromGoal != null && opt.goal === relatedFromGoal ? ' · original' : ''}
                  {opt.requiresZoneSwitch ? ` · → ${opt.zoneTitle}` : ''}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      {selected && (
        <div className="rounded-md bg-white/80 border border-emerald-100 px-2 py-1.5 text-[10px] text-slate-700 leading-relaxed">
          <div className="font-semibold text-slate-800 flex items-center gap-1 flex-wrap">
            {relatedFromGoal != null ? (
              <>
                {getGoalInfo(relatedFromGoal).shortLabel}
                <ArrowRight className="w-3 h-3 text-emerald-600" />
              </>
            ) : null}
            {selected.label}
          </div>
          <div className="mt-0.5 text-slate-500">
            {selected.requiresZoneSwitch
              ? `Opens in ${selected.zoneTitle} (needed for this goal).`
              : `Stays in ${selected.zoneTitle}.`}{' '}
            {transferHint}
          </div>
        </div>
      )}

      <button
        type="button"
        disabled={!selected}
        onClick={() => selected && onConfirm(selected.goal)}
        className="w-full flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-[11px] font-bold cursor-pointer"
      >
        <Play className="w-3.5 h-3.5" />
        {confirmLabel}
        {selected ? ` · ${selected.label}` : ''}
      </button>
    </div>
  );
};
