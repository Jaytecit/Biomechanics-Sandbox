/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EvolutionGoal, GenerationRecord } from '../types';
import { formatBestEver } from '../formatGoal';
import { TrendingUp } from 'lucide-react';

interface StatsPanelProps {
  generationHistory: GenerationRecord[];
  bestEverFitness: number;
  goal: EvolutionGoal;
}

const MAX_CHART_POINTS = 240;

export const StatsPanel = React.memo(function StatsPanel({
  generationHistory,
  bestEverFitness,
  goal,
}: StatsPanelProps) {
  const bestEverDisplay = formatBestEver(goal, bestEverFitness);

  // Keep the complete lightweight history for experiment inspection, but bound
  // SVG complexity to roughly the chart's horizontal resolution.
  const chartHistory = React.useMemo(() => {
    if (generationHistory.length <= MAX_CHART_POINTS) return generationHistory;

    const sampled: GenerationRecord[] = [generationHistory[0]];
    const interiorSlots = MAX_CHART_POINTS - 2;
    const stride = (generationHistory.length - 2) / interiorSlots;
    for (let index = 0; index < interiorSlots; index++) {
      sampled.push(generationHistory[1 + Math.floor(index * stride)]);
    }
    sampled.push(generationHistory[generationHistory.length - 1]);
    return sampled;
  }, [generationHistory]);

  const renderProgressChart = () => {
    if (chartHistory.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-slate-400 text-xs py-8">
          <TrendingUp className="w-8 h-8 stroke-[1.5] text-slate-300 mb-2" />
          <span>No historical records yet</span>
          <span className="text-[10px] text-slate-400">Complete 1 generation to begin tracking progress</span>
        </div>
      );
    }

    const width = 360;
    const height = 120;
    const padding = 20;

    const maxGen = Math.max(...chartHistory.map(h => h.generation));
    const minGen = Math.min(...chartHistory.map(h => h.generation));

    const allFitnesses = chartHistory.flatMap(h => [h.bestFitness, h.avgFitness, h.minFitness]);
    const maxFitVal = Math.max(bestEverFitness, ...allFitnesses, 10);

    const scaleX = (gen: number) => {
      if (maxGen === minGen) return padding + (width - padding * 2) / 2;
      return padding + ((gen - minGen) / (maxGen - minGen)) * (width - padding * 2);
    };

    const scaleY = (fit: number) => {
      return height - padding - (fit / maxFitVal) * (height - padding * 2);
    };

    let maxPath = '';
    let avgPath = '';
    let minPath = '';

    chartHistory.forEach((record, index) => {
      const x = scaleX(record.generation);
      const yMax = scaleY(record.bestFitness);
      const yAvg = scaleY(record.avgFitness);
      const yMin = scaleY(record.minFitness);

      if (index === 0) {
        maxPath = `M ${x} ${yMax}`;
        avgPath = `M ${x} ${yAvg}`;
        minPath = `M ${x} ${yMin}`;
      } else {
        maxPath += ` L ${x} ${yMax}`;
        avgPath += ` L ${x} ${yAvg}`;
        minPath += ` L ${x} ${yMin}`;
      }
    });

    return (
      <div className="w-full">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full overflow-visible">
          <line x1={padding} y1={scaleY(0)} x2={width - padding} y2={scaleY(0)} stroke="#e2e8f0" strokeWidth="1.5" />
          <line x1={padding} y1={scaleY(maxFitVal / 2)} x2={width - padding} y2={scaleY(maxFitVal / 2)} stroke="#f1f5f9" strokeWidth="1" strokeDasharray="4 2" />
          <line x1={padding} y1={scaleY(maxFitVal)} x2={width - padding} y2={scaleY(maxFitVal)} stroke="#f1f5f9" strokeWidth="1" />

          <text x={padding - 5} y={scaleY(0) + 3} fill="#94a3b8" fontSize="8" fontWeight="bold" textAnchor="end">0</text>
          <text x={padding - 5} y={scaleY(maxFitVal / 2) + 3} fill="#94a3b8" fontSize="8" fontWeight="bold" textAnchor="end">{(maxFitVal / 2).toFixed(0)}</text>
          <text x={padding - 5} y={scaleY(maxFitVal) + 3} fill="#94a3b8" fontSize="8" fontWeight="bold" textAnchor="end">{maxFitVal.toFixed(0)}</text>

          {chartHistory.length > 1 && (
            <>
              <path d={minPath} fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="3 3" />
              <path d={avgPath} fill="none" stroke="#6366f1" strokeWidth="2" />
              <path d={maxPath} fill="none" stroke="#10b981" strokeWidth="2.5" />
            </>
          )}

          {chartHistory.map(record => (
            <g key={record.generation}>
              <circle cx={scaleX(record.generation)} cy={scaleY(record.bestFitness)} r="3" fill="#10b981" />
              <circle cx={scaleX(record.generation)} cy={scaleY(record.avgFitness)} r="2" fill="#6366f1" />
            </g>
          ))}

          {chartHistory.length > 0 && (
            <>
              <text x={scaleX(minGen)} y={height - 5} fill="#94a3b8" fontSize="8" fontWeight="bold" textAnchor="middle">G{minGen}</text>
              {maxGen > minGen && (
                <text x={scaleX(maxGen)} y={height - 5} fill="#94a3b8" fontSize="8" fontWeight="bold" textAnchor="middle">G{maxGen}</text>
              )}
            </>
          )}
        </svg>

        <div className="flex items-center justify-center gap-4 mt-3 text-[10px] text-slate-500 font-semibold border-t border-slate-100 pt-2">
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-emerald-500 rounded-full inline-block"></span>
            Max Fitness
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-indigo-500 rounded-full inline-block"></span>
            Avg Fitness
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 border-t border-slate-400 border-dashed inline-block"></span>
            Min Fitness
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-sm flex flex-col min-w-0" id="stats-panel-layout">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-600" />
          <h3 className="text-sm font-semibold text-slate-800">Evolution Trend</h3>
        </div>
        <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
          {bestEverDisplay.label}: {bestEverDisplay.value}
        </span>
      </div>

      <div className="flex items-center justify-center">
        {renderProgressChart()}
      </div>
    </div>
  );
});
