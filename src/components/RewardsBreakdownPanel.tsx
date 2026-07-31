/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useLayoutEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Minus,
  RotateCcw,
  Trophy,
} from 'lucide-react';
import {
  BuiltInRewardRecipe,
  cloneBuiltInRewardRecipe,
  DEFAULT_BUILTIN_REWARD_RECIPE,
  isDefaultRewardRecipe,
  isPilotRewardGoal,
  patchRewardCoeff,
  readRewardCoeff,
  rewardCoeffSlidersForGoal,
} from '../builtInRewardCoeffs';
import {
  RewardBreakdown,
  RewardDelta,
  previousValueMap,
  rewardComponentDelta,
  rewardComponentDeltaValue,
  topRewardMovers,
} from '../rewardBreakdown';
import { EvolutionGoal } from '../types';

interface RewardsBreakdownPanelProps {
  breakdown: RewardBreakdown | null;
  /** Previous generation's elite breakdown — the "last elite" baseline. */
  baseline: RewardBreakdown | null;
  generation: number;
  /** Sit in a parent chrome bar instead of floating over the canvas. */
  embedded?: boolean;
  /**
   * Fixed outer height when embedded (matches Simulation controls). The term
   * grid grows columns so every row fits inside this height.
   */
  heightCap?: number;
  /** Active built-in reward recipe (SPEED / JUMP_SPEED pilot). */
  rewardRecipe?: BuiltInRewardRecipe;
  /** Live-edit callback for pilot goal coefficients. */
  onRewardRecipeChange?: (recipe: BuiltInRewardRecipe | undefined) => void;
}

const TERM_ROW_PX = 18;

function DeltaArrow({ delta }: { delta: RewardDelta }) {
  if (delta === 'up') {
    return (
      <ArrowUp
        className="w-3.5 h-3.5 text-emerald-400 shrink-0"
        strokeWidth={2.75}
        aria-label="Up from last elite"
      />
    );
  }
  if (delta === 'down') {
    return (
      <ArrowDown
        className="w-3.5 h-3.5 text-rose-400 shrink-0"
        strokeWidth={2.75}
        aria-label="Down from last elite"
      />
    );
  }
  if (delta === 'flat') {
    return (
      <Minus
        className="w-3 h-3 text-white/35 shrink-0"
        aria-label="Unchanged from last elite"
      />
    );
  }
  return <span className="w-3.5 shrink-0" aria-hidden />;
}

