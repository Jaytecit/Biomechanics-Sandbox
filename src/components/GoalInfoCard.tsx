/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EvolutionGoal } from '../types';
import { getGoalInfo, GOAL_CATEGORY_LABELS } from '../goalCatalog';
import { X, Lightbulb, Trophy, Map, Compass } from 'lucide-react';

interface GoalInfoCardProps {
  goal: EvolutionGoal;
  /** Compact strip under the goal picker */
  compact?: boolean;
  onOpenDetails?: () => void;
}

/** Inline summary card for the currently selected goal. */
export const GoalInfoCard: React.FC<GoalInfoCardProps> = ({ goal, compact = false, onOpenDetails }) => {
  const info = getGoalInfo(goal);

  if (compact) {
    return (
      <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-2 text-[11px] text-slate-600 leading-snug">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-bold text-slate-800">{info.title}</p>
            <p className="mt-0.5 text-slate-500">{info.tip}</p>
          </div>
          {onOpenDetails && (
            <button
              type="button"
              onClick={onOpenDetails}
              className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-indigo-700 hover:bg-indigo-50 cursor-pointer"
            >
              How?
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm space-y-2 text-[12px] text-slate-600 leading-relaxed">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-900">{info.title}</h3>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
          {GOAL_CATEGORY_LABELS[info.category]}
        </span>
      </div>
      <p>{info.description}</p>
      <p>
        <span className="font-semibold text-slate-800">Score: </span>
        {info.reward}
      </p>
      <p>
        <span className="font-semibold text-slate-800">How: </span>
        {info.howToAchieve}
      </p>
      <p className="text-indigo-700 font-medium">{info.tip}</p>
    </div>
  );
};

interface GoalInfoDialogProps {
  goal: EvolutionGoal;
  open: boolean;
  onClose: () => void;
}

/** Modal dialogue explaining a goal and how to achieve / score it. */
export const GoalInfoDialog: React.FC<GoalInfoDialogProps> = ({ goal, open, onClose }) => {
  if (!open) return null;
  const info = getGoalInfo(goal);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="goal-info-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100 bg-slate-50/80">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
              {GOAL_CATEGORY_LABELS[info.category]}
            </p>
            <h2 id="goal-info-title" className="text-lg font-bold text-slate-900 mt-0.5">
              {info.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 text-[13px] text-slate-600 leading-relaxed">
          <section className="flex gap-3">
            <Map className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1">Arena</h3>
              <p>{info.description}</p>
            </div>
          </section>

          <section className="flex gap-3">
            <Trophy className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1">Reward</h3>
              <p>{info.reward}</p>
            </div>
          </section>

          <section className="flex gap-3">
            <Compass className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1">How to achieve it</h3>
              <p>{info.howToAchieve}</p>
            </div>
          </section>

          <div className="flex gap-2 rounded-xl border border-indigo-100 bg-indigo-50/70 px-3 py-2.5 text-indigo-900">
            <Lightbulb className="w-4 h-4 shrink-0 mt-0.5 text-indigo-500" />
            <p className="text-[12px] font-medium leading-snug">{info.tip}</p>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-slate-800 cursor-pointer"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};
