/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EvolutionGoal, SimulationConfig } from '../types';
import { Wind, Snowflake, Mountain, RefreshCw, Triangle, Minus } from 'lucide-react';
import { CollapsibleSection } from './CollapsibleSection';
import {
  clampDifficulty,
  clampGapWidthPx,
  clampRampAngleDeg,
  clampRampWidthPx,
  BASE_GAP_WIDTH,
  BASE_RAMP_WIDTH,
  DEFAULT_RAMP_ANGLE_DEG,
  clampTowerHeightPx,
  MIN_TOWER_HEIGHT,
  MAX_TOWER_HEIGHT,
  BASE_TOWER_HEIGHT,
} from '../physicsConstants';
import { ArenaZoneId, ARENA_ZONES } from '../zones';

interface ArenaModifiersPanelProps {
  config: SimulationConfig;
  onUpdateConfig: (partial: Partial<SimulationConfig>) => void;
  zoneId?: ArenaZoneId;
  /** When true, section starts expanded (Run tab default). */
  defaultOpen?: boolean;
}

export const ArenaModifiersPanel: React.FC<ArenaModifiersPanelProps> = ({
  config,
  onUpdateConfig,
  zoneId = 'free' as ArenaZoneId,
  defaultOpen = true,
}) => {
  const zoneRules = ARENA_ZONES[zoneId].arena;

  const updateArena = (partial: Partial<SimulationConfig['arena']>) => {
    onUpdateConfig({ arena: { ...config.arena, ...partial } });
  };

  return (
    <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-sm" id="arena-modifiers-panel">
      <CollapsibleSection
        title="Arena modifiers"
        icon={<Wind className="w-3.5 h-3.5" />}
        summary={[
          config.arena.terrainEnabled && 'Terrain',
          config.arena.terrainObstaclesEnabled && 'Rocks',
          config.arena.windEnabled && 'Wind',
          config.arena.iceEnabled && 'Ice',
          config.arena.rampEnabled && 'Ramp',
          config.arena.pitEnabled && 'Pit',
          `Gap ${clampGapWidthPx(config.arena.gapWidthPx)}`,
          `Ramp ${clampRampWidthPx(config.arena.rampWidthPx)}`,
          `${clampRampAngleDeg(config.arena.rampAngleDeg)}°`,
          config.arena.progressiveTier > 0 && `Tier ${config.arena.progressiveTier}`,
          `Diff ${clampDifficulty(config.arena.difficulty).toFixed(2)}`,
        ]
          .filter(Boolean)
          .join(' · ')}
        defaultOpen={defaultOpen}
      >
        <div className="flex flex-wrap gap-1.5">
          {zoneRules.terrain && (
            <button
              type="button"
              onClick={() => {
                const next = !config.arena.terrainEnabled;
                updateArena({
                  terrainEnabled: next,
                  ...(next
                    ? { terrainSeed: (Math.random() * 1e9) | 0 }
                    : { terrainObstaclesEnabled: false }),
                });
              }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border cursor-pointer ${
                config.arena.terrainEnabled || config.goal === EvolutionGoal.MOTOR_LOOP
                  ? 'bg-emerald-50 border-emerald-400 text-emerald-900'
                  : 'bg-slate-50 border-slate-200 text-slate-600'
              }`}
              title="Endless procedural hills and valleys — works with any goal/body"
            >
              <Mountain className="w-3 h-3" /> Terrain
            </button>
          )}
          {zoneRules.terrain &&
            (config.arena.terrainEnabled || config.goal === EvolutionGoal.MOTOR_LOOP) && (
            <>
              <button
                type="button"
                onClick={() =>
                  updateArena({ terrainObstaclesEnabled: !config.arena.terrainObstaclesEnabled })
                }
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border cursor-pointer ${
                  config.arena.terrainObstaclesEnabled
                    ? 'bg-stone-100 border-stone-500 text-stone-900'
                    : 'bg-slate-50 border-slate-200 text-slate-600'
                }`}
                title="Scatter rocks/boulders across the whole terrain (denser & larger at higher difficulty)"
              >
                Obstacles
              </button>
              <button
                type="button"
                onClick={() => updateArena({ terrainSeed: (Math.random() * 1e9) | 0 })}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 cursor-pointer"
                title="Reseed procedural terrain"
              >
                <RefreshCw className="w-3 h-3" /> Reseed
              </button>
            </>
          )}
          {zoneRules.wind && (
            <button
              type="button"
              onClick={() => updateArena({ windEnabled: !config.arena.windEnabled })}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border cursor-pointer ${
                config.arena.windEnabled
                  ? 'bg-sky-50 border-sky-400 text-sky-800'
                  : 'bg-slate-50 border-slate-200 text-slate-600'
              }`}
            >
              <Wind className="w-3 h-3" /> Wind
            </button>
          )}
          {zoneRules.ice && (
            <button
              type="button"
              onClick={() => updateArena({ iceEnabled: !config.arena.iceEnabled })}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border cursor-pointer ${
                config.arena.iceEnabled
                  ? 'bg-cyan-50 border-cyan-400 text-cyan-800'
                  : 'bg-slate-50 border-slate-200 text-slate-600'
              }`}
            >
              <Snowflake className="w-3 h-3" /> Ice
            </button>
          )}
          {zoneRules.ramp && (
            <button
              type="button"
              onClick={() => updateArena({ rampEnabled: !config.arena.rampEnabled })}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border cursor-pointer ${
                config.arena.rampEnabled
                  ? 'bg-amber-50 border-amber-400 text-amber-900'
                  : 'bg-slate-50 border-slate-200 text-slate-600'
              }`}
              title="Add a user ramp to any course (does not trigger ParaPilot run-up/deploy/glide)"
            >
              <Triangle className="w-3 h-3" /> Ramp
            </button>
          )}
          {zoneRules.pit && (
            <button
              type="button"
              onClick={() => updateArena({ pitEnabled: !config.arena.pitEnabled })}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border cursor-pointer ${
                config.arena.pitEnabled
                  ? 'bg-rose-50 border-rose-400 text-rose-900'
                  : 'bg-slate-50 border-slate-200 text-slate-600'
              }`}
              title="Add a user pit/gap to any course"
            >
              <Minus className="w-3 h-3" /> Pit
            </button>
          )}
          {!zoneRules.terrain &&
            !zoneRules.wind &&
            !zoneRules.ice &&
            !zoneRules.ramp &&
            !zoneRules.pit && (
              <p className="text-[10px] text-slate-500 font-medium">
                This zone uses a flat floor — optional modifiers are locked.
              </p>
            )}
        </div>
        {(zoneRules.pit || zoneRules.ramp) && (
        <div className="flex items-center gap-2 text-[11px] text-slate-600 mt-2">
          <span className="font-semibold shrink-0">Gap width</span>
          <input
            type="range"
            min={120}
            max={1800}
            step={12}
            value={clampGapWidthPx(config.arena.gapWidthPx ?? BASE_GAP_WIDTH)}
            onChange={e => updateArena({ gapWidthPx: parseInt(e.target.value, 10) })}
            className="flex-1 accent-rose-600"
            title="Widens goal pits and optional user pits"
          />
          <span className="tabular-nums w-10">
            {clampGapWidthPx(config.arena.gapWidthPx ?? BASE_GAP_WIDTH)}
          </span>
        </div>
        )}
        {zoneRules.ramp && (
        <div className="flex items-center gap-2 text-[11px] text-slate-600 mt-2">
          <span className="font-semibold shrink-0">Ramp length</span>
          <input
            type="range"
            min={BASE_RAMP_WIDTH}
            max={BASE_RAMP_WIDTH * 10}
            step={12}
            value={clampRampWidthPx(config.arena.rampWidthPx ?? BASE_RAMP_WIDTH)}
            onChange={e => updateArena({ rampWidthPx: parseInt(e.target.value, 10) })}
            className="flex-1 accent-amber-600"
            title="Horizontal run length for user and goal ramps (Para TAKEOFF included); min = current default, max = 10×"
          />
          <span className="tabular-nums w-12">
            {clampRampWidthPx(config.arena.rampWidthPx ?? BASE_RAMP_WIDTH)}
          </span>
        </div>
        )}
        {zoneRules.ramp && (
        <div className="flex items-center gap-2 text-[11px] text-slate-600 mt-2">
          <span className="font-semibold shrink-0">Ramp angle</span>
          <input
            type="range"
            min={8}
            max={55}
            step={1}
            value={clampRampAngleDeg(config.arena.rampAngleDeg ?? DEFAULT_RAMP_ANGLE_DEG)}
            onChange={e => updateArena({ rampAngleDeg: parseInt(e.target.value, 10) })}
            className="flex-1 accent-amber-600"
            title="Ground angle for user and goal ramps (Para TAKEOFF included)"
          />
          <span className="tabular-nums w-8">
            {clampRampAngleDeg(config.arena.rampAngleDeg ?? DEFAULT_RAMP_ANGLE_DEG)}°
          </span>
        </div>
        )}
        {config.goal === EvolutionGoal.CHUTE_DESCENT && (
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600 mt-2">
          <span className="font-semibold shrink-0">Tower height</span>
          <input
            type="range"
            min={MIN_TOWER_HEIGHT}
            max={MAX_TOWER_HEIGHT}
            step={50}
            value={clampTowerHeightPx(config.arena.towerHeightPx ?? BASE_TOWER_HEIGHT)}
            onChange={e => updateArena({ towerHeightPx: parseInt(e.target.value, 10) })}
            className="min-w-32 flex-1 accent-cyan-600"
            title="Launch platform height for Chute Descent — creatures spawn at the top"
          />
          <input
            type="number"
            min={MIN_TOWER_HEIGHT}
            max={MAX_TOWER_HEIGHT}
            step={50}
            value={clampTowerHeightPx(config.arena.towerHeightPx ?? BASE_TOWER_HEIGHT)}
            onChange={e => updateArena({ towerHeightPx: clampTowerHeightPx(parseInt(e.target.value, 10) || MIN_TOWER_HEIGHT) })}
            className="w-24 rounded border px-1.5 py-0.5 tabular-nums text-right"
            aria-label="Tower height in pixels"
          />
          <span className="tabular-nums text-slate-500">px (max {MAX_TOWER_HEIGHT.toLocaleString()})</span>
        </div>
        )}
        <div className="flex items-center gap-2 text-[11px] text-slate-600 mt-2">
          <span className="font-semibold shrink-0">Difficulty</span>
          <input
            type="range"
            min="0.75"
            max="2.5"
            step="0.05"
            value={clampDifficulty(config.arena.difficulty)}
            onChange={e => updateArena({ difficulty: parseFloat(e.target.value) })}
            className="flex-1 accent-amber-600"
            title="Scales gap width, hurdle/bar height, stair rise, finish distance, and terrain rock density"
          />
          <span className="tabular-nums w-8">{clampDifficulty(config.arena.difficulty).toFixed(2)}</span>
        </div>
        <p className="text-[10px] text-slate-400 mt-1 leading-snug">
          Objects/gaps use 3× width and ½ depth. Beating a limit (gap, bar, finish, challenge target)
          raises the next tier automatically. Ramp + Pit work on any goal; ParaPilot phases stay on
          Para Ramp only.
        </p>
        {config.arena.windEnabled && (
          <div className="flex items-center gap-2 text-[11px] text-slate-600 mt-2">
            <span className="font-semibold">Gust</span>
            <input
              type="range"
              min="0.02"
              max="0.35"
              step="0.01"
              value={config.arena.windStrength}
              onChange={e => updateArena({ windStrength: parseFloat(e.target.value) })}
              className="flex-1 accent-sky-600"
            />
            <span className="tabular-nums w-8">{config.arena.windStrength.toFixed(2)}</span>
          </div>
        )}
      </CollapsibleSection>
    </div>
  );
};