function formatScore(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 100) return value.toFixed(0);
  if (abs >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

function formatSignedDelta(value: number): string {
  if (value === 0) return '0';
  const body = formatScore(Math.abs(value));
  return value > 0 ? `+${body}` : `−${body}`;
}

function deltaTextClass(value: number): string {
  if (value > 0) return 'text-emerald-300';
  if (value < 0) return 'text-rose-300';
  return 'text-white/35';
}

function columnsForFit(termCount: number, listHeight: number): number {
  if (termCount <= 0) return 1;
  const rowsPerCol = Math.max(1, Math.floor(Math.max(TERM_ROW_PX, listHeight) / TERM_ROW_PX));
  return Math.max(1, Math.ceil(termCount / rowsPerCol));
}

export const RewardsBreakdownPanel: React.FC<RewardsBreakdownPanelProps> = ({
  breakdown,
  baseline,
  generation,
  embedded = false,
  heightCap,
  rewardRecipe,
  onRewardRecipeChange,
}) => {
  const [open, setOpen] = useState(true);
  const [cols, setCols] = useState(1);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  const prev = previousValueMap(baseline);
  const hasBaseline = !!baseline && baseline.goal === breakdown?.goal;
  const rows = breakdown?.components ?? [];
  const totalDeltaKind = hasBaseline
    ? rewardComponentDelta(breakdown!.total, baseline?.total)
    : 'new';
  const totalDeltaValue = hasBaseline
    ? rewardComponentDeltaValue(breakdown!.total, baseline?.total)
    : 0;
  const movers = breakdown && hasBaseline ? topRewardMovers(breakdown, baseline, 3) : [];

  const goal = (breakdown?.goal ?? EvolutionGoal.SPEED) as EvolutionGoal;
  const editable = !!onRewardRecipeChange && isPilotRewardGoal(goal);
  const recipe = cloneBuiltInRewardRecipe(rewardRecipe ?? DEFAULT_BUILTIN_REWARD_RECIPE);
  const customRecipe = !isDefaultRewardRecipe(rewardRecipe);
  const sliders = editable ? rewardCoeffSlidersForGoal(goal) : [];

  useLayoutEffect(() => {
    if (!open || !breakdown) {
      setCols(1);
      return;
    }

    const measure = () => {
      const root = rootRef.current;
      const list = listRef.current;
      if (!root || !list) return;

      // Prefer the laid-out flex remainder; fall back to heightCap − chrome.
      let listHeight = list.clientHeight;
      if (listHeight < TERM_ROW_PX && heightCap && heightCap > 0) {
        const chrome = root.offsetHeight - list.offsetHeight;
        listHeight = Math.max(TERM_ROW_PX, heightCap - chrome);
      }
      setCols(columnsForFit(rows.length, listHeight));
    };

    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(rootRef.current);
    if (listRef.current) ro.observe(listRef.current);
    return () => ro.disconnect();
  }, [open, breakdown, heightCap, rows.length, movers.length, hasBaseline, generation, sliders.length]);

  if (!breakdown) return null;

  const fixedHeight = embedded && heightCap && heightCap > 0 ? heightCap : undefined;

  const widthClass = embedded
    ? 'relative z-10 select-none flex-1 min-w-0 self-stretch'
    : 'absolute bottom-4 left-1/2 -translate-x-1/2 z-10 select-none max-w-[min(100%-28rem,22rem)] w-[min(100%-2rem,20rem)]';

  return (
    <div
      ref={rootRef}
      id="rewards-breakdown-panel"
      className={widthClass}
      style={fixedHeight !== undefined ? { height: fixedHeight, maxHeight: fixedHeight } : undefined}
    >
      <div className="rounded-xl border border-white/40 bg-slate-900/55 backdrop-blur-md shadow-lg text-white overflow-hidden h-full flex flex-col">
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-left hover:bg-white/10 cursor-pointer transition-colors shrink-0"
          aria-expanded={open}
        >
          {open ? (
            <ChevronDown className="w-3 h-3 text-white/70 shrink-0" />
          ) : (
            <ChevronRight className="w-3 h-3 text-white/70 shrink-0" />
          )}
          <Trophy className="w-3.5 h-3.5 text-amber-300 shrink-0" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-white/90">
            Elite Rewards
          </span>
          {customRecipe && (
            <span
              className="ml-1 rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-amber-400/25 text-amber-200 border border-amber-300/40"
              title="Non-default reward coefficients — shelf scores are tagged"
            >
              Custom
            </span>
          )}
          <span className="ml-auto flex items-center gap-1.5 text-[10px] font-semibold tabular-nums shrink-0">
            <span className="text-white/75">{formatScore(breakdown.total)}</span>
            {hasBaseline ? (
              <span className={deltaTextClass(totalDeltaValue)}>
                {formatSignedDelta(totalDeltaValue)}
              </span>
            ) : (
              <DeltaArrow delta={totalDeltaKind} />
            )}
          </span>
        </button>

        {open && (
          <div
            ref={bodyRef}
            className="px-2.5 pb-2 pt-0.5 border-t border-white/15 flex flex-col gap-1 min-h-0 flex-1 overflow-hidden"
          >
            <div className="flex items-baseline justify-between gap-2 shrink-0">
              <span className="text-[10px] font-semibold text-white/55 truncate">
                {breakdown.goalLabel}
                {generation > 0 ? ` · Gen ${generation}` : ''}
              </span>
              {hasBaseline ? (
                <span className="text-[10px] font-medium text-white/50 shrink-0">
                  vs last elite{' '}
                  <span className={`font-bold tabular-nums ${deltaTextClass(totalDeltaValue)}`}>
                    {formatSignedDelta(totalDeltaValue)}
                  </span>
                </span>
              ) : (
                <span className="text-[10px] font-medium text-white/45 shrink-0">
                  First elite — deltas next gen
                </span>
              )}
            </div>

            {movers.length > 0 && (
              <div className="shrink-0 flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md bg-white/5 border border-white/10 px-1.5 py-0.5">
                <span className="text-[9px] font-bold uppercase tracking-wider text-white/45">
                  Top
                </span>
                {movers.map(m => (
                  <span
                    key={`mover-${m.id}`}
                    className="inline-flex items-center gap-1 text-[10px] leading-tight min-w-0"
                  >
                    <span className="truncate text-white/70 font-medium max-w-[7rem]">
                      {m.label}
                    </span>
                    <span className={`tabular-nums font-bold ${deltaTextClass(m.delta)}`}>
                      {formatSignedDelta(m.delta)}
                    </span>
                  </span>
                ))}
              </div>
            )}

            <ul
              ref={listRef}
              className="min-h-0 flex-1 gap-x-3 gap-y-0.5 overflow-hidden"
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                gridAutoFlow: 'column',
                gridTemplateRows: `repeat(${Math.max(1, Math.ceil(rows.length / cols))}, minmax(${TERM_ROW_PX}px, auto))`,
              }}
            >
              {rows.map(row => {
                const prevValue = prev.get(row.id);
                const deltaKind = hasBaseline
                  ? rewardComponentDelta(row.value, prevValue)
                  : 'new';
                const deltaValue = hasBaseline
                  ? rewardComponentDeltaValue(row.value, prevValue)
                  : 0;
                return (
                  <li
                    key={row.id}
                    className="flex items-center gap-1.5 text-[11px] leading-tight min-w-0 h-[18px]"
                  >
                    <span className="flex-1 min-w-0 truncate text-white/70 font-medium">
                      {row.label}
                    </span>
                    <span
                      className={`tabular-nums font-bold shrink-0 ${
                        row.value < 0 ? 'text-rose-300' : 'text-white/95'
                      }`}
                    >
                      {formatScore(row.value)}
                    </span>
                    {hasBaseline ? (
                      <span
                        className={`w-8 text-right tabular-nums font-semibold shrink-0 text-[10px] ${deltaTextClass(deltaValue)}`}
                      >
                        {formatSignedDelta(deltaValue)}
                      </span>
                    ) : (
                      <DeltaArrow delta={deltaKind} />
                    )}
                  </li>
                );
              })}
            </ul>

            {editable && sliders.length > 0 && (
              <div className="shrink-0 mt-0.5 pt-1 border-t border-white/10 flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-white/45">
                    Tune coeffs
                  </span>
                  <button
                    type="button"
                    onClick={() => onRewardRecipeChange?.(undefined)}
                    disabled={!customRecipe}
                    className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-white/70 hover:text-white disabled:opacity-35 disabled:cursor-not-allowed"
                    title="Reset reward coefficients to shipped defaults"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset
                  </button>
                </div>
                {sliders.map(spec => {
                  const value = readRewardCoeff(recipe, spec.path);
                  return (
                    <label
                      key={spec.path}
                      className="flex items-center gap-2 text-[10px] text-white/70 min-w-0"
                    >
                      <span className="w-20 shrink-0 truncate font-medium" title={spec.label}>
                        {spec.label}
                      </span>
                      <input
                        type="range"
                        min={spec.min}
                        max={spec.max}
                        step={spec.step}
                        value={value}
                        onChange={e => {
                          const next = patchRewardCoeff(
                            recipe,
                            spec.path,
                            Number(e.target.value)
                          );
                          onRewardRecipeChange?.(
                            isDefaultRewardRecipe(next) ? undefined : next
                          );
                        }}
                        className="flex-1 min-w-0 accent-amber-300"
                      />
                      <span className="w-10 text-right tabular-nums font-semibold text-white/90 shrink-0">
                        {spec.step < 1 ? value.toFixed(2) : value.toFixed(0)}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
