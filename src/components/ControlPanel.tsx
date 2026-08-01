/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { EvolutionGoal, SimulationConfig, CreatureBlueprint } from '../types';
import {
  clampOscillationIgnore,
  oscillationIgnoreDwellTicks,
} from '../physicsConstants';
import { CREATURE_TEMPLATES } from '../templates';
import { isBuiltinTemplate } from '../savedCreatures';
import { CollapsibleSection } from './CollapsibleSection';
import { GoalInfoCard, GoalInfoDialog } from './GoalInfoCard';
import {
  GOAL_CATALOG,
  GOAL_CATEGORY_LABELS,
  GOAL_ORDER,
  GoalCategory,
  getGoalInfo,
} from '../goalCatalog';
import { paraStageLabel } from '../paraPilot';
import { ArenaZoneId, goalsForZone } from '../zones';
import {
  Download,
  Upload,
  HelpCircle,
  Dna,
  Sliders,
  Trash2,
  Info,
  Brain,
} from 'lucide-react';

export type ControlPanelSection =
  | 'left'
  | 'right'
  | 'all'
  | 'creature'
  | 'challenge'
  | 'settings';

interface ControlPanelProps {
  config: SimulationConfig;
  onUpdateConfig: (newConfig: Partial<SimulationConfig>) => void;
  selectedTemplate: CreatureBlueprint;
  onSelectTemplate: (template: CreatureBlueprint) => void;
  onRemoveTemplate?: (templateName: string) => void;
  isRunning: boolean;
  onToggleRun: () => void;
  onManualBreed: () => void;
  onResetSimulation: () => void;
  onExportBestModel: () => void;
  onImportModel: (event: React.ChangeEvent<HTMLInputElement>) => void;
  generation: number;
  templates?: CreatureBlueprint[];
  /** left = creature/goals/run; right = genetics/export/FAQ; all = full panel */
  section?: ControlPanelSection;
  /** Competition freezes breeding; goals/arena stay editable for rematches. */
  competitionMode?: boolean;
  /** Restrict goal picker to the active arena zone */
  zoneId?: ArenaZoneId;
}

const CATEGORY_ORDER: GoalCategory[] = [
  'locomotion',
  'shuffle',
  'jump',
  'flight',
  'climb',
  'object',
  'motor',
  'sports',
  'precision',
  'custom',
];

const goalBtn = (
  active: boolean,
  activeClass: string,
  inactive = 'border-slate-100 bg-slate-50/40 hover:bg-slate-50 text-slate-600'
) =>
  `px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border transition-all cursor-pointer ${
    active ? activeClass : inactive
  }`;

