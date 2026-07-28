/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Creature, isBrainDrivenMuscle } from '../types';
import { Activity } from 'lucide-react';

interface GaitFingerprintsProps {
  creature: Creature | null;
}

export const GaitFingerprints: React.FC<GaitFingerprintsProps> = ({ creature }) => {
  if (!creature || !creature.gaitHistory || creature.gaitHistory.length === 0) {
    return (
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm" id="gait-fingerprints">
        <div className="flex items-center gap-2 mb-2">
          <Activity className="w-4 h-4 text-teal-600" />
          <h3 className="text-sm font-bold text-slate-800">Gait fingerprints</h3>
        </div>
        <p className="text-xs text-slate-400">Run the simulation to capture muscle contraction traces.</p>
      </div>
    );
  }

  const width = 280;
  const rowH = 28;

  return (
    <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm" id="gait-fingerprints">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="w-4 h-4 text-teal-600" />
        <h3 className="text-sm font-bold text-slate-800">Gait fingerprints</h3>
      </div>
      <p className="text-[10px] text-slate-400 mb-3">
        Each sparkline is muscle length ÷ rest length over recent frames. Bones are skipped.
      </p>
      <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
        {creature.muscles.map((muscle, idx) => {
          if (!isBrainDrivenMuscle(muscle, creature.muscles)) return null;
          const series = creature.gaitHistory?.[idx] || [];
          if (series.length < 2) return null;

          const min = Math.min(...series, 0.5);
          const max = Math.max(...series, 1.5);
          const range = max - min || 1;
          const points = series
            .map((v, i) => {
              const x = (i / (series.length - 1)) * (width - 8) + 4;
              const y = rowH - 4 - ((v - min) / range) * (rowH - 8);
              return `${x},${y}`;
            })
            .join(' ');

          const latest = series[series.length - 1];
          const hue = latest < 0.95 ? 190 : latest > 1.05 ? 20 : 150;

          return (
            <div key={muscle.id} className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-500 w-14 shrink-0">M{muscle.id}</span>
              <svg width={width} height={rowH} className="flex-1 bg-slate-50 rounded border border-slate-100">
                <polyline
                  fill="none"
                  stroke={`hsl(${hue} 70% 40%)`}
                  strokeWidth="1.5"
                  points={points}
                />
                <line
                  x1="4"
                  x2={width - 4}
                  y1={rowH - 4 - ((1 - min) / range) * (rowH - 8)}
                  y2={rowH - 4 - ((1 - min) / range) * (rowH - 8)}
                  stroke="#cbd5e1"
                  strokeDasharray="3 3"
                  strokeWidth="1"
                />
              </svg>
              <span className="text-[10px] font-mono text-slate-500 w-10 text-right">
                {latest.toFixed(2)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