export const ControlPanel: React.FC<ControlPanelProps> = ({
  config,
  onUpdateConfig,
  selectedTemplate,
  onSelectTemplate,
  onRemoveTemplate,
  isRunning,
  onToggleRun,
  onManualBreed,
  onResetSimulation,
  onExportBestModel,
  onImportModel,
  generation,
  templates,
  section = 'all',
  competitionMode = false,
  zoneId = 'free' as ArenaZoneId,
}) => {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  // Repository migration removes persisted duplicates; this final display
  // guard also prevents transient duplicate state from producing repeated
  // buttons or duplicate React keys before the next reload.
  const availableTemplates = useMemo(() => {
    const byName = new Map<string, CreatureBlueprint>();
    for (const template of templates || CREATURE_TEMPLATES) {
      byName.set(template.name, template);
    }
    return [...byName.values()];
  }, [templates]);
  const showCreature = section === 'left' || section === 'all' || section === 'creature';
  const showChallenge = section === 'left' || section === 'all' || section === 'challenge';
  const showSettings = section === 'right' || section === 'all' || section === 'settings';
  const [infoGoal, setInfoGoal] = useState<EvolutionGoal | null>(null);

  const goalsByCategory = useMemo(() => {
    const allowed = new Set(goalsForZone(zoneId));
    const map = new Map<GoalCategory, EvolutionGoal[]>();
    for (const cat of CATEGORY_ORDER) map.set(cat, []);
    for (const goal of GOAL_ORDER) {
      if (!allowed.has(goal)) continue;
      const cat = GOAL_CATALOG[goal].category;
      map.get(cat)!.push(goal);
    }
    return map;
  }, [zoneId]);

  const handleImportClick = () => fileInputRef.current?.click();
  const selectedInfo = getGoalInfo(config.goal);

  return (
    <div
      className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-sm flex flex-col gap-2"
      id={`control-panel-${section}`}
    >
      {showCreature && (
        <>
          {competitionMode && (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-2 text-[10px] font-semibold text-indigo-800 leading-snug">
              Competition mode — brains are frozen. Change the goal or arena below, then Rematch from Finished Models.
            </div>
          )}
          <CollapsibleSection
            title="Creature Anatomy"
            icon={<Dna className="w-3.5 h-3.5" />}
            summary={competitionMode ? 'Locked (compete)' : selectedTemplate.name}
            defaultOpen={false}
          >
            <div className="grid grid-cols-2 gap-1.5">
              {availableTemplates.map(template => {
                const isSelected = template.name === selectedTemplate.name;
                const canDelete = availableTemplates.length > 1;
                return (
                  <div key={template.name} className="relative group">
                    <button
                      type="button"
                      onClick={() => onSelectTemplate(template)}
                      disabled={competitionMode}
                      className={`w-full px-2 py-1.5 text-[11px] font-semibold rounded-lg border text-center transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-50/60 text-indigo-800 shadow-sm pr-5'
                          : 'border-slate-100 bg-slate-50/50 hover:bg-slate-50 text-slate-600'
                      }`}
                    >
                      {template.name}
                    </button>
                    {canDelete && onRemoveTemplate && !isBuiltinTemplate(template.name) && (
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          onRemoveTemplate(template.name);
                        }}
                        title={`Remove ${template.name}`}
                        className="absolute top-1/2 -translate-y-1/2 right-1 text-slate-400 hover:text-red-600 p-0.5 rounded-full opacity-0 group-hover:opacity-100 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Model Storage"
            icon={<Download className="w-3.5 h-3.5" />}
            summary="Import / Export"
            defaultOpen={false}
          >
            <div className="flex items-center gap-2">
              <button
                onClick={onExportBestModel}
                className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-[11px] font-bold text-slate-700 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" /> Export
              </button>
              <button
                onClick={handleImportClick}
                className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-[11px] font-bold text-slate-700 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-slate-500" /> Import
              </button>
              <input ref={fileInputRef} type="file" accept=".json" onChange={onImportModel} className="hidden" />
            </div>
          </CollapsibleSection>
        </>
      )}

      {showChallenge && (
        <>
          <CollapsibleSection
            title="Target Goal"
            icon={<Sliders className="w-3.5 h-3.5" />}
            summary={
              config.goal === EvolutionGoal.PARA_RAMP_GLIDE
                ? `${selectedInfo.shortLabel} · ${paraStageLabel(config.paraPilotStage ?? 'runUp')}`
                : selectedInfo.shortLabel
            }
            defaultOpen
          >
            {config.goal === EvolutionGoal.PARA_RAMP_GLIDE && (
              <div className="mb-2 flex items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-900">
                <Brain className="w-3.5 h-3.5 shrink-0" />
                {paraStageLabel(config.paraPilotStage ?? 'runUp')}
                <span className="ml-auto text-[10px] font-medium text-indigo-600">
                  Heads: run-up → deploy → glide
                </span>
              </div>
            )}
            <div className="space-y-1.5">
              {CATEGORY_ORDER.map(category => {
                const goals = goalsByCategory.get(category) || [];
                if (goals.length === 0) return null;
                const containsActive = goals.includes(config.goal);
                const activeInCat = containsActive
                  ? GOAL_CATALOG[config.goal].shortLabel
                  : `${goals.length} goals`;
                return (
                  <CollapsibleSection
                    key={category}
                    title={GOAL_CATEGORY_LABELS[category]}
                    summary={activeInCat}
                    defaultOpen={containsActive}
                    className="border-slate-100/90 shadow-none"
                  >
                    <div className="grid grid-cols-2 gap-1.5">
                      {goals.map(goal => {
                        const info = GOAL_CATALOG[goal];
                        const active = config.goal === goal;
                        return (
                          <div key={goal} className="relative group">
                            <button
                              type="button"
                              onClick={() => onUpdateConfig({ goal })}
                              className={`${goalBtn(active, info.activeClass)} w-full pr-7`}
                            >
                              {info.shortLabel}
                            </button>
                            <button
                              type="button"
                              title={`About ${info.title}`}
                              onClick={e => {
                                e.stopPropagation();
                                setInfoGoal(goal);
                              }}
                              className="absolute top-1/2 -translate-y-1/2 right-1 rounded-md p-0.5 text-slate-400 hover:text-indigo-600 hover:bg-white/80 cursor-pointer"
                            >
                              <Info className="w-3 h-3" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </CollapsibleSection>
                );
              })}
            </div>

            <GoalInfoCard
              goal={config.goal}
              compact
              onOpenDetails={() => setInfoGoal(config.goal)}
            />
          </CollapsibleSection>

          {/* Run controls live on the visualizer overlay — not duplicated here */}
        </>
      )}

      {showSettings && (
        <>
          <CollapsibleSection
            title="Evolution & Physics Tuning"
            icon={<Sliders className="w-3.5 h-3.5" />}
            summary={
              competitionMode
                ? 'Frozen brains'
                : `Pop ${config.populationSize} · Mut ${(config.mutationRate * 100).toFixed(0)}%`
            }
            defaultOpen
          >
            {competitionMode ? (
              <div className="flex flex-col gap-3">
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Population genetics are paused. Change the active goal/arena and Rematch to compare
                  the same finished models under new conditions.
                </p>
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between text-[11px] font-semibold text-slate-700">
                    <span>Match Length</span>
                    <span className="text-indigo-600">{config.generationDuration}s</span>
                  </div>
                  <input
                    aria-label="Match Length"
                    type="range"
                    min={10}
                    max={300}
                    step={1}
                    value={config.generationDuration}
                    onChange={e => onUpdateConfig({ generationDuration: parseFloat(e.target.value) })}
                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                </div>
              </div>
            ) : (
            <div className="grid grid-cols-1 gap-3">
              {[
                { label: 'Population Size', value: `${config.populationSize}`, min: 5, max: 40, step: 5, current: config.populationSize, onChange: (v: number) => onUpdateConfig({ populationSize: v }) },
                { label: 'Generation Length', value: `${config.generationDuration}s`, min: 10, max: 300, step: 1, current: config.generationDuration, onChange: (v: number) => onUpdateConfig({ generationDuration: v }) },
                { label: 'Weight Mutation', value: `${(config.mutationRate * 100).toFixed(0)}%`, min: 0.05, max: 0.5, step: 0.05, current: config.mutationRate, onChange: (v: number) => onUpdateConfig({ mutationRate: v }) },
                { label: 'Ground Friction', value: `${(config.groundFriction * 100).toFixed(0)}%`, min: 0.2, max: 0.95, step: 0.05, current: config.groundFriction, onChange: (v: number) => onUpdateConfig({ groundFriction: v }) },
                { label: 'Gravity', value: `${(config.gravity ?? 0.4).toFixed(2)} g`, min: 0, max: 1.2, step: 0.05, current: config.gravity ?? 0.4, onChange: (v: number) => onUpdateConfig({ gravity: v }) },
                { label: 'Add Connection', value: `${(config.addConnectionRate * 100).toFixed(0)}%`, min: 0, max: 0.5, step: 0.01, current: config.addConnectionRate, onChange: (v: number) => onUpdateConfig({ addConnectionRate: v }) },
                { label: 'Add Node', value: `${(config.addNodeRate * 100).toFixed(0)}%`, min: 0, max: 0.3, step: 0.01, current: config.addNodeRate, onChange: (v: number) => onUpdateConfig({ addNodeRate: v }) },
              ].map(slider => (
                <div key={slider.label} className="flex flex-col gap-1">
                  <div className="flex justify-between text-[11px] font-semibold text-slate-700">
                    <span>{slider.label}</span>
                    <span className="text-indigo-600">{slider.value}</span>
                  </div>
                  <input
                    aria-label={slider.label}
                    type="range"
                    min={slider.min}
                    max={slider.max}
                    step={slider.step}
                    value={slider.current}
                    onChange={e => slider.onChange(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                </div>
              ))}
              {(() => {
                const ignore = clampOscillationIgnore(config.oscillationIgnore);
                const dwell = oscillationIgnoreDwellTicks(ignore);
                return (
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-[11px] font-semibold text-slate-700">
                      <span>Ignore Oscillations</span>
                      <span className="text-indigo-600">
                        {ignore <= 0
                          ? 'Off'
                          : `${(ignore * 100).toFixed(0)}% · ${dwell} tick min`}
                      </span>
                    </div>
                    <input
                      aria-label="Ignore Oscillations"
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={ignore}
                      onChange={e =>
                        onUpdateConfig({
                          oscillationIgnore: clampOscillationIgnore(parseFloat(e.target.value)),
                        })
                      }
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                    <p className="text-[10px] text-slate-500 leading-relaxed font-medium">
                      Rejects brain muscle reversals faster than the dwell. Buzz cannot move the
                      body or earn travel rewards. Off = legacy. Raise to find the sweet spot.
                    </p>
                  </div>
                );
              })()}
            </div>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            title="Physics & NEAT"
            icon={<HelpCircle className="w-3.5 h-3.5" />}
            summary="How it works"
            defaultOpen={false}
          >
            <div className="text-[11px] text-slate-600 space-y-2 leading-relaxed">
              <p>
                <strong>NEAT:</strong> Each creature has a neural brain from sensors to muscles. Mutations change weights, add links, or spawn hidden neurons.
              </p>
              <p>
                <strong>Sensors:</strong> Sin/cos rhythm, node offsets from COM, and ground contact flags.
              </p>
              <p>
                <strong>Actuators:</strong> Flexible muscles stretch/contract; motor wheels get a drive command only while grounded.
              </p>
              <p>
                <strong>Ignore Oscillations:</strong> When raised, muscle commands must keep the same
                stroke direction for a minimum dwell before reversing — high-frequency buzz is held
                still so it cannot scoot the body or score travel.
              </p>
              <p>
                <strong>Physics:</strong> Verlet point-spring constraints with gravity, friction, and obstacles.
              </p>
            </div>
          </CollapsibleSection>
        </>
      )}

      <GoalInfoDialog
        goal={infoGoal ?? config.goal}
        open={infoGoal !== null}
        onClose={() => setInfoGoal(null)}
      />
    </div>
  );
};
